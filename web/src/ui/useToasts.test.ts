// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, cleanup } from '@testing-library/react';
import { useToasts } from './useToasts';

beforeEach(() => {
  (globalThis as Record<string, unknown>).IS_REACT_ACT_ENVIRONMENT = true;
  vi.useFakeTimers();
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe('useToasts', () => {
  it('auto-expires a toast after the ttl', () => {
    const { result } = renderHook(() => useToasts(4, 4000));
    act(() => result.current.pushToast('hello'));
    expect(result.current.toasts).toHaveLength(1);
    act(() => vi.advanceTimersByTime(4000));
    expect(result.current.toasts).toHaveLength(0);
  });

  it('dismisses a toast on demand and cancels its timer', () => {
    const { result } = renderHook(() => useToasts());
    act(() => result.current.pushToast('tap me'));
    const id = result.current.toasts[0].id;
    act(() => result.current.dismissToast(id));
    expect(result.current.toasts).toHaveLength(0);
    // The expiry timer was cancelled — advancing time changes nothing.
    act(() => vi.advanceTimersByTime(10000));
    expect(result.current.toasts).toHaveLength(0);
  });

  it('evicts the oldest toast beyond the cap', () => {
    const { result } = renderHook(() => useToasts(3));
    act(() => {
      result.current.pushToast('one');
      result.current.pushToast('two');
      result.current.pushToast('three');
      result.current.pushToast('four');
    });
    expect(result.current.toasts.map((t) => t.text)).toEqual(['two', 'three', 'four']);
  });

  it('clears all timers on unmount', () => {
    const { result, unmount } = renderHook(() => useToasts());
    act(() => {
      result.current.pushToast('one');
      result.current.pushToast('two');
    });
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
