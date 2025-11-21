import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { useSyncUrl, RouterAdapter } from './index';

// Mock timers for debounce testing
vi.useFakeTimers();

describe('useSyncUrl', () => {
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

  it('should restore form values from URL on initial render', async () => {
    // Set up URL with query params
    mockSearchParams.set('name', 'John');
    mockSearchParams.set('age', '30');
    mockSearchParams.set('active', 'true');

    const { result } = renderHook(() => {
      const { control, reset, getValues } = useForm({
        defaultValues: {
          name: '',
          age: 0,
          active: false,
        },
      });
      useSyncUrl({ control, reset, adapter });
      return { control, getValues };
    });

    // Wait for sync to complete
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Form should be restored from URL
    const values = result.current.getValues();
    expect(values.name).toBe('John');
    expect(values.age).toBe(30);
    expect(values.active).toBe(true);
  });

  it('should parse JSON objects from URL', async () => {
    const filterData = { category: 'tech', tags: ['react', 'typescript'] };
    mockSearchParams.set('filters', JSON.stringify(filterData));

    const { result } = renderHook(() => {
      const { control, reset, getValues } = useForm({
        defaultValues: {
          filters: {},
        },
      });
      useSyncUrl({ control, reset, adapter });
      return { control, getValues };
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const values = result.current.getValues();
    expect(values.filters).toEqual(filterData);
  });

  it('should parse JSON arrays from URL', async () => {
    const tags = ['react', 'typescript', 'testing'];
    mockSearchParams.set('tags', JSON.stringify(tags));

    const { result } = renderHook(() => {
      const { control, reset, getValues } = useForm({
        defaultValues: {
          tags: [],
        },
      });
      useSyncUrl({ control, reset, adapter });
      return { control, getValues };
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const values = result.current.getValues();
    expect(values.tags).toEqual(tags);
  });

  it('should update URL when form values change', async () => {
    const { result } = renderHook(() => {
      const { control, reset, setValue } = useForm({
        defaultValues: {
          name: '',
          email: '',
        },
      });
      useSyncUrl({ control, reset, adapter, debounce: 100 });
      return { control, setValue };
    });

    // Wait for initial render to complete
    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Update form value
    act(() => {
      result.current.setValue('name', 'Jane');
    });

    // Fast-forward debounce timer
    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // URL should be updated
    expect(mockSetSearchParams).toHaveBeenCalled();
    const lastCall = mockSetSearchParams.mock.calls[mockSetSearchParams.mock.calls.length - 1][0];
    expect(lastCall.get('name')).toBe('Jane');
  });

  it('should debounce URL updates', async () => {
    const { result } = renderHook(() => {
      const { control, reset, setValue } = useForm({
        defaultValues: {
          search: '',
        },
      });
      useSyncUrl({ control, reset, adapter, debounce: 500 });
      return { control, setValue };
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Rapidly change form values
    act(() => {
      result.current.setValue('search', 'a');
    });
    act(() => {
      result.current.setValue('search', 'ab');
    });
    act(() => {
      result.current.setValue('search', 'abc');
    });

    // Should not have been called yet (debounced)
    expect(mockSetSearchParams).not.toHaveBeenCalled();

    // Fast-forward past debounce time
    await act(async () => {
      vi.advanceTimersByTime(500);
    });

    // Should have been called once with final value
    expect(mockSetSearchParams).toHaveBeenCalledTimes(1);
    const lastCall = mockSetSearchParams.mock.calls[0][0];
    expect(lastCall.get('search')).toBe('abc');
  });

  it('should remove URL params when form values are empty', async () => {
    // Set initial URL params
    mockSearchParams.set('name', 'John');
    mockSearchParams.set('email', 'john@example.com');

    const { result } = renderHook(() => {
      const { control, reset, setValue } = useForm({
        defaultValues: {
          name: 'John',
          email: 'john@example.com',
        },
      });
      useSyncUrl({ control, reset, adapter, debounce: 100 });
      return { control, setValue };
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Clear form values
    act(() => {
      result.current.setValue('name', '');
      result.current.setValue('email', '');
    });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // URL params should be removed
    const lastCall = mockSetSearchParams.mock.calls[mockSetSearchParams.mock.calls.length - 1][0];
    expect(lastCall.get('name')).toBeNull();
    expect(lastCall.get('email')).toBeNull();
  });

  it('should handle null and undefined values', async () => {
    const { result } = renderHook(() => {
      const { control, reset, setValue } = useForm({
        defaultValues: {
          optional: 'value',
        },
      });
      useSyncUrl({ control, reset, adapter, debounce: 100 });
      return { control, setValue };
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => {
      result.current.setValue('optional', null as any);
    });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    const lastCall = mockSetSearchParams.mock.calls[mockSetSearchParams.mock.calls.length - 1][0];
    expect(lastCall.get('optional')).toBeNull();
  });

  it('should sync URL changes back to form (bidirectional)', async () => {
    const { result, rerender } = renderHook(
      ({ searchParams }) => {
        const { control, reset, getValues } = useForm({
          defaultValues: {
            query: '',
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

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Simulate URL change (e.g., browser back button)
    const newSearchParams = new URLSearchParams();
    newSearchParams.set('query', 'new search');

    rerender({ searchParams: newSearchParams });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Form should be updated from URL
    const values = result.current.getValues();
    expect(values.query).toBe('new search');
  });

  it('should preserve unrelated URL params', async () => {
    mockSearchParams.set('unrelated', 'value');

    const { result } = renderHook(() => {
      const { control, reset, setValue } = useForm({
        defaultValues: {
          name: '',
        },
      });
      useSyncUrl({ control, reset, adapter, debounce: 100 });
      return { control, setValue };
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    act(() => {
      result.current.setValue('name', 'John');
    });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    // Unrelated param should still be present
    const lastCall = mockSetSearchParams.mock.calls[mockSetSearchParams.mock.calls.length - 1][0];
    expect(lastCall.get('unrelated')).toBe('value');
    expect(lastCall.get('name')).toBe('John');
  });

  it('should handle complex nested objects', async () => {
    const complexData = {
      user: {
        name: 'John',
        preferences: {
          theme: 'dark',
          notifications: true,
        },
      },
      tags: ['react', 'typescript'],
    };
    mockSearchParams.set('data', JSON.stringify(complexData));

    const { result } = renderHook(() => {
      const { control, reset, getValues } = useForm({
        defaultValues: {
          data: {},
        },
      });
      useSyncUrl({ control, reset, adapter });
      return { control, getValues };
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const values = result.current.getValues();
    expect(values.data).toEqual(complexData);
  });

  it('should warn when URL length exceeds maximum', async () => {
    const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderHook(() => {
      const { control, reset, setValue } = useForm({
        defaultValues: {
          largeData: '',
        },
      });
      useSyncUrl({ control, reset, adapter, debounce: 100, maxUrlLength: 100 });
      return { control, setValue };
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    // Set a value that will create a long URL
    const longString = 'a'.repeat(200);
    act(() => {
      result.current.setValue('largeData', longString);
    });

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining('URL length')
    );

    consoleSpy.mockRestore();
  });

  it('should protect against prototype pollution attacks', async () => {
    // Attempt prototype pollution via __proto__
    const maliciousPayload = JSON.stringify({
      __proto__: { isAdmin: true },
      normalKey: 'value',
    });

    mockSearchParams.set('data', maliciousPayload);

    const { result } = renderHook(() => {
      const { control, reset, getValues } = useForm({
        defaultValues: {
          data: {},
        },
      });
      useSyncUrl({ control, reset, adapter });
      return { control, getValues };
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const values = result.current.getValues();
    const data = values.data as Record<string, unknown>;

    // __proto__ should be stripped out (check own property, not inherited)
    expect(Object.prototype.hasOwnProperty.call(data, '__proto__')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(data, 'normalKey')).toBe(true);
    expect(data.normalKey).toBe('value');

    // Verify prototype was not polluted
    expect(({} as any).isAdmin).toBeUndefined();
  });

  it('should protect against constructor.prototype pollution', async () => {
    const maliciousPayload = JSON.stringify({
      constructor: { prototype: { isAdmin: true } },
      normalKey: 'value',
    });

    mockSearchParams.set('data', maliciousPayload);

    const { result } = renderHook(() => {
      const { control, reset, getValues } = useForm({
        defaultValues: {
          data: {},
        },
      });
      useSyncUrl({ control, reset, adapter });
      return { control, getValues };
    });

    await act(async () => {
      await vi.runAllTimersAsync();
    });

    const values = result.current.getValues();
    const data = values.data as Record<string, unknown>;

    // constructor should be stripped out (check own property, not inherited)
    expect(Object.prototype.hasOwnProperty.call(data, 'constructor')).toBe(false);
    expect(Object.prototype.hasOwnProperty.call(data, 'normalKey')).toBe(true);

    // Verify prototype was not polluted
    expect(({} as any).isAdmin).toBeUndefined();
  });
});

