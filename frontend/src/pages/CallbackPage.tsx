import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Box, CircularProgress, Typography } from '@mui/material';
import { useAuth } from '../hooks/useAuth';
import api from '../lib/api';
import toast from 'react-hot-toast';

export default function CallbackPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { login } = useAuth();

  useEffect(() => {
    handleCallback();
  }, []);

  async function handleCallback() {
    const code = searchParams.get('code');
    
    if (!code) {
      toast.error('Authentication failed');
      navigate('/login');
      return;
    }

    try {
      const response = await api.get(`/auth/discord/callback?code=${code}`);
      const { token } = response.data;
      
      login(token);
      toast.success('Logged in successfully!');
      // Delay slightly to avoid rapid navigation/throttling and allow state to settle.
      // Use a full-page redirect so injected content-scripts/extensions re-run
      // against a fresh document, which prevents race conditions leading to
      // `parentElement` access errors from injected scripts.
      setTimeout(() => {
        try {
          window.location.replace('/');
        } catch (err) {
          console.error('Full-page redirect after login failed', err);
          try {
            // Fallback to SPA navigation if full redirect fails for some reason
            navigate('/', { replace: true });
          } catch (err2) {
            console.error('Fallback SPA navigation failed', err2);
          }
        }
      }, 150);
    } catch (error) {
      console.error('Auth callback error:', error);
      toast.error('Authentication failed');
      navigate('/login');
    }
  }

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 2,
      }}
    >
      <CircularProgress size={60} />
      <Typography variant="h6">Authenticating...</Typography>
    </Box>
  );
}
