import { useEffect, useRef } from "react";
import { Control, useWatch, UseFormReset } from "react-hook-form";

/**
 * Adapter interface for integrating with router/query parameter libraries
 */
export interface RouterAdapter {
  searchParams: URLSearchParams; // Current search parameters from the URL
  setSearchParams: (params: URLSearchParams) => void; // Method to update the search parameters in the URL
}

/**
 * Options for the useSyncUrl hook
 */
interface UseSyncUrlOptions<T = Record<string, unknown>> {
  control: Control<T>; // react-hook-form's control object
  reset: UseFormReset<T>; // react-hook-form's reset function
  adapter: RouterAdapter; // Adapter implementation for accessing and mutating search params
  debounce?: number; // Time in ms to debounce URL updates (default: 500)
  maxUrlLength?: number; // Maximum URL length before truncation (default: 2000)
  excludeFields?: string[]; // Field names to exclude from URL sync (for sensitive data)
}

// Maximum safe URL length (browsers typically support 2000-8000 chars, but 2000 is safer)
const DEFAULT_MAX_URL_LENGTH = 2000;

// Common sensitive field names that should trigger warnings in development
const SENSITIVE_FIELD_PATTERNS = [
  'password',
  'pwd',
  'pass',
  'secret',
  'token',
  'apiKey',
  'apikey',
  'auth',
  'credential',
  'ssn',
  'socialSecurity',
  'creditCard',
  'cardNumber',
  'cvv',
  'cvc',
  'pin',
  'ssn',
  'sin',
  'accountNumber',
  'routingNumber',
  'bankAccount',
];

/**
 * Check if a field name matches sensitive patterns and warn in development
 */
function warnIfSensitiveField(fieldName: string, excludeFields?: string[]): void {
  // Only warn in development
  if (process.env.NODE_ENV !== 'development') {
    return;
  }

  // Skip if already excluded
  if (excludeFields?.includes(fieldName)) {
    return;
  }

  const lowerFieldName = fieldName.toLowerCase();
  const isSensitive = SENSITIVE_FIELD_PATTERNS.some((pattern) =>
    lowerFieldName.includes(pattern.toLowerCase())
  );

  if (isSensitive) {
    console.warn(
      `[rhf-sync-url] Warning: Field "${fieldName}" may contain sensitive data. ` +
        `Consider adding it to the excludeFields option to prevent it from being synced to the URL. ` +
        `URLs are visible in browser history, server logs, and can be easily shared.`
    );
  }
}

/**
 * Safely parse JSON with validation and prototype pollution protection
 * Returns unknown to force type checking at call sites
 */
function safeJsonParse(value: string): unknown {
  try {
    const parsed: unknown = JSON.parse(value);
    // Validate that parsed value is a primitive, array, or plain object
    // Reject functions, dates, regexp, etc. that could cause issues
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      Object.prototype.toString.call(parsed) !== "[object Object]"
    ) {
      // Reject non-plain objects (Date, RegExp, etc.)
      return value;
    }
    
    // Protect against prototype pollution: remove dangerous keys from objects
    if (
      parsed !== null &&
      typeof parsed === "object" &&
      !Array.isArray(parsed) &&
      Object.prototype.toString.call(parsed) === "[object Object]"
    ) {
      const obj = parsed as Record<string, unknown>;
      // Check if dangerous keys exist as own properties (not inherited)
      const hasDangerousKeys =
        Object.prototype.hasOwnProperty.call(obj, "__proto__") ||
        Object.prototype.hasOwnProperty.call(obj, "constructor") ||
        Object.prototype.hasOwnProperty.call(obj, "prototype");
      
      if (hasDangerousKeys) {
        const sanitized: Record<string, unknown> = {};
        for (const key in obj) {
          // Skip dangerous keys that could lead to prototype pollution
          // Only check own properties to avoid false positives
          if (
            Object.prototype.hasOwnProperty.call(obj, key) &&
            key !== "__proto__" &&
            key !== "constructor" &&
            key !== "prototype"
          ) {
            sanitized[key] = obj[key];
          }
        }
        return sanitized;
      }
    }
    
    return parsed;
  } catch {
    return value;
  }
}

/**
 * Safely serialize a value to string for URL
 * Accepts unknown to require type checking
 */
function safeSerialize(value: unknown): string {
  // Handle null explicitly (typeof null === "object" in JS)
  if (value === null) {
    return "";
  }

  // Handle primitives
  if (typeof value !== "object") {
    return String(value);
  }

  // Handle arrays
  if (Array.isArray(value)) {
    try {
      return JSON.stringify(value);
    } catch (error) {
      // Handle circular references or other serialization errors
      console.warn("Failed to serialize array to URL:", error);
      return "";
    }
  }

  // Handle plain objects only (exclude Date, RegExp, etc.)
  if (Object.prototype.toString.call(value) === "[object Object]") {
    try {
      return JSON.stringify(value);
    } catch (error) {
      // Handle circular references or other serialization errors
      console.warn("Failed to serialize object to URL:", error);
      return "";
    }
  }

  // For other object types (Date, RegExp, etc.), convert to string
  return String(value);
}

/**
 * Convert URLSearchParams to a stable string representation for comparison
 */
function searchParamsToString(params: URLSearchParams): string {
  return params.toString();
}

/**
 * React hook to synchronize React Hook Form state with the URL's query parameters.
 * Provides bidirectional sync: URL → Form on mount and URL changes, Form → URL on form changes.
 */
export function useSyncUrl<T = Record<string, unknown>>({
  control,
  reset,
  adapter,
  debounce = 500,
  maxUrlLength = DEFAULT_MAX_URL_LENGTH,
  excludeFields = [],
}: UseSyncUrlOptions<T>) {
  // Track if it's the initial render
  const firstRender = useRef(true);
  // Store timeout reference for debouncing URL updates
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);
  // Track the last URL state to detect external changes (browser navigation, etc.)
  const lastUrlParamsRef = useRef<string>("");
  // Track if we're currently updating from URL to prevent infinite loops
  const isUpdatingFromUrlRef = useRef(false);

  // Get the current values from react-hook-form
  const values = useWatch({ control });

  // Effect to restore form values from URL query parameters (bidirectional sync)
  useEffect(() => {
    const currentUrlParams = searchParamsToString(adapter.searchParams);

    // Skip if URL hasn't changed (except on first render)
    if (!firstRender.current && currentUrlParams === lastUrlParamsRef.current) {
      return;
    }

    // Update the ref to track current URL state
    lastUrlParamsRef.current = currentUrlParams;

    const params = adapter.searchParams;
    const restoredValues: Record<string, unknown> = {};

    // Rehydrate values from searchParams with safe JSON parsing
    // Skip excluded fields (they shouldn't be in URL, but if they are, ignore them)
    params.forEach((value, key) => {
      // Skip excluded fields
      if (excludeFields.includes(key)) {
        return;
      }
      if (value) {
        restoredValues[key] = safeJsonParse(value);
      }
    });

    // If any values are present in the query, reset the form to those values
    // Note: reset() will merge with defaultValues, so excluded fields will keep their defaults
    if (Object.keys(restoredValues).length > 0) {
      isUpdatingFromUrlRef.current = true;
      reset(restoredValues as T);
      // Reset flag after a microtask to allow form to update
      Promise.resolve().then(() => {
        isUpdatingFromUrlRef.current = false;
      });
    } else if (firstRender.current) {
      // On first render with no URL params, mark as complete
      firstRender.current = false;
    }

    if (firstRender.current) {
      firstRender.current = false;
    }
  }, [adapter.searchParams, reset, excludeFields]);

  // Effect to update URL query parameters when form state changes (after initial render)
  useEffect(() => {
    // Skip if we're updating from URL to prevent infinite loops
    if (isUpdatingFromUrlRef.current || firstRender.current) {
      return;
    }

    // Clear the previous debounce timeout, if any
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }

    // Set new timeout to debounce URL updates
    timeoutRef.current = setTimeout(() => {
      // Clone existing searchParams to preserve unrelated params
      const newParams = new URLSearchParams(adapter.searchParams);

      // First, remove all excluded fields from URL (in case they exist from before)
      excludeFields.forEach((field) => {
        newParams.delete(field);
      });

      // Iterate over form values and update corresponding params
      Object.entries(values || {}).forEach(([key, value]) => {
        // Skip excluded fields - never sync sensitive data to URL
        if (excludeFields.includes(key)) {
          return;
        }

        // Warn in development if field name suggests sensitive data
        warnIfSensitiveField(key, excludeFields);

        if (value === undefined || value === null || value === "") {
          // Remove parameter if the value is empty or undefined
          newParams.delete(key);
        } else {
          // Serialize value safely
          const stringValue = safeSerialize(value);
          if (stringValue) {
            newParams.set(key, stringValue);
          } else {
            newParams.delete(key);
          }
        }
      });

      // Check URL length and warn if too long
      const urlString = newParams.toString();
      if (urlString.length > maxUrlLength) {
        console.warn(
          `URL length (${urlString.length}) exceeds maximum (${maxUrlLength}). Consider reducing form data size.`
        );
      }

      // Only update if URL actually changed to prevent unnecessary updates
      const newUrlString = searchParamsToString(newParams);
      if (newUrlString !== lastUrlParamsRef.current) {
        lastUrlParamsRef.current = newUrlString;
        adapter.setSearchParams(newParams);
      }
    }, debounce);

    // Cleanup function to clear timeout on effect re-run/unmount
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
    };
  }, [values, adapter, debounce, maxUrlLength, excludeFields]);
}
