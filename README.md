# rhf-sync-url

<div align="center">
  <img src="https://raw.githubusercontent.com/Abhi1264/rhf-sync-url/main/logo.svg" alt="rhf-sync-url logo" width="200" />
</div>

A lightweight React hook that automatically synchronizes [React Hook Form](https://react-hook-form.com/) state with URL query parameters. Perfect for creating shareable form states, maintaining form state on page refresh, and building better UX with persistent form filters.

## Features

- **Automatic Synchronization**: Form values are automatically synced with URL query parameters
- **Bidirectional Sync**: URL → Form on mount and URL changes (browser navigation), Form → URL on form changes
- **Debounced Updates**: Configurable debounce to prevent excessive URL updates
- **Framework Agnostic**: Works with React Router, Next.js, and any router that provides URL search params
- **TypeScript Support**: Fully typed with TypeScript generics
- **Lightweight**: Minimal dependencies, only requires React and React Hook Form
- **Flexible**: Supports complex values (objects, arrays) via JSON serialization
- **Secure**: Prototype pollution protection and safe JSON parsing
- **URL Length Protection**: Configurable maximum URL length with warnings

## ⚠️ Security Warning

**This package is designed for non-sensitive form data only.**

**DO NOT use this package for forms containing:**

- Passwords or authentication credentials
- Personal Identifiable Information (PII) - SSN, credit card numbers, etc.
- Financial information
- Medical records
- API keys or tokens
- Any sensitive data subject to privacy regulations

**URLs are visible in:**

- Browser history
- Server logs
- Referrer headers (when navigating to external sites)
- Browser address bar
- Shared links
- Browser extensions
- Network monitoring tools

**Always use the `excludeFields` option to prevent sensitive fields from being synced to URLs.**

## Installation

```bash
npm install rhf-sync-url
```

```bash
yarn add rhf-sync-url
```

```bash
pnpm add rhf-sync-url
```

## Requirements

- React >= 16.8.0
- React Hook Form >= 7.0.0

## Usage

### Usage with React Router

```javascript
import { useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { useSyncUrl } from "rhf-sync-url";

export const MyForm = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { control, reset } = useForm();

  useSyncUrl({
    control,
    reset,
    adapter: {
      searchParams,
      setSearchParams,
    },
  });

  return <form>...</form>;
};
```

### Usage with Next.js (App Router)

```javascript
import { useSearchParams, useRouter, usePathname } from "next/navigation";
import { useForm } from "react-hook-form";
import { useSyncUrl } from "rhf-sync-url";

export const MyForm = () => {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const { control, reset } = useForm();

  useSyncUrl({
    control,
    reset,
    adapter: {
      searchParams,
      setSearchParams: (newParams) => {
        router.replace(`${pathname}?${newParams.toString()}`);
      },
    },
  });

  return <form>...</form>;
};
```

### Usage with Next.js (Pages Router)

```javascript
import { useRouter } from 'next/router';
import { useForm } from 'react-hook-form';
import { useSyncUrl } from 'rhf-sync-url';

export const MyForm = () => {
  const router = useRouter();
  const { control, reset } = useForm();

  useSyncUrl({
    control,
    reset,
    adapter: {
      searchParams: new URLSearchParams(router.query as Record<string, string>),
      setSearchParams: (newParams) => {
        router.replace({
          pathname: router.pathname,
          query: Object.fromEntries(newParams),
        }, undefined, { shallow: true });
      },
    }
  });

  return <form>...</form>;
};
```

### Custom Options

You can customize the debounce delay, maximum URL length, and exclude sensitive fields:

```javascript
useSyncUrl({
  control,
  reset,
  adapter: {
    searchParams,
    setSearchParams,
  },
  debounce: 1000, // Wait 1 second before updating URL (default: 500ms)
  maxUrlLength: 1500, // Maximum URL length before warning (default: 2000)
  excludeFields: ["password", "ssn", "creditCard"], // Fields to never sync to URL
});
```

### Excluding Sensitive Fields

**Always exclude sensitive fields** to prevent them from appearing in URLs:

```javascript
useSyncUrl({
  control,
  reset,
  adapter: {
    searchParams,
    setSearchParams,
  },
  excludeFields: [
    "password",
    "confirmPassword",
    "ssn",
    "creditCard",
    "apiKey",
    "token",
  ],
});
```

The hook will:

- **Never sync** excluded fields to the URL
- **Remove** excluded fields from the URL if they exist
- **Skip** excluded fields when restoring form values from URL
- **Warn in development** if field names suggest sensitive data (even if not explicitly excluded)

## API Reference

### `useSyncUrl<T>(options)`

A React hook that synchronizes React Hook Form state with URL query parameters bidirectionally.

#### Type Parameters

- `T` (optional): The type of your form data. Defaults to `Record<string, unknown>`

#### Parameters

- `options` (`UseSyncUrlOptions<T>`)
  - `control` (`Control<T>`): The control object from `useForm<T>()` hook
  - `reset` (`UseFormReset<T>`): The reset function from `useForm<T>()` hook
  - `adapter` (`RouterAdapter`): An object containing:
    - `searchParams` (`URLSearchParams`): Current URL search parameters
    - `setSearchParams` (`(params: URLSearchParams) => void`): Function to update URL search parameters
  - `debounce` (`number`, optional): Debounce delay in milliseconds (default: `500`)
  - `maxUrlLength` (`number`, optional): Maximum URL length before warning (default: `2000`)
  - `excludeFields` (`string[]`, optional): Field names to exclude from URL sync (default: `[]`)
    - **Important**: Always exclude sensitive fields like passwords, SSN, credit cards, etc.

#### Returns

`void` - This hook doesn't return a value. It synchronizes form state with URL automatically.

#### Behavior

1. **On Mount**: Reads query parameters from the URL and restores form values (excluding `excludeFields`)
2. **On URL Changes**: When URL changes externally (browser back/forward, manual navigation), form values are updated (excluding `excludeFields`)
3. **On Form Changes**: Updates the URL query parameters with current form values (debounced, excluding `excludeFields`)
4. **Empty Values**: Automatically removes query parameters when form values are empty, null, or undefined
5. **Complex Values**: Objects and arrays are serialized as JSON in the URL
6. **Security**:
   - Prototype pollution protection and safe JSON parsing are built-in
   - Excluded fields are never synced to URL and are removed if they exist
   - Development warnings for potentially sensitive field names

## How It Works

### Initial Hydration (URL → Form)

On the first render, the hook:

1. Reads all query parameters from the URL
2. Attempts to parse JSON values (for objects/arrays) or uses plain strings (for primitives)
3. Sanitizes parsed objects to prevent prototype pollution
4. Resets the form with the restored values

### Bidirectional Sync

**URL → Form**: When the URL changes (browser navigation, back/forward button, or external updates), the hook detects the change and updates the form values accordingly.

**Form → URL**: When form values change (after initial hydration), the hook:

1. Debounces the updates to prevent excessive URL changes
2. Serializes values (JSON for objects/arrays, strings for primitives)
3. Updates the URL query parameters
4. Preserves unrelated URL parameters
5. Warns if URL length exceeds the maximum

### Value Serialization

- **Primitives** (string, number, boolean): Converted to strings
- **Objects and Arrays**: JSON stringified
- **Empty Values** (null, undefined, empty string): Removed from URL
- **Special Objects** (Date, RegExp, etc.): Converted to strings (not JSON)

### Security Features

- **Field Exclusion**: Use `excludeFields` to prevent sensitive data from being synced to URLs
- **Prototype Pollution Protection**: Dangerous keys (`__proto__`, `constructor`, `prototype`) are automatically stripped from parsed objects
- **Safe JSON Parsing**: Validates parsed values and rejects non-plain objects
- **Development Warnings**: Warns in development mode if field names suggest sensitive data (e.g., "password", "ssn", "token")
- **Error Handling**: Gracefully handles circular references and serialization errors

## Examples

### Search Form with Filters

```javascript
import { useSearchParams } from "react-router-dom";
import { useForm } from "react-hook-form";
import { useSyncUrl } from "rhf-sync-url";

export const SearchForm = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const { control, register, handleSubmit } = useForm({
    defaultValues: {
      query: "",
      category: "all",
      tags: [],
    },
  });

  const { control, reset } = useForm({
    defaultValues: {
      query: "",
      category: "all",
      tags: [],
    },
  });

  useSyncUrl({
    control,
    reset,
    adapter: {
      searchParams,
      setSearchParams,
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)}>
      <input {...register("query")} placeholder="Search..." />
      <select {...register("category")}>
        <option value="all">All</option>
        <option value="tech">Tech</option>
        <option value="design">Design</option>
      </select>
      {/* Form fields */}
    </form>
  );
};
```

## TypeScript

The library is fully typed with TypeScript generics. Import types if needed:

```typescript
import { useSyncUrl, RouterAdapter } from "rhf-sync-url";

// Define your form data type
interface FormData {
  name: string;
  age: number;
  tags: string[];
}

// Use with type safety
const { control, reset } = useForm<FormData>({
  defaultValues: {
    name: "",
    age: 0,
    tags: [],
  },
});

useSyncUrl<FormData>({
  control,
  reset,
  adapter: {
    searchParams,
    setSearchParams,
  },
});
```

### Available Types

- `useSyncUrl<T>`: The main hook with generic type parameter
- `RouterAdapter`: Interface for router adapter implementation

## Important Notes

### Security Considerations

- **Always use `excludeFields`**: Explicitly exclude sensitive fields like passwords, SSN, credit cards, API keys, etc.
- **Never sync sensitive data**: Even with exclusion, avoid using this package for forms that primarily contain sensitive data
- **Validate on the server**: Always validate form data on the server side, never trust client-side data
- **Use HTTPS**: Always use HTTPS in production to prevent URL parameter interception
- **Review field names**: The hook warns in development if field names suggest sensitive data, but you should always review your forms
- **Test thoroughly**: Verify excluded fields are never in URLs, even if they exist in the URL before exclusion is added

### URL Length Limits

- Browsers typically support 2000-8000 character URLs, but 2000 is safer
- The hook warns when URLs exceed the configured maximum
- For very large forms, consider reducing the amount of data synced to the URL

### Best Practices

1. **Define default values**: Always provide `defaultValues` in `useForm()` for proper type inference
2. **Type your forms**: Use TypeScript generics for type safety
3. **Test thoroughly**: Test with browser navigation (back/forward buttons)
4. **Monitor URL length**: Adjust `maxUrlLength` based on your use case

## Contributing

Contributions are welcome! Please feel free to create issues and submit Pull Requests in case you find any scope for improvement or vulnerabilities.

## Author

[Abhi1264](https://github.com/Abhi1264)
