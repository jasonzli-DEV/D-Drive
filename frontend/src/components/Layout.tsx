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
import { Home, Play, Plus } from 'lucide-react';
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

  const handleLogs = () => {
    handleMenuClose();
    navigate('/logs');
  };

  const handleLogout = async () => {
    handleMenuClose();
    await logout();
    navigate('/login');
  };

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: '#5865F2', borderBottom: '1px solid rgba(255,255,255,0.1)', top: 0, zIndex: 1100 }}>
        <Toolbar sx={{ minHeight: 72, alignItems: 'center' }}>
            {/* Logo on the left */}
            <IconButton
              color="inherit"
              onClick={() => navigate('/')}
              sx={{ mr: 2, p: 0.5, borderRadius: 2, '&:hover': { bgcolor: 'rgba(255,255,255,0.1)' } }}
              aria-label="Go to root drive"
              title="Go to root drive"
            >
              <Box
                component="img"
                src="/D-Drive.png"
                alt="D-Drive"
                sx={{ width: 48, height: 48, objectFit: 'contain', bgcolor: 'transparent' }}
              />
              <Typography variant="h6" fontWeight={700} sx={{ ml: 1.5, display: { xs: 'none', sm: 'block' } }}>
                D-Drive
              </Typography>
            </IconButton>
            <Box sx={{ flexGrow: 1 }} />
          
          <IconButton color="inherit" onClick={handleSettings} sx={{ width: 48, height: 48 }}>
            <Settings size={28} />
          </IconButton>

          <IconButton color="inherit" onClick={handleMenuOpen} sx={{ width: 44, height: 44 }}>
            <Avatar
              sx={{ width: 40, height: 40 }}
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
            <MenuItem onClick={handleLogs}>
              <ListItemIcon sx={{ minWidth: 36 }}>
                <Box component="span" sx={{ display: 'flex', alignItems: 'center' }}>📋</Box>
              </ListItemIcon>
              <ListItemText primary="Logs" />
            </MenuItem>
            <MenuItem onClick={handleSettings}>
              <Settings style={{ marginRight: 8 }} size={20} />
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
        {/* Sidebar: visible on all pages except settings - STICKY */}
        {!(location.pathname || '').startsWith('/settings') && (
          <Box
            component="aside"
            sx={{
              width: 240,
              bgcolor: 'background.paper',
              borderRight: 1,
              borderColor: 'divider',
              boxShadow: '0 1px 0 rgba(0,0,0,0.06)',
              px: 1,
              pt: 2,
              position: 'sticky',
              top: 72,
              alignSelf: 'flex-start',
              height: 'calc(100vh - 72px)',
              overflowY: 'auto',
            }}
          >
            <List disablePadding>
                <ListItemButton
                  onClick={(e) => {
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    // dispatch a global event with approximate anchor coordinates
                    const detail = { x: Math.round(rect.left + 8), y: Math.round(rect.top + 40) };
                    // If we're not currently on a Drive route, navigate to root first so
                    // the DrivePage can handle the event and create/upload into root.
                    const isDriveRoute = location.pathname === '/' || location.pathname.startsWith('/drive');
                    if (!isDriveRoute) {
                      navigate('/');
                      // wait briefly for DrivePage to mount and register its listener
                      setTimeout(() => window.dispatchEvent(new CustomEvent('ddrive:new', { detail })), 220);
                    } else {
                      window.dispatchEvent(new CustomEvent('ddrive:new', { detail }));
                    }
                  }}
                  sx={{ mb: 1 }}
                >
                  <ListItemIcon>
                    <Plus size={18} />
                  </ListItemIcon>
                  <ListItemText primary={"New"} />
                </ListItemButton>

                <ListItemButton onClick={() => navigate('/') }>
                  <ListItemIcon>
                    <Home size={18} />
                  </ListItemIcon>
                  <ListItemText primary={"Home"} />
                </ListItemButton>
                <ListItemButton onClick={() => navigate('/tasks') }>
                  <ListItemIcon>
                    <Play size={18} />
                  </ListItemIcon>
                  <ListItemText primary={"Tasks"} />
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
