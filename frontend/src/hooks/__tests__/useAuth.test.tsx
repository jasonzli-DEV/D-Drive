import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
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
  });

  it('should return isAuthenticated as boolean', () => {
    const { result } = renderHook(() => useAuth());
    expect(typeof result.current.isAuthenticated).toBe('boolean');
  });

  it('should return user as null or object', () => {
    const { result } = renderHook(() => useAuth());
    expect(result.current.user === null || typeof result.current.user === 'object').toBe(true);
  });

  it('should return loading as boolean', () => {
    const { result } = renderHook(() => useAuth());
    expect(typeof result.current.loading).toBe('boolean');
  });

  it('should have login function', () => {
    const { result } = renderHook(() => useAuth());
    expect(typeof result.current.login).toBe('function');
  });

  it('should have logout function', () => {
    const { result } = renderHook(() => useAuth());
    expect(typeof result.current.logout).toBe('function');
  });

  it('should return isAuthenticated false when no token', () => {
    localStorage.removeItem('token');
    const { result } = renderHook(() => useAuth());
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('should return null user when no token', () => {
    localStorage.removeItem('token');
    const { result } = renderHook(() => useAuth());
    expect(result.current.user).toBeNull();
  });

  it('should store token in localStorage on login', () => {
    const { result } = renderHook(() => useAuth());

    act(() => {
      result.current.login('test-token');
    });

    expect(localStorage.getItem('token')).toBe('test-token');
  });

  it('should set isAuthenticated to true on login', () => {
    const { result } = renderHook(() => useAuth());

    act(() => {
      result.current.login('test-token');
    });

    expect(result.current.isAuthenticated).toBe(true);
  });

  it('should export all expected properties', () => {
    const { result } = renderHook(() => useAuth());

    expect(result.current).toHaveProperty('isAuthenticated');
    expect(result.current).toHaveProperty('user');
    expect(result.current).toHaveProperty('loading');
    expect(result.current).toHaveProperty('login');
    expect(result.current).toHaveProperty('logout');
  });

  it('should have exactly 5 properties', () => {
    const { result } = renderHook(() => useAuth());
    expect(Object.keys(result.current)).toHaveLength(5);
  });
});
