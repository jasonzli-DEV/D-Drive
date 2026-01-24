import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { useAuth } from '../useAuth';

// Mock the api module
vi.mock('../../lib/api', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

describe('useAuth Hook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('should return loading true initially', () => {
    const { result } = renderHook(() => useAuth());
    // Initially loading is true before any async operation
    expect(result.current.loading).toBe(true);
  });

  it('should set loading to false when no token', async () => {
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(result.current.loading).toBe(false);
    });
  });

  it('should return isAuthenticated false when no token', async () => {
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(false);
    });
  });

  it('should return null user when no token', async () => {
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      vi.advanceTimersByTime(100);
    });

    await waitFor(() => {
      expect(result.current.user).toBeNull();
    });
  });

  it('should have login function', () => {
    const { result } = renderHook(() => useAuth());
    expect(typeof result.current.login).toBe('function');
  });

  it('should have logout function', () => {
    const { result } = renderHook(() => useAuth());
    expect(typeof result.current.logout).toBe('function');
  });

  it('should store token in localStorage on login', async () => {
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      result.current.login('test-token');
      vi.advanceTimersByTime(100);
    });

    expect(localStorage.getItem('token')).toBe('test-token');
  });

  it('should set isAuthenticated to true on login', async () => {
    const { result } = renderHook(() => useAuth());

    await act(async () => {
      result.current.login('test-token');
    });

    expect(result.current.isAuthenticated).toBe(true);
  });

  it('should export expected properties', () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current).toHaveProperty('isAuthenticated');
    expect(result.current).toHaveProperty('user');
    expect(result.current).toHaveProperty('loading');
    expect(result.current).toHaveProperty('login');
    expect(result.current).toHaveProperty('logout');
  });
});
