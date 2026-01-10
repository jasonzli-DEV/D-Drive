import { Box, Container, Paper, Button, Typography } from '@mui/material';
import { HardDrive } from 'lucide-react';

const DISCORD_CLIENT_ID = '1459408684080693320';
const REDIRECT_URI = 'http://pi.local/auth/callback';

export default function LoginPage() {
  const handleDiscordLogin = () => {
    const authUrl = `https://discord.com/api/oauth2/authorize?client_id=${DISCORD_CLIENT_ID}&redirect_uri=${encodeURIComponent(REDIRECT_URI)}&response_type=code&scope=identify%20email`;
    window.location.href = authUrl;
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        background: 'linear-gradient(135deg, #5865F2 0%, #57F287 100%)',
      }}
    >
      <Container maxWidth="sm">
        <Paper
          elevation={3}
          sx={{
            p: 6,
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 3,
          }}
        >
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 2 }}>
            <HardDrive size={48} color="#5865F2" />
            <Typography variant="h3" component="h1" fontWeight="bold">
              D-Drive
            </Typography>
          </Box>
          
          <Typography variant="body1" color="text.secondary" textAlign="center">
            Discord-powered cloud storage with unlimited space.
            Simple, fast, and developer-friendly.
          </Typography>
          
          <Button
            variant="contained"
            size="large"
            onClick={handleDiscordLogin}
            sx={{
              mt: 2,
              py: 1.5,
              px: 4,
              backgroundColor: '#5865F2',
              '&:hover': {
                backgroundColor: '#4752C4',
              },
            }}
          >
            Login with Discord
          </Button>
          
          <Box sx={{ mt: 4, textAlign: 'center' }}>
            <Typography variant="h6" gutterBottom>
              Features
            </Typography>
            <Typography variant="body2" color="text.secondary">
              • Unlimited storage using Discord<br />
              • Google Drive-like interface<br />
              • Developer CLI for automated backups<br />
              • Large file support (30GB+)<br />
              • Secure API access
            </Typography>
          </Box>
        </Paper>
      </Container>
    </Box>
  );
}
