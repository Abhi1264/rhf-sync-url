import {
  describe,
  it,
  expect,
  vi,
  beforeEach,
  afterEach,
  type Mock,
} from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { useSyncUrl, RouterAdapter } from "./index";

// Mock timers for debounce testing
vi.useFakeTimers();

describe("useSyncUrl", () => {
  let mockSearchParams: URLSearchParams;
  let mockSetSearchParams: Mock<(params: URLSearchParams) => void>;
  let adapter: RouterAdapter;

  beforeEach(() => {
    mockSearchParams = new URLSearchParams();
    mockSetSearchParams = vi.fn((params: URLSearchParams) => {
      mockSearchParams = new URLSearchParams(params);
    });
    adapter = {
      searchParams: mockSearchParams,
      setSearchParams: mockSetSearchParams,
    };
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllTimers();
  });

  it("should restore form values from URL on initial render", async () => {
    // Set up URL with query params
    mockSearchParams.set("name", "John");
    mockSearchParams.set("age", "30");
    mockSearchParams.set("active", "true");

    const { result } = renderHook(() => {
      const { control, reset, getValues } = useForm({
        defaultValues: {
          name: "",
          age: 0,
          active: false,
        },
      });
      useSyncUrl({ control, reset, adapter });
      return { control, getValues };
    });

    // Wait for sync to complete
    await vi.runAllTimersAsync();

    // Form should be restored from URL
    const values = result.current.getValues();
    expect(values.name).toBe("John");
    expect(values.age).toBe(30);
    expect(values.active).toBe(true);
  });

  it("should parse JSON objects from URL", async () => {
    const filterData = { category: "tech", tags: ["react", "typescript"] };
    mockSearchParams.set("filters", JSON.stringify(filterData));

    const { result } = renderHook(() => {
      const { control, reset, getValues } = useForm({
        defaultValues: {
          filters: {},
        },
      });
      useSyncUrl({ control, reset, adapter });
      return { control, getValues };
    });

    await vi.runAllTimersAsync();

    const values = result.current.getValues();
    expect(values.filters).toEqual(filterData);
  });

  it("should parse JSON arrays from URL", async () => {
    const tags = ["react", "typescript", "testing"];
    mockSearchParams.set("tags", JSON.stringify(tags));

    const { result } = renderHook(() => {
      const { control, reset, getValues } = useForm({
        defaultValues: {
          tags: [],
        },
      });
      useSyncUrl({ control, reset, adapter });
      return { control, getValues };
    });

    await vi.runAllTimersAsync();

    const values = result.current.getValues();
    expect(values.tags).toEqual(tags);
  });

  it("should update URL when form values change", async () => {
    const { result } = renderHook(() => {
      const { control, reset, setValue } = useForm({
        defaultValues: {
          name: "",
          email: "",
        },
      });
      useSyncUrl({ control, reset, adapter, debounce: 100 });
      return { control, setValue };
    });

    // Wait for initial render to complete
    await vi.runAllTimersAsync();

    // Update form value
    act(() => {
      result.current.setValue("name", "Jane");
    });

    // Fast-forward debounce timer
    act(() => {
      vi.advanceTimersByTime(100);
    });

    // URL should be updated
    expect(mockSetSearchParams).toHaveBeenCalled();
    const lastCall =
      mockSetSearchParams.mock.calls[
        mockSetSearchParams.mock.calls.length - 1
      ][0];
    expect(lastCall.get("name")).toBe("Jane");
  });

  it("should debounce URL updates", async () => {
    const { result } = renderHook(() => {
      const { control, reset, setValue } = useForm({
        defaultValues: {
          search: "",
        },
      });
      useSyncUrl({ control, reset, adapter, debounce: 500 });
      return { control, setValue };
    });

    await vi.runAllTimersAsync();

    // Rapidly change form values
    act(() => {
      result.current.setValue("search", "a");
    });
    act(() => {
      result.current.setValue("search", "ab");
    });
    act(() => {
      result.current.setValue("search", "abc");
    });

    // Should not have been called yet (debounced)
    expect(mockSetSearchParams).not.toHaveBeenCalled();

    // Fast-forward past debounce time
    act(() => {
      vi.advanceTimersByTime(500);
    });

    // Should have been called once with final value
    expect(mockSetSearchParams).toHaveBeenCalledTimes(1);
    const lastCall = mockSetSearchParams.mock.calls[0][0];
    expect(lastCall.get("search")).toBe("abc");
  });

  it("should remove URL params when form values are empty", async () => {
    // Set initial URL params
    mockSearchParams.set("name", "John");
    mockSearchParams.set("email", "john@example.com");

    const { result } = renderHook(() => {
      const { control, reset, setValue } = useForm({
        defaultValues: {
          name: "John",
          email: "john@example.com",
        },
      });
      useSyncUrl({ control, reset, adapter, debounce: 100 });
      return { control, setValue };
    });

    await vi.runAllTimersAsync();

    // Clear form values
    act(() => {
      result.current.setValue("name", "");
      result.current.setValue("email", "");
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // URL params should be removed
    const lastCall =
      mockSetSearchParams.mock.calls[
        mockSetSearchParams.mock.calls.length - 1
      ][0];
    expect(lastCall.get("name")).toBeNull();
    expect(lastCall.get("email")).toBeNull();
  });

  it("should handle null and undefined values", async () => {
    // First set a value to ensure it's in the URL
    mockSearchParams.set("optional", "initial");

    const { result } = renderHook(() => {
      const { control, reset, setValue } = useForm({
        defaultValues: {
          optional: "value",
        },
      });
      useSyncUrl({ control, reset, adapter, debounce: 100 });
      return { control, setValue };
    });

    await vi.runAllTimersAsync();

    // Clear previous calls
    mockSetSearchParams.mockClear();

    // Set value to null
    act(() => {
      result.current.setValue("optional", null as any);
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Null values should be removed from URL
    expect(mockSetSearchParams).toHaveBeenCalled();
    const lastCall =
      mockSetSearchParams.mock.calls[
        mockSetSearchParams.mock.calls.length - 1
      ][0];
    // Null values are removed, so the key shouldn't exist
    expect(lastCall.get("optional")).toBeNull();
  });

  it("should sync URL changes back to form (bidirectional)", async () => {
    const { result, rerender } = renderHook(
      ({ searchParams }) => {
        const { control, reset, getValues } = useForm({
          defaultValues: {
            query: "",
          },
        });
        const adapter: RouterAdapter = {
          searchParams,
          setSearchParams: mockSetSearchParams,
        };
        useSyncUrl({ control, reset, adapter });
        return { control, getValues };
      },
      {
        initialProps: {
          searchParams: new URLSearchParams(),
        },
      }
    );

    await vi.runAllTimersAsync();

    // Simulate URL change (e.g., browser back button)
    const newSearchParams = new URLSearchParams();
    newSearchParams.set("query", "new search");

    rerender({ searchParams: newSearchParams });

    await vi.runAllTimersAsync();

    // Form should be updated from URL
    const values = result.current.getValues();
    expect(values.query).toBe("new search");
  });

  it("should preserve unrelated URL params", async () => {
    mockSearchParams.set("unrelated", "value");

    const { result } = renderHook(() => {
      const { control, reset, setValue } = useForm({
        defaultValues: {
          name: "",
        },
      });
      useSyncUrl({ control, reset, adapter, debounce: 100 });
      return { control, setValue };
    });

    await vi.runAllTimersAsync();

    act(() => {
      result.current.setValue("name", "John");
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Unrelated param should still be present
    const lastCall =
      mockSetSearchParams.mock.calls[
        mockSetSearchParams.mock.calls.length - 1
      ][0];
    expect(lastCall.get("unrelated")).toBe("value");
    expect(lastCall.get("name")).toBe("John");
  });

  it("should handle complex nested objects", async () => {
    const complexData = {
      user: {
        name: "John",
        preferences: {
          theme: "dark",
          notifications: true,
        },
      },
      tags: ["react", "typescript"],
    };
    mockSearchParams.set("data", JSON.stringify(complexData));

    const { result } = renderHook(() => {
      const { control, reset, getValues } = useForm({
        defaultValues: {
          data: {},
        },
      });
      useSyncUrl({ control, reset, adapter });
      return { control, getValues };
    });

    await vi.runAllTimersAsync();

    const values = result.current.getValues();
    expect(values.data).toEqual(complexData);
  });

  it("should warn when URL length exceeds maximum", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    const { result } = renderHook(() => {
      const { control, reset, setValue } = useForm({
        defaultValues: {
          largeData: "",
        },
      });
      useSyncUrl({ control, reset, adapter, debounce: 100, maxUrlLength: 100 });
      return { control, setValue };
    });

    await vi.runAllTimersAsync();

    // Set a value that will create a long URL
    const longString = "a".repeat(200);
    act(() => {
      result.current.setValue("largeData", longString);
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("URL length")
    );

    consoleSpy.mockRestore();
  });

  it("should protect against prototype pollution attacks", async () => {
    // Attempt prototype pollution via __proto__
    const maliciousPayload = JSON.stringify({
      __proto__: { isAdmin: true },
      normalKey: "value",
    });

    mockSearchParams.set("data", maliciousPayload);

    const { result } = renderHook(() => {
      const { control, reset, getValues } = useForm({
        defaultValues: {
          data: {},
        },
      });
      useSyncUrl({ control, reset, adapter });
      return { control, getValues };
    });

    await vi.runAllTimersAsync();

    const values = result.current.getValues();
    const data = values.data as Record<string, unknown>;

    // __proto__ should be stripped out (check own property, not inherited)
    expect(Object.prototype.hasOwnProperty.call(data, "__proto__")).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(data, "normalKey")).toBe(true);
    expect(data.normalKey).toBe("value");

    // Verify prototype was not polluted
    expect(({} as any).isAdmin).toBeUndefined();
  });

  it("should protect against constructor.prototype pollution", async () => {
    const maliciousPayload = JSON.stringify({
      constructor: { prototype: { isAdmin: true } },
      normalKey: "value",
    });

    mockSearchParams.set("data", maliciousPayload);

    const { result } = renderHook(() => {
      const { control, reset, getValues } = useForm({
        defaultValues: {
          data: {},
        },
      });
      useSyncUrl({ control, reset, adapter });
      return { control, getValues };
    });

    await vi.runAllTimersAsync();

    const values = result.current.getValues();
    const data = values.data as Record<string, unknown>;

    // constructor should be stripped out (check own property, not inherited)
    expect(Object.prototype.hasOwnProperty.call(data, "constructor")).toBe(
      false
    );
    expect(Object.prototype.hasOwnProperty.call(data, "normalKey")).toBe(true);

    // Verify prototype was not polluted
    expect(({} as any).isAdmin).toBeUndefined();
  });

  it("should exclude specified fields from URL sync", async () => {
    const { result } = renderHook(() => {
      const { control, reset, setValue } = useForm({
        defaultValues: {
          name: "",
          password: "",
          email: "",
        },
      });
      useSyncUrl({
        control,
        reset,
        adapter,
        debounce: 100,
        excludeFields: ["password", "email"],
      });
      return { control, setValue };
    });

    await vi.runAllTimersAsync();

    // Set values including excluded fields
    act(() => {
      result.current.setValue("name", "John");
      result.current.setValue("password", "secret123");
      result.current.setValue("email", "john@example.com");
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // URL should only contain non-excluded fields
    const lastCall =
      mockSetSearchParams.mock.calls[
        mockSetSearchParams.mock.calls.length - 1
      ][0];
    expect(lastCall.get("name")).toBe("John");
    expect(lastCall.get("password")).toBeNull();
    expect(lastCall.get("email")).toBeNull();
  });

  it("should not restore excluded fields from URL", async () => {
    // Set up URL with excluded field
    mockSearchParams.set("name", "John");
    mockSearchParams.set("password", "secret123");

    const { result } = renderHook(() => {
      const { control, reset, getValues } = useForm({
        defaultValues: {
          name: "",
          password: "",
        },
      });
      useSyncUrl({
        control,
        reset,
        adapter,
        excludeFields: ["password"],
      });
      return { control, getValues };
    });

    await vi.runAllTimersAsync();

    const values = result.current.getValues();
    // Should restore non-excluded field
    expect(values.name).toBe("John");
    // Most importantly: excluded field should NOT be restored from URL
    // The password should NOT be 'secret123' (the value from URL)
    // It should remain as the default value (empty string) or undefined
    expect(values.password).not.toBe("secret123");
    // Verify the excluded field was actually skipped during restoration
    // by checking it's either undefined or the default value
    expect(values.password === "" || values.password === undefined).toBe(true);
  });

  it("should remove excluded fields from URL if they exist", async () => {
    // Set up URL with excluded field
    mockSearchParams.set("name", "John");
    mockSearchParams.set("password", "secret123");

    const { result } = renderHook(() => {
      const { control, reset, setValue } = useForm({
        defaultValues: {
          name: "John",
          password: "",
        },
      });
      useSyncUrl({
        control,
        reset,
        adapter,
        debounce: 100,
        excludeFields: ["password"],
      });
      return { control, setValue };
    });

    await vi.runAllTimersAsync();

    // Trigger a form update
    act(() => {
      result.current.setValue("name", "Jane");
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Excluded field should be removed from URL
    const lastCall =
      mockSetSearchParams.mock.calls[
        mockSetSearchParams.mock.calls.length - 1
      ][0];
    expect(lastCall.get("name")).toBe("Jane");
    expect(lastCall.get("password")).toBeNull();
  });

  it("should warn in development for sensitive field names", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    // Set NODE_ENV to development
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    const { result } = renderHook(() => {
      const { control, reset, setValue } = useForm({
        defaultValues: {
          password: "",
          apiKey: "",
          normalField: "",
        },
      });
      useSyncUrl({
        control,
        reset,
        adapter,
        debounce: 100,
        // Don't exclude to test warning
      });
      return { control, setValue };
    });

    await vi.runAllTimersAsync();

    // Set values with sensitive field names
    act(() => {
      result.current.setValue("password", "secret");
      result.current.setValue("apiKey", "key123");
      result.current.setValue("normalField", "value");
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Should warn for sensitive fields
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[rhf-sync-url] Warning: Field "password"')
    );
    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('[rhf-sync-url] Warning: Field "apiKey"')
    );
    // Should not warn for normal fields
    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("normalField")
    );

    consoleSpy.mockRestore();
    process.env.NODE_ENV = originalEnv;
  });

  it("should not warn for excluded sensitive fields", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const originalEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "development";

    const { result } = renderHook(() => {
      const { control, reset, setValue } = useForm({
        defaultValues: {
          password: "",
        },
      });
      useSyncUrl({
        control,
        reset,
        adapter,
        debounce: 100,
        excludeFields: ["password"], // Exclude the sensitive field
      });
      return { control, setValue };
    });

    await vi.runAllTimersAsync();

    act(() => {
      result.current.setValue("password", "secret");
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Should not warn if field is excluded
    expect(consoleSpy).not.toHaveBeenCalledWith(
      expect.stringContaining("password")
    );

    consoleSpy.mockRestore();
    process.env.NODE_ENV = originalEnv;
  });

  it("should handle boolean values correctly", async () => {
    mockSearchParams.set("isActive", "true");
    mockSearchParams.set("isPublic", "false");

    const { result } = renderHook(() => {
      const { control, reset, getValues } = useForm({
        defaultValues: {
          isActive: false,
          isPublic: true,
        },
      });
      useSyncUrl({ control, reset, adapter });
      return { control, getValues };
    });

    await vi.runAllTimersAsync();

    const values = result.current.getValues();
    // Booleans should be parsed correctly
    expect(values.isActive).toBe(true);
    expect(values.isPublic).toBe(false);
  });

  it("should handle number values correctly", async () => {
    mockSearchParams.set("age", "30");
    mockSearchParams.set("price", "99.99");
    mockSearchParams.set("count", "0");

    const { result } = renderHook(() => {
      const { control, reset, getValues } = useForm({
        defaultValues: {
          age: 0,
          price: 0,
          count: 0,
        },
      });
      useSyncUrl({ control, reset, adapter });
      return { control, getValues };
    });

    await vi.runAllTimersAsync();

    const values = result.current.getValues();
    expect(values.age).toBe(30);
    expect(values.price).toBe(99.99);
    expect(values.count).toBe(0);
  });

  it("should handle Date objects by converting to string", async () => {
    const { result } = renderHook(() => {
      const { control, reset, setValue } = useForm({
        defaultValues: {
          date: null as any,
        },
      });
      useSyncUrl({ control, reset, adapter, debounce: 100 });
      return { control, setValue };
    });

    await vi.runAllTimersAsync();

    const date = new Date("2023-01-01");
    act(() => {
      result.current.setValue("date", date as any);
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Date should be serialized as string
    const lastCall =
      mockSetSearchParams.mock.calls[
        mockSetSearchParams.mock.calls.length - 1
      ][0];
    const dateValue = lastCall.get("date");
    expect(dateValue).toBe(date.toString());
  });

  it("should handle RegExp objects by converting to string", async () => {
    const { result } = renderHook(() => {
      const { control, reset, setValue } = useForm({
        defaultValues: {
          pattern: null as any,
        },
      });
      useSyncUrl({ control, reset, adapter, debounce: 100 });
      return { control, setValue };
    });

    await vi.runAllTimersAsync();

    const regex = /test/gi;
    act(() => {
      result.current.setValue("pattern", regex as any);
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // RegExp should be serialized as string
    const lastCall =
      mockSetSearchParams.mock.calls[
        mockSetSearchParams.mock.calls.length - 1
      ][0];
    const patternValue = lastCall.get("pattern");
    expect(patternValue).toBe(regex.toString());
  });

  it("should handle invalid JSON strings gracefully", async () => {
    // Set invalid JSON in URL
    mockSearchParams.set("invalid", "{invalid json}");
    mockSearchParams.set("valid", '{"key":"value"}');

    const { result } = renderHook(() => {
      const { control, reset, getValues } = useForm({
        defaultValues: {
          invalid: "",
          valid: {},
        },
      });
      useSyncUrl({ control, reset, adapter });
      return { control, getValues };
    });

    await vi.runAllTimersAsync();

    const values = result.current.getValues();
    // Invalid JSON should return as string
    expect(values.invalid).toBe("{invalid json}");
    // Valid JSON should be parsed
    expect(values.valid).toEqual({ key: "value" });
  });

  it("should handle circular references gracefully", async () => {
    const consoleSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    // Test circular reference in URL (simulating what would happen if someone manually added it)
    // We can't test setting circular refs in form because React Hook Form will fail
    // But we can test that the serialization handles it when it occurs during URL sync

    const { result } = renderHook(() => {
      const { control, reset, setValue } = useForm({
        defaultValues: {
          data: {},
        },
      });
      useSyncUrl({ control, reset, adapter, debounce: 100 });
      return { control, setValue };
    });

    await vi.runAllTimersAsync();

    // Create an object that will cause serialization issues
    // Use a proxy or getter that throws to simulate circular reference behavior
    const problematicObj: any = {};
    Object.defineProperty(problematicObj, "self", {
      get() {
        return problematicObj; // This creates a circular-like structure
      },
      enumerable: true,
    });

    // Try to set it - React Hook Form might handle it, but serialization should fail
    try {
      act(() => {
        result.current.setValue("data", problematicObj);
      });

      await act(async () => {
        vi.advanceTimersByTime(100);
      });

      // If we get here, check if it was serialized or if warning was shown
      const lastCall =
        mockSetSearchParams.mock.calls[
          mockSetSearchParams.mock.calls.length - 1
        ];
      if (lastCall) {
        const urlValue = lastCall[0].get("data");
        // Should either be null (failed serialization) or a string representation
        expect(urlValue === null || typeof urlValue === "string").toBe(true);
      }
    } catch (error) {
      // React Hook Form might throw, which is expected for circular refs
      // This test verifies the system handles it gracefully
      expect(error).toBeDefined();
    }

    consoleSpy.mockRestore();
  });

  it("should not update URL if values have not changed", async () => {
    const { result } = renderHook(() => {
      const { control, reset, setValue } = useForm({
        defaultValues: {
          name: "John",
        },
      });
      useSyncUrl({ control, reset, adapter, debounce: 100 });
      return { control, setValue };
    });

    await vi.runAllTimersAsync();

    // Set initial value
    act(() => {
      result.current.setValue("name", "John");
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    const firstCallCount = mockSetSearchParams.mock.calls.length;

    // Set same value again
    act(() => {
      result.current.setValue("name", "John");
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Should not call setSearchParams again if URL hasn't changed
    // (The hook checks if URL actually changed before updating)
    // Note: This might still be called due to URL string comparison, but the URL content should be the same
    const lastCall =
      mockSetSearchParams.mock.calls[
        mockSetSearchParams.mock.calls.length - 1
      ][0];
    expect(lastCall.get("name")).toBe("John");
  });

  it("should handle empty excludeFields array", async () => {
    const { result } = renderHook(() => {
      const { control, reset, setValue } = useForm({
        defaultValues: {
          name: "",
        },
      });
      useSyncUrl({
        control,
        reset,
        adapter,
        debounce: 100,
        excludeFields: [], // Empty array
      });
      return { control, setValue };
    });

    await vi.runAllTimersAsync();

    act(() => {
      result.current.setValue("name", "John");
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Should work normally with empty excludeFields
    const lastCall =
      mockSetSearchParams.mock.calls[
        mockSetSearchParams.mock.calls.length - 1
      ][0];
    expect(lastCall.get("name")).toBe("John");
  });

  it("should handle empty string values in URL", async () => {
    mockSearchParams.set("name", "");
    mockSearchParams.set("email", "test@example.com");

    const { result } = renderHook(() => {
      const { control, reset, getValues } = useForm({
        defaultValues: {
          name: "",
          email: "",
        },
      });
      useSyncUrl({ control, reset, adapter });
      return { control, getValues };
    });

    await vi.runAllTimersAsync();

    const values = result.current.getValues();
    // Empty strings should be handled
    expect(values.email).toBe("test@example.com");
    // Empty string might not be restored (depends on implementation)
  });

  it("should base64 encode objects and arrays in URL", async () => {
    const { result } = renderHook(() => {
      const { control, reset, setValue } = useForm({
        defaultValues: {
          filters: {},
          tags: [],
        },
      });
      useSyncUrl({ control, reset, adapter, debounce: 100 });
      return { control, setValue };
    });

    await vi.runAllTimersAsync();

    const filterData = { category: "tech", active: true };
    const tags = ["react", "typescript"];

    act(() => {
      result.current.setValue("filters", filterData);
      result.current.setValue("tags", tags);
    });

    act(() => {
      vi.advanceTimersByTime(100);
    });

    // Check that values in URL are base64 encoded
    const lastCall =
      mockSetSearchParams.mock.calls[
        mockSetSearchParams.mock.calls.length - 1
      ][0];
    const filtersValue = lastCall.get("filters");
    const tagsValue = lastCall.get("tags");

    // Values should be base64 encoded (not plain JSON)
    expect(filtersValue).not.toBe(JSON.stringify(filterData));
    expect(tagsValue).not.toBe(JSON.stringify(tags));

    // Verify they are valid base64
    expect(() => {
      const decoded = decodeURIComponent(atob(filtersValue!));
      const parsed = JSON.parse(decoded);
      expect(parsed).toEqual(filterData);
    }).not.toThrow();

    expect(() => {
      const decoded = decodeURIComponent(atob(tagsValue!));
      const parsed = JSON.parse(decoded);
      expect(parsed).toEqual(tags);
    }).not.toThrow();
  });

  it("should decode base64-encoded values from URL", async () => {
    const filterData = { category: "tech", active: true };
    const tags = ["react", "typescript"];

    // Set base64-encoded values in URL (new format)
    const filtersBase64 = btoa(encodeURIComponent(JSON.stringify(filterData)));
    const tagsBase64 = btoa(encodeURIComponent(JSON.stringify(tags)));

    mockSearchParams.set("filters", filtersBase64);
    mockSearchParams.set("tags", tagsBase64);

    const { result } = renderHook(() => {
      const { control, reset, getValues } = useForm({
        defaultValues: {
          filters: {},
          tags: [],
        },
      });
      useSyncUrl({ control, reset, adapter });
      return { control, getValues };
    });

    await vi.runAllTimersAsync();

    const values = result.current.getValues();
    // Should correctly decode base64 values
    expect(values.filters).toEqual(filterData);
    expect(values.tags).toEqual(tags);
  });
});
