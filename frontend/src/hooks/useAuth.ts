import { useState, useEffect, useRef } from 'react';
import api from '../lib/api';

interface User {
  id: string;
  username: string;
  discriminator: string;
  avatar?: string;
}

export function useAuth() {
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const lastAuthCheckRef = useRef<number | null>(null);
  const retryTimeoutRef = useRef<any>(null);
  const retryCountRef = useRef<number>(0);

  useEffect(() => {
    checkAuth();
    return () => {
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    };
  }, []);

  async function checkAuth() {
    const token = localStorage.getItem('token');
    // Avoid repeated checks within short time (debounce)
    const now = Date.now();
    if (lastAuthCheckRef.current && now - lastAuthCheckRef.current < 1500) {
      return;
    }
    lastAuthCheckRef.current = now;
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const response = await api.get('/auth/me');
      setUser(response.data);
      setIsAuthenticated(true);
    } catch (error) {
      const status = (error as any)?.response?.status;
      if (status === 401) {
        // Invalid token — clear and force logout
        localStorage.removeItem('token');
        setIsAuthenticated(false);
      } else if (status === 429) {
        // Too many requests — schedule a retry with backoff instead of logging out
        const retries = (retryCountRef.current || 0);
        if (retries < 4) {
          const delay = Math.pow(2, retries) * 1000; // exponential backoff: 1s,2s,4s...
          retryCountRef.current = retries + 1;
          retryTimeoutRef.current = setTimeout(() => checkAuth(), delay) as unknown as NodeJS.Timeout;
          return;
        }
      } else {
        // Other errors — keep token and mark unauthenticated until resolved
        console.error('Auth check error', error);
      }
    } finally {
      setLoading(false);
    }
  }

  function login(token: string) {
    localStorage.setItem('token', token);
    setIsAuthenticated(true);
    // Trigger an auth check but allow debounce/backoff to control frequency
    checkAuth();
  }

  async function logout() {
    try {
      await api.post('/auth/logout');
    } catch (error) {
      console.error('Logout error:', error);
    }
    localStorage.removeItem('token');
    setIsAuthenticated(false);
    setUser(null);
  }

  return { isAuthenticated, user, loading, login, logout };
}
