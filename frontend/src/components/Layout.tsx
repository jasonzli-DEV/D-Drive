import { useState } from 'react';
import { 
  AppBar, 
  Toolbar, 
  Typography, 
  IconButton, 
  Box,
  Menu,
  MenuItem,
  Avatar
} from '@mui/material';
import { Settings, LogOut } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);

  const handleMenuOpen = (event: React.MouseEvent<HTMLElement>) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleSettings = () => {
    handleMenuClose();
    navigate('/settings');
  };

  const handleLogout = async () => {
    handleMenuClose();
    await logout();
    navigate('/login');
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="static">
        <Toolbar>
            {/* Logo on the left */}
            <IconButton
              color="inherit"
              onClick={() => navigate('/')}
              sx={{ mr: 1, p: 0 }}
              aria-label="Home"
            >
              <Box
                component="img"
                src="/D-Drive.png"
                alt="D-Drive"
                sx={{ width: 36, height: 36, objectFit: 'contain', bgcolor: 'transparent' }}
              />
            </IconButton>
            <Box sx={{ flexGrow: 1 }} />
          
          <IconButton color="inherit" onClick={handleSettings}>
            <Settings />
          </IconButton>
          
          <IconButton color="inherit" onClick={handleMenuOpen}>
            <Avatar
              sx={{ width: 32, height: 32 }}
              src={
                user?.avatarUrl ? user.avatarUrl :
                user?.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : undefined
              }
            >
              {user?.username?.charAt(0).toUpperCase()}
            </Avatar>
          </IconButton>
          
          <Menu
            anchorEl={anchorEl}
            open={Boolean(anchorEl)}
            onClose={handleMenuClose}
          >
            <MenuItem disabled>
              <Typography variant="body2">
                {user?.username}#{user?.discriminator}
              </Typography>
            </MenuItem>
            <MenuItem onClick={handleSettings}>
              <Settings style={{ marginRight: 8 }} size={18} />
              Settings
            </MenuItem>
            <MenuItem onClick={handleLogout}>
              <LogOut style={{ marginRight: 8 }} size={18} />
              Logout
            </MenuItem>
          </Menu>
            {/* D-Drive logo on the top-right. Placed last so it appears at the far right. */}
            <IconButton
              color="inherit"
              onClick={() => navigate('/')}
              sx={{ ml: 1, p: 0 }}
              aria-label="Home"
            >
              <Box
                component="img"
                src="/D-Drive.png"
                alt="D-Drive"
                sx={{ width: 36, height: 36, objectFit: 'contain', bgcolor: 'transparent' }}
              />
            </IconButton>
        </Toolbar>
      </AppBar>
      
      <Box component="main" sx={{ flexGrow: 1, bgcolor: '#f5f5f5', p: 0 }}>
        {children}
      </Box>
    </Box>
  );
}
