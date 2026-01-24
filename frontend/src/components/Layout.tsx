import { useState } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Box,
  Menu,
  MenuItem,
  Avatar,
  List,
  ListItemButton,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import { Settings, LogOut } from 'lucide-react';
import { Home } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
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
        <Toolbar sx={{ minHeight: 96, alignItems: 'center' }}>
            {/* Logo on the left */}
            <IconButton
              color="inherit"
              onClick={() => navigate('/')}
              sx={{ mr: 1, p: 0, width: 96, height: 96 }}
              aria-label="Home"
            >
              <Box
                component="img"
                src="/D-Drive.png"
                alt="D-Drive"
                sx={{ width: 96, height: 96, objectFit: 'contain', bgcolor: 'transparent' }}
              />
            </IconButton>
            <Box sx={{ flexGrow: 1 }} />
          
          <IconButton color="inherit" onClick={handleSettings} sx={{ width: 48, height: 48 }}>
            <Settings size={20} />
          </IconButton>

          <IconButton color="inherit" onClick={handleMenuOpen} sx={{ width: 48, height: 48 }}>
            <Avatar
              sx={{ width: 48, height: 48 }}
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
            {/* right-side logo removed to avoid duplication */}
        </Toolbar>
      </AppBar>
      
      {/* Main content area with left sidebar (hidden on settings) */}
      <Box sx={{ display: 'flex', flexGrow: 1, bgcolor: '#f5f5f5' }}>
        {/* Sidebar: visible on all pages except settings */}
        {!(location.pathname || '').startsWith('/settings') && (
          <Box
            component="aside"
            sx={{
              width: 240,
              bgcolor: 'background.paper',
              borderRight: 1,
              borderColor: 'divider',
              // visually align with AppBar so it appears connected
              boxShadow: '0 1px 0 rgba(0,0,0,0.06)',
              px: 1,
              pt: 2,
            }}
          >
            <List disablePadding>
              <ListItemButton onClick={() => navigate('/') }>
                <ListItemIcon>
                  <Home size={18} />
                </ListItemIcon>
                <ListItemText primary={"Home"} />
              </ListItemButton>
            </List>
          </Box>
        )}

        <Box component="main" sx={{ flexGrow: 1, p: 2 }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
