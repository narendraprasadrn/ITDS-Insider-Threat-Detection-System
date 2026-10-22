// frontend/src/components/layout/Navbar.jsx
import React, { useState, useEffect } from 'react';
import {
  AppBar,
  Toolbar,
  Typography,
  IconButton,
  Box,
  Chip,
  Tooltip,
  CircularProgress,
  Avatar,
  Menu,
  MenuItem,
  ListItemIcon,
  Divider,
  Button
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import SecurityIcon from '@mui/icons-material/Security';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import LogoutIcon from '@mui/icons-material/Logout';
import PersonIcon from '@mui/icons-material/Person';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';

export default function Navbar({ onToggleSidebar }) {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [anchorEl, setAnchorEl] = useState(null);

  const fetchHealth = async () => {
    try {
      const res = await fetch('/health');
      const data = await res.json();
      setHealth(data);
    } catch {
      setHealth({ success: false });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(fetchHealth, 15000);
    return () => clearInterval(interval);
  }, []);

  const handleMenuOpen = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuClose = () => {
    setAnchorEl(null);
  };

  const handleLogout = async () => {
    handleMenuClose();
    await logout();
    navigate('/login');
  };

  const isHealthy = health?.success && health?.data?.status === 'healthy';

  return (
    <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1 }}>
      <Toolbar>
        <IconButton
          color="inherit"
          aria-label="open drawer"
          edge="start"
          onClick={onToggleSidebar}
          sx={{ mr: 2 }}
        >
          <MenuIcon />
        </IconButton>

        <SecurityIcon sx={{ color: 'primary.light', mr: 1.5, fontSize: 28 }} />
        <Typography variant="h6" noWrap component="div" sx={{ fontWeight: 700, letterSpacing: '0.03em' }}>
          ITDS <Box component="span" sx={{ fontWeight: 300, color: 'text.secondary', ml: 1, fontSize: '0.9rem' }}>| Insider Threat Detection</Box>
        </Typography>

        <Box sx={{ flexGrow: 1 }} />

        {/* Live Infrastructure Status */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5, mr: 2 }}>
          {loading ? (
            <CircularProgress size={18} color="inherit" />
          ) : (
            <Tooltip
              title={
                isHealthy
                  ? `DB: Up (logs: ${health?.data?.dependencies?.database?.details?.generalLogRows || 0}) | OPA: Up`
                  : 'Infrastructure Degraded or Offline'
              }
            >
              <Chip
                size="small"
                icon={isHealthy ? <CheckCircleIcon /> : <WarningAmberIcon />}
                label={isHealthy ? 'Services Online' : 'Degraded'}
                color={isHealthy ? 'success' : 'warning'}
                variant="filled"
              />
            </Tooltip>
          )}
        </Box>

        {/* User Account / Login State */}
        {isAuthenticated ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              size="small"
              label={user?.roles?.[0] || 'User'}
              color={user?.roles?.includes('admin') ? 'error' : 'primary'}
              sx={{ fontWeight: 600, textTransform: 'capitalize' }}
            />
            <IconButton onClick={handleMenuOpen} size="small" sx={{ ml: 0.5 }}>
              <Avatar sx={{ width: 34, height: 34, bgcolor: 'primary.dark', fontSize: '0.9rem' }}>
                {user?.username ? user.username.slice(0, 2).toUpperCase() : 'U'}
              </Avatar>
            </IconButton>
            <Menu
              anchorEl={anchorEl}
              open={Boolean(anchorEl)}
              onClose={handleMenuClose}
              onClick={handleMenuClose}
              PaperProps={{
                sx: { minWidth: 220, mt: 1, backgroundColor: '#0f172a' }
              }}
              transformOrigin={{ horizontal: 'right', vertical: 'top' }}
              anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            >
              <Box sx={{ px: 2, py: 1.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                  {user?.full_name || user?.username}
                </Typography>
                <Typography variant="caption" color="text.secondary" display="block">
                  {user?.email}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                  {user?.roles?.map((r) => (
                    <Chip key={r} label={r} size="small" sx={{ height: 18, fontSize: '0.65rem' }} />
                  ))}
                </Box>
              </Box>
              <Divider />
              {user?.roles?.includes('admin') && (
                <MenuItem onClick={() => navigate('/users')}>
                  <ListItemIcon>
                    <AdminPanelSettingsIcon fontSize="small" />
                  </ListItemIcon>
                  User Management
                </MenuItem>
              )}
              <MenuItem onClick={handleLogout}>
                <ListItemIcon>
                  <LogoutIcon fontSize="small" />
                </ListItemIcon>
                Logout
              </MenuItem>
            </Menu>
          </Box>
        ) : (
          <Button
            color="primary"
            variant="contained"
            size="small"
            startIcon={<PersonIcon />}
            onClick={() => navigate('/login')}
          >
            Sign In
          </Button>
        )}
      </Toolbar>
    </AppBar>
  );
}
