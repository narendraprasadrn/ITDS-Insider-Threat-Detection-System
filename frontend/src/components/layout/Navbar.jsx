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
  CircularProgress
} from '@mui/material';
import MenuIcon from '@mui/icons-material/Menu';
import SecurityIcon from '@mui/icons-material/Security';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';

export default function Navbar({ onToggleSidebar }) {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

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
    const interval = setInterval(fetchHealth, 10000);
    return () => clearInterval(interval);
  }, []);

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
          ITDS <Box component="span" sx={{ fontWeight: 300, color: 'text.secondary', ml: 1, fontSize: '0.9rem' }}>| Insider Threat Detection System</Box>
        </Typography>

        <Box sx={{ flexGrow: 1 }} />

        {/* Live Infrastructure Status Indicators */}
        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
          <Chip
            size="small"
            label="Phase 1: Scaffolding"
            color="primary"
            variant="outlined"
            sx={{ fontWeight: 500 }}
          />

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
      </Toolbar>
    </AppBar>
  );
}
