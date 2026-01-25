import { useEffect, useState } from 'react';
import { Box, Container, Paper, Button, Typography, Fade, Chip, Grid } from '@mui/material';
import { HardDrive, Cloud, Shield, Zap, Server, Terminal } from 'lucide-react';
import { useAuth } from '../hooks/useAuth';
import { Navigate, useNavigate } from 'react-router-dom';
import api from '../lib/api';

// Get Discord Client ID from environment or use empty string if not set
const DISCORD_CLIENT_ID = import.meta.env.VITE_DISCORD_CLIENT_ID || '';
const REDIRECT_URI = `${window.location.origin}/auth/callback`;

export default function LoginPage() {
  const { isAuthenticated, loading } = useAuth();
  const navigate = useNavigate();
  const [checkingSetup, setCheckingSetup] = useState(true);

  useEffect(() => {
    // Check if setup is required
    const checkSetup = async () => {
      try {
        const response = await api.get('/setup/status');
        if (response.data.setupRequired) {
          navigate('/setup', { replace: true });
        }
      } catch (err) {
        // If setup endpoint fails, assume setup is complete
        console.error('Setup check failed:', err);
      } finally {
        setCheckingSetup(false);
      }
    };
    
    // If no Discord Client ID is configured, redirect to setup
    if (!DISCORD_CLIENT_ID || DISCORD_CLIENT_ID === 'placeholder' || DISCORD_CLIENT_ID === '') {
      navigate('/setup', { replace: true });
      return;
    }
    
    checkSetup();
  }, [navigate]);

  // Redirect if already authenticated
  if (loading || checkingSetup) return null;
  if (isAuthenticated) return <Navigate to="/" replace />;

  const handleDiscordLogin = () => {
    const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20email`;
    window.location.href = authUrl;
  };

  const features = [
    { icon: Cloud, title: 'Unlimited Storage', desc: 'Store files using Discord as backend' },
    { icon: Shield, title: 'Encrypted', desc: 'AES-256 encryption for your files' },
    { icon: Zap, title: 'Fast Transfers', desc: 'Parallel chunk uploads & downloads' },
    { icon: Server, title: 'SFTP Backups', desc: 'Automated server backup tasks' },
    { icon: Terminal, title: 'CLI Support', desc: 'Developer-friendly command line' },
    { icon: HardDrive, title: '30GB+ Files', desc: 'No file size limitations' },
  ];

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #1a1a2e 0%, #16213e 50%, #0f3460 100%)',
        position: 'relative',
        overflow: 'hidden',
      }}
    >
      {/* Animated background elements */}
      <Box
        sx={{
          position: 'absolute',
          top: '10%',
          left: '10%',
          width: 300,
          height: 300,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(88, 101, 242, 0.15) 0%, transparent 70%)',
          filter: 'blur(40px)',
          animation: 'pulse 4s ease-in-out infinite',
          '@keyframes pulse': {
            '0%, 100%': { transform: 'scale(1)', opacity: 0.5 },
            '50%': { transform: 'scale(1.1)', opacity: 0.8 },
          },
        }}
      />
      <Box
        sx={{
          position: 'absolute',
          bottom: '15%',
          right: '15%',
          width: 400,
          height: 400,
          borderRadius: '50%',
          background: 'radial-gradient(circle, rgba(87, 242, 135, 0.1) 0%, transparent 70%)',
          filter: 'blur(60px)',
          animation: 'pulse 5s ease-in-out infinite 1s',
        }}
      />
      
      <Container maxWidth="lg">
        <Fade in timeout={800}>
          <Grid container spacing={4} alignItems="center">
            {/* Left side - Hero content */}
            <Grid item xs={12} md={6}>
              <Box sx={{ color: 'white', pr: { md: 4 } }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
                  <Box
                    component="img"
                    src="/D-Drive Dark.png"
                    alt="D-Drive"
                    sx={{ width: 140, height: 140, filter: 'drop-shadow(0 4px 12px rgba(88, 101, 242, 0.5))' }}
                    onError={(e) => {
                      e.currentTarget.style.display = 'none';
                    }}
                  />
                </Box>
                
                <Typography variant="h5" sx={{ mb: 3, color: 'rgba(255,255,255,0.85)', lineHeight: 1.6 }}>
                  Discord-powered cloud storage with <strong>unlimited space</strong>. 
                  Simple, fast, and developer-friendly.
                </Typography>
                
                <Box sx={{ display: 'flex', gap: 1, mb: 4, flexWrap: 'wrap' }}>
                  <Chip label="Self-hosted" size="small" sx={{ bgcolor: 'rgba(87, 242, 135, 0.2)', color: '#57F287' }} />
                  <Chip label="Open Source" size="small" sx={{ bgcolor: 'rgba(88, 101, 242, 0.2)', color: '#7289da' }} />
                  <Chip label="No Limits" size="small" sx={{ bgcolor: 'rgba(254, 231, 92, 0.2)', color: '#FEE75C' }} />
                </Box>

                <Button
                  variant="contained"
                  size="large"
                  onClick={handleDiscordLogin}
                  startIcon={
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028 14.09 14.09 0 0 0 1.226-1.994.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                    </svg>
                  }
                  sx={{
                    py: 1.75,
                    px: 4,
                    backgroundColor: '#5865F2',
                    fontSize: '1.1rem',
                    fontWeight: 600,
                    borderRadius: 2,
                    textTransform: 'none',
                    boxShadow: '0 8px 32px rgba(88, 101, 242, 0.4)',
                    '&:hover': {
                      backgroundColor: '#4752C4',
                      transform: 'translateY(-2px)',
                      boxShadow: '0 12px 40px rgba(88, 101, 242, 0.5)',
                    },
                    transition: 'all 0.2s ease',
                  }}
                >
                  Continue with Discord
                </Button>
              </Box>
            </Grid>

            {/* Right side - Feature cards */}
            <Grid item xs={12} md={6}>
              <Paper
                elevation={0}
                sx={{
                  p: 4,
                  bgcolor: 'rgba(255,255,255,0.05)',
                  backdropFilter: 'blur(20px)',
                  borderRadius: 4,
                  border: '1px solid rgba(255,255,255,0.1)',
                }}
              >
                <Typography variant="h6" sx={{ mb: 3, color: 'white', fontWeight: 600 }}>
                  Why D-Drive?
                </Typography>
                <Grid container spacing={2}>
                  {features.map((feature, idx) => (
                    <Grid item xs={6} key={idx} sx={{ display: 'flex' }}>
                      <Box
                        sx={{
                          p: 2,
                          borderRadius: 2,
                          bgcolor: 'rgba(255,255,255,0.03)',
                          border: '1px solid rgba(255,255,255,0.05)',
                          transition: 'all 0.2s',
                          display: 'flex',
                          flexDirection: 'column',
                          width: '100%',
                          minHeight: '120px',
                          '&:hover': {
                            bgcolor: 'rgba(255,255,255,0.08)',
                            transform: 'translateY(-2px)',
                          },
                        }}
                      >
                        <feature.icon size={24} color="#5865F2" style={{ marginBottom: 8 }} />
                        <Typography variant="subtitle2" sx={{ color: 'white', fontWeight: 600, mb: 0.5 }}>
                          {feature.title}
                        </Typography>
                        <Typography variant="caption" sx={{ color: 'rgba(255,255,255,0.6)' }}>
                          {feature.desc}
                        </Typography>
                      </Box>
                    </Grid>
                  ))}
                </Grid>
              </Paper>
            </Grid>
          </Grid>
        </Fade>
      </Container>
    </Box>
  );
}
