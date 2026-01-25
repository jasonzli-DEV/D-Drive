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
  Divider,
  Drawer,
  useMediaQuery,
  useTheme,
} from '@mui/material';
import { Settings, LogOut, Menu as MenuIcon, X, FileText } from 'lucide-react';
import { Home, Play, Plus, Trash2, Share2, Star } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';

const DRAWER_WIDTH = 240;

interface LayoutProps {
  children: React.ReactNode;
}

export default function Layout({ children }: LayoutProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const { user, logout } = useAuth();
  const [anchorEl, setAnchorEl] = useState<null | HTMLElement>(null);
  const [mobileDrawerOpen, setMobileDrawerOpen] = useState(false);
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));

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

  const handleDrawerToggle = () => {
    setMobileDrawerOpen(!mobileDrawerOpen);
  };

  const handleNavigation = (path: string) => {
    navigate(path);
    if (isMobile) {
      setMobileDrawerOpen(false);
    }
  };

  const isSettingsPage = (location.pathname || '').startsWith('/settings');

  // Shared sidebar content
  const sidebarContent = (
    <List disablePadding>
      <ListItemButton
        onClick={(e) => {
          const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
          const detail = { x: Math.round(rect.left + 8), y: Math.round(rect.top + 40) };
          const isDriveRoute = location.pathname === '/' || location.pathname.startsWith('/drive');
          if (!isDriveRoute) {
            navigate('/');
            setTimeout(() => window.dispatchEvent(new CustomEvent('ddrive:new', { detail })), 220);
          } else {
            window.dispatchEvent(new CustomEvent('ddrive:new', { detail }));
          }
          if (isMobile) setMobileDrawerOpen(false);
        }}
        sx={{ mb: 1 }}
      >
        <ListItemIcon>
          <Plus size={18} />
        </ListItemIcon>
        <ListItemText primary={"New"} />
      </ListItemButton>

      <ListItemButton onClick={() => handleNavigation('/') }>
        <ListItemIcon>
          <Home size={18} />
        </ListItemIcon>
        <ListItemText primary={"Home"} />
      </ListItemButton>
      <ListItemButton onClick={() => handleNavigation('/tasks') }>
        <ListItemIcon>
          <Play size={18} />
        </ListItemIcon>
        <ListItemText primary={"Tasks"} />
      </ListItemButton>
      
      <Divider sx={{ my: 1 }} />
      
      <ListItemButton onClick={() => handleNavigation('/starred') }>
        <ListItemIcon>
          <Star size={18} />
        </ListItemIcon>
        <ListItemText primary={"Starred"} />
      </ListItemButton>
      <ListItemButton onClick={() => handleNavigation('/shared') }>
        <ListItemIcon>
          <Share2 size={18} />
        </ListItemIcon>
        <ListItemText primary={"Shared"} />
      </ListItemButton>
      <ListItemButton onClick={() => handleNavigation('/recycle-bin') }>
        <ListItemIcon>
          <Trash2 size={18} />
        </ListItemIcon>
        <ListItemText primary={"Recycle Bin"} />
      </ListItemButton>
    </List>
  );

  return (
    <Box sx={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <AppBar position="sticky" elevation={0} sx={{ bgcolor: 'background.paper', borderBottom: 1, borderColor: 'divider', top: 0, zIndex: 1100 }}>
        <Toolbar sx={{ minHeight: { xs: 56, sm: 72 }, alignItems: 'center' }}>
            {/* Hamburger menu on mobile */}
            {isMobile && !isSettingsPage && (
              <IconButton
                edge="start"
                onClick={handleDrawerToggle}
                sx={{ mr: 1 }}
                aria-label="open drawer"
              >
                {mobileDrawerOpen ? <X size={24} /> : <MenuIcon size={24} />}
              </IconButton>
            )}
            
            {/* Logo on the left */}
            <IconButton
              onClick={() => navigate('/')}
              sx={{ mr: 2, p: 0.5, borderRadius: 2, '&:hover': { bgcolor: 'action.hover' } }}
              aria-label="Go to root drive"
              title="Go to root drive"
            >
              <Box
                component="img"
                src={theme.palette.mode === 'dark' ? '/D-Drive Dark.png' : '/D-Drive Light.png'}
                alt="D-Drive"
                sx={{ width: { xs: 32, sm: 40 }, height: { xs: 32, sm: 40 }, objectFit: 'contain', bgcolor: 'transparent' }}
              />
            </IconButton>
            <Box sx={{ flexGrow: 1 }} />
          
          <IconButton onClick={handleSettings} sx={{ width: { xs: 40, sm: 48 }, height: { xs: 40, sm: 48 } }}>
            <Settings size={24} />
          </IconButton>

          <IconButton onClick={handleMenuOpen} sx={{ width: { xs: 36, sm: 44 }, height: { xs: 36, sm: 44 } }}>
            <Avatar
              sx={{ width: { xs: 32, sm: 40 }, height: { xs: 32, sm: 40 } }}
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
                {user?.username}
              </Typography>
            </MenuItem>
            <MenuItem onClick={handleLogs}>
              <FileText style={{ marginRight: 8 }} size={20} />
              Logs
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
      
      {/* Mobile Drawer */}
      {!isSettingsPage && (
        <Drawer
          variant="temporary"
          open={mobileDrawerOpen}
          onClose={handleDrawerToggle}
          ModalProps={{ keepMounted: true }}
          sx={{
            display: { xs: 'block', md: 'none' },
            '& .MuiDrawer-paper': {
              boxSizing: 'border-box',
              width: DRAWER_WIDTH,
              top: { xs: 56, sm: 72 },
              height: { xs: 'calc(100% - 56px)', sm: 'calc(100% - 72px)' },
            },
          }}
        >
          <Box sx={{ px: 1, pt: 2 }}>
            {sidebarContent}
          </Box>
        </Drawer>
      )}

      {/* Main content area with left sidebar */}
      <Box sx={{ display: 'flex', flexGrow: 1, bgcolor: 'background.default' }}>
        {/* Desktop Sidebar: visible on md+ screens except settings */}
        {!isSettingsPage && (
          <Box
            component="aside"
            sx={{
              display: { xs: 'none', md: 'block' },
              width: DRAWER_WIDTH,
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
            {sidebarContent}
          </Box>
        )}

        <Box component="main" sx={{ flexGrow: 1, p: { xs: 1, sm: 2 }, minWidth: 0 }}>
          {children}
        </Box>
      </Box>
    </Box>
  );
}
