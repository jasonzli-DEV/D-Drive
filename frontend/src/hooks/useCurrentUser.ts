/**
 * Custom hook to access the current user's data
 */
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

interface User {
  id: string;
  username: string;
  avatar?: string;
  email?: string;
  encryptionKey?: string;
  encryptByDefault: boolean;
  recycleBinEnabled: boolean;
  allowSharedWithMe: boolean;
  theme: string;
  timezone?: string | null;
}

export function useCurrentUser() {
  return useQuery({
    queryKey: ['currentUser'],
    queryFn: async () => {
      const response = await api.get('/me');
      return response.data as User;
    },
    staleTime: 5 * 60 * 1000, // 5 minutes
  });
}
