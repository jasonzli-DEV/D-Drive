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
      // Delay navigation slightly to avoid rapid navigation/throttling
      // and allow React state to settle (prevents bfcache/navigation races).
      setTimeout(() => {
        try {
          navigate('/', { replace: true });
        } catch (err) {
          console.error('Navigation after login failed', err);
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
