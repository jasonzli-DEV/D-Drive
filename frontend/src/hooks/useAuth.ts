import { useState, useEffect } from 'react';
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

  useEffect(() => {
    checkAuth();
  }, []);

  async function checkAuth() {
    const token = localStorage.getItem('token');
    if (!token) {
      setLoading(false);
      return;
    }

    try {
      const response = await api.get('/auth/me');
      setUser(response.data);
      setIsAuthenticated(true);
    } catch (error) {
      localStorage.removeItem('token');
      setIsAuthenticated(false);
    } finally {
      setLoading(false);
    }
  }

  function login(token: string) {
    localStorage.setItem('token', token);
    setIsAuthenticated(true);
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
