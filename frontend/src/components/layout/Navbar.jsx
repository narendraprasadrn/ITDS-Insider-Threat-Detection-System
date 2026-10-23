// frontend/src/components/layout/Navbar.jsx
import React, { useState, useEffect, useCallback } from 'react';
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
  Button,
  Popover,
  Stack
} from '@mui/material';
import BootstrapIcon from '../common/BootstrapIcon.jsx';
import { useAuth } from '../../context/AuthContext.jsx';
import { useNavigate } from 'react-router-dom';

const STATUS_COLORS = {
  healthy: '#55E6C1',     // Mint
  degraded: '#F59E0B',    // Amber
  unavailable: '#EF4444', // Red
  unknown: '#AAB8BC'      // Neutral grey
};

function formatUptime(seconds) {
  if (!seconds || isNaN(seconds)) return '0s';
  const sec = Math.floor(seconds);
  const hrs = Math.floor(sec / 3600);
  const mins = Math.floor((sec % 3600) / 60);
  const remSec = sec % 60;
  if (hrs > 0) return `${hrs}h ${mins}m`;
  if (mins > 0) return `${mins}m ${remSec}s`;
  return `${remSec}s`;
}

function parseSystemHealth(health, loading, networkError) {
  if (loading && !health) {
    return {
      status: 'unknown',
      color: STATUS_COLORS.unknown,
      badgeLabel: 'Checking System...',
      title: 'Connecting to infrastructure...',
      failedList: [],
      dependencies: {
        backend: { name: 'Node.js Backend', status: 'unknown', desc: 'Connecting to API server...' },
        database: { name: 'MySQL Database', status: 'unknown', desc: 'Connecting...' },
        opa: { name: 'OPA Policy Engine', status: 'unknown', desc: 'Connecting...' },
        pipeline: { name: 'Monitoring Pipeline', status: 'unknown', desc: 'Connecting...' }
      }
    };
  }

  if (networkError || !health) {
    return {
      status: 'unavailable',
      color: STATUS_COLORS.unavailable,
      badgeLabel: 'Backend Offline',
      title: 'Node.js Backend API is unreachable',
      failedList: ['Node.js Backend'],
      dependencies: {
        backend: { name: 'Node.js Backend', status: 'unavailable', desc: 'API server connection refused or offline' },
        database: { name: 'MySQL Database', status: 'unknown', desc: 'State unknown (Backend unreachable)' },
        opa: { name: 'OPA Policy Engine', status: 'unknown', desc: 'State unknown (Backend unreachable)' },
        pipeline: { name: 'Monitoring Pipeline', status: 'unknown', desc: 'State unknown (Backend unreachable)' }
      }
    };
  }

  const rawDeps = health?.data?.dependencies || {};

  // 1. Backend Status
  const backendUp = rawDeps.backend?.status === 'up' || Boolean(health.data?.uptime);
  const backendState = {
    name: 'Node.js Backend',
    status: backendUp ? 'healthy' : 'unavailable',
    desc: backendUp
      ? `Node ${rawDeps.backend?.details?.nodeVersion || 'v22'} • Uptime ${formatUptime(rawDeps.backend?.details?.uptime || health.data?.uptime)} • Memory ${rawDeps.backend?.details?.memoryMb || 25}MB`
      : 'API server not responding'
  };

  // 2. MySQL Database Status
  const dbConnected = rawDeps.database?.status === 'up' || Boolean(rawDeps.database?.details?.connected);
  const dbState = {
    name: 'MySQL Database',
    status: dbConnected ? 'healthy' : 'unavailable',
    desc: dbConnected
      ? `Connected to itds_db • ${Number(rawDeps.database?.details?.generalLogRows || 0).toLocaleString()} general_log rows`
      : (rawDeps.database?.details?.error || 'Database connection offline')
  };

  // 3. OPA Policy Engine Status
  const opaUp = rawDeps.opa?.status === 'up' || Boolean(rawDeps.opa?.details?.reachable);
  const opaState = {
    name: 'OPA Policy Engine',
    status: opaUp ? 'healthy' : 'unavailable',
    desc: opaUp
      ? 'Port 8181 responsive • Rego policies active (access & query)'
      : (rawDeps.opa?.details?.error || 'OPA daemon offline - policy checks fail closed')
  };

  // 4. Monitoring Pipeline Status
  const generalLogActive = rawDeps.database?.details?.generalLogActive;
  const pipelineRawStatus = rawDeps.pipeline?.status;
  const pipelineActive = pipelineRawStatus === 'up' || (dbConnected && generalLogActive);
  const pipelineDegraded = dbConnected && !generalLogActive;
  const pipelineStatus = !dbConnected
    ? 'unavailable'
    : (pipelineActive ? 'healthy' : (pipelineDegraded ? 'degraded' : 'unknown'));

  const pipelineState = {
    name: 'Monitoring Pipeline',
    status: pipelineStatus,
    desc: pipelineActive
      ? `mysql.general_log streaming active (Poll: 1.5s • Table output: ${rawDeps.database?.details?.logOutput || 'TABLE'})`
      : (pipelineDegraded ? 'general_log disabled in MySQL engine' : 'Telemetry pipeline suspended')
  };

  const dependencies = {
    backend: backendState,
    database: dbState,
    opa: opaState,
    pipeline: pipelineState
  };

  const failedList = [];
  if (backendState.status !== 'healthy') failedList.push('Backend');
  if (dbState.status !== 'healthy') failedList.push('MySQL');
  if (opaState.status !== 'healthy') failedList.push('OPA');
  if (pipelineState.status !== 'healthy') failedList.push('Pipeline');

  if (failedList.length === 0) {
    return {
      status: 'healthy',
      color: STATUS_COLORS.healthy,
      badgeLabel: 'System Healthy',
      title: 'All services online and operational',
      failedList: [],
      dependencies
    };
  }

  if (dbState.status !== 'healthy' && opaState.status !== 'healthy') {
    return {
      status: 'unavailable',
      color: STATUS_COLORS.unavailable,
      badgeLabel: 'DB & OPA Offline',
      title: 'Database and OPA engines are offline',
      failedList,
      dependencies
    };
  }

  if (dbState.status !== 'healthy') {
    return {
      status: 'unavailable',
      color: STATUS_COLORS.unavailable,
      badgeLabel: 'MySQL Unavailable',
      title: 'MySQL database is unreachable',
      failedList,
      dependencies
    };
  }

  if (opaState.status !== 'healthy') {
    return {
      status: 'degraded',
      color: STATUS_COLORS.degraded,
      badgeLabel: 'OPA Offline',
      title: 'OPA policy engine offline - JIT decisions suspended',
      failedList,
      dependencies
    };
  }

  if (pipelineState.status === 'degraded' || pipelineState.status === 'unavailable') {
    return {
      status: 'degraded',
      color: STATUS_COLORS.degraded,
      badgeLabel: 'Pipeline Degraded',
      title: 'SQL telemetry logging inactive or degraded',
      failedList,
      dependencies
    };
  }

  return {
    status: 'degraded',
    color: STATUS_COLORS.degraded,
    badgeLabel: `Degraded (${failedList.join(', ')})`,
    title: `Issues detected in: ${failedList.join(', ')}`,
    failedList,
    dependencies
  };
}

export default function Navbar({ onToggleSidebar, sidebarCollapsed = false, isMobile = false }) {
  const { user, isAuthenticated, logout } = useAuth();
  const navigate = useNavigate();

  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [networkError, setNetworkError] = useState(false);
  const [lastChecked, setLastChecked] = useState(null);

  const [healthPanelAnchor, setHealthPanelAnchor] = useState(null);
  const [userMenuAnchor, setUserMenuAnchor] = useState(null);

  const fetchHealth = useCallback(async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      const res = await fetch('/health');
      const data = await res.json();
      setHealth(data);
      setNetworkError(false);
      setLastChecked(new Date());
    } catch {
      setNetworkError(true);
      setHealth({
        success: false,
        data: {
          status: 'unavailable',
          dependencies: {
            backend: { status: 'down', details: { error: 'Node.js API server unreachable' } },
            database: { status: 'unknown', details: {} },
            opa: { status: 'unknown', details: {} },
            pipeline: { status: 'unknown', details: {} }
          }
        }
      });
      setLastChecked(new Date());
    } finally {
      setLoading(false);
      if (isManual) setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchHealth();
    const interval = setInterval(() => {
      fetchHealth();
    }, 15000);
    return () => clearInterval(interval);
  }, [fetchHealth]);

  const handleHealthPanelOpen = (event) => {
    setHealthPanelAnchor(event.currentTarget);
  };

  const handleHealthPanelClose = () => {
    setHealthPanelAnchor(null);
  };

  const handleUserMenuOpen = (event) => {
    setUserMenuAnchor(event.currentTarget);
  };

  const handleUserMenuClose = () => {
    setUserMenuAnchor(null);
  };

  const handleLogout = async () => {
    handleUserMenuClose();
    await logout();
    navigate('/login');
  };

  const healthInfo = parseSystemHealth(health, loading, networkError);

  return (
    <AppBar position="fixed" sx={{ zIndex: (theme) => theme.zIndex.drawer + 1, backgroundColor: '#1F292B', borderBottom: '1px solid #364345' }}>
      <Toolbar sx={{ minHeight: '56px !important', px: 2 }}>
        <IconButton
          color="inherit"
          aria-label="Toggle navigation sidebar"
          aria-expanded={isMobile ? !sidebarCollapsed : !sidebarCollapsed}
          edge="start"
          onClick={onToggleSidebar}
          sx={{
            mr: 1.5,
            color: '#F5F7F7',
            borderRadius: 1.5,
            p: 0.75,
            '&:hover': { bgcolor: 'rgba(255, 255, 255, 0.08)' }
          }}
        >
          <BootstrapIcon name="bi-list" size={22} />
        </IconButton>

        <Box sx={{ display: 'flex', alignItems: 'center', cursor: 'pointer' }} onClick={() => navigate('/')}>
          <BootstrapIcon name="bi-shield-lock-fill" size={22} color="#55E6C1" sx={{ mr: 1.25 }} />
          <Typography variant="h6" noWrap component="div" sx={{ fontWeight: 700, letterSpacing: '0.02em', color: '#F5F7F7', fontSize: '1.02rem', display: 'flex', alignItems: 'center' }}>
            ITDS
            <Box component="span" sx={{ fontWeight: 400, color: '#AAB8BC', ml: 1, fontSize: '0.82rem', display: { xs: 'none', sm: 'inline' } }}>
              | Insider Threat Detection
            </Box>
          </Typography>
        </Box>

        <Box sx={{ flexGrow: 1 }} />

        {/* System Health Indicator Button */}
        <Box sx={{ display: 'flex', alignItems: 'center', mr: 2 }}>
          <Tooltip
            title={
              <Box sx={{ p: 0.5 }}>
                <Typography variant="caption" sx={{ fontWeight: 700, display: 'block', color: healthInfo.color }}>
                  {healthInfo.title}
                </Typography>
                <Typography variant="caption" sx={{ color: '#AAB8BC', display: 'block', mt: 0.25 }}>
                  Click to inspect live infrastructure status
                </Typography>
              </Box>
            }
            arrow
          >
            <Box
              onClick={handleHealthPanelOpen}
              role="button"
              aria-label="System Health Indicator"
              tabIndex={0}
              sx={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 0.8,
                py: 0.45,
                px: 1.2,
                height: 28,
                backgroundColor: '#171B1C',
                border: '1px solid',
                borderColor: healthInfo.status === 'healthy' ? 'rgba(85, 230, 193, 0.35)' : healthInfo.color,
                borderRadius: 1.5,
                cursor: 'pointer',
                userSelect: 'none',
                transition: 'all 0.15s ease-in-out',
                '&:hover': {
                  backgroundColor: '#252E30',
                  borderColor: healthInfo.color
                }
              }}
            >
              {refreshing ? (
                <CircularProgress size={11} sx={{ color: healthInfo.color }} />
              ) : (
                <BootstrapIcon name="bi-heart-pulse" size={13} color={healthInfo.color} />
              )}
              <Typography
                variant="caption"
                sx={{
                  fontWeight: 600,
                  fontSize: '0.74rem',
                  color: healthInfo.color,
                  letterSpacing: '0.01em',
                  lineHeight: 1
                }}
              >
                {healthInfo.badgeLabel}
              </Typography>
              <BootstrapIcon
                name="bi-chevron-down"
                size={12}
                color="#AAB8BC"
                sx={{
                  ml: 0.2,
                  transition: 'transform 0.15s ease',
                  transform: Boolean(healthPanelAnchor) ? 'rotate(180deg)' : 'none'
                }}
              />
            </Box>
          </Tooltip>

          {/* Expandable Health Diagnostics Panel */}
          <Popover
            open={Boolean(healthPanelAnchor)}
            anchorEl={healthPanelAnchor}
            onClose={handleHealthPanelClose}
            anchorOrigin={{ vertical: 'bottom', horizontal: 'right' }}
            transformOrigin={{ vertical: 'top', horizontal: 'right' }}
            PaperProps={{
              sx: {
                width: 380,
                p: 2,
                mt: 1,
                backgroundColor: '#252E30',
                border: '1px solid #364345',
                borderRadius: 2,
                boxShadow: '0 12px 32px rgba(0, 0, 0, 0.65)'
              }
            }}
          >
            {/* Popover Header */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <BootstrapIcon name="bi-heart-pulse" size={16} color={healthInfo.color} />
                <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#F5F7F7' }}>
                  Infrastructure Health
                </Typography>
              </Box>
              <Chip
                label={healthInfo.status.toUpperCase()}
                size="small"
                sx={{
                  height: 20,
                  fontSize: '0.65rem',
                  fontWeight: 700,
                  backgroundColor: `${healthInfo.color}1F`,
                  color: healthInfo.color,
                  border: `1px solid ${healthInfo.color}4D`
                }}
              />
            </Box>

            {/* Check Metadata & Latency */}
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 0.75, mb: 1.5 }}>
              <Typography variant="caption" sx={{ color: '#AAB8BC', fontSize: '0.72rem' }}>
                {lastChecked ? `Checked: ${lastChecked.toLocaleTimeString()}` : 'Checking...'} (Auto 15s)
              </Typography>
              <Typography variant="caption" sx={{ color: '#AAB8BC', fontSize: '0.72rem' }}>
                {health?.data?.responseTimeMs != null ? `Response: ${health.data.responseTimeMs}ms` : ''}
              </Typography>
            </Box>

            <Divider sx={{ borderColor: '#364345', mb: 1.5 }} />

            {/* 4 Live Dependency Cards */}
            <Stack spacing={1}>
              {[
                { key: 'backend', icon: <BootstrapIcon name="bi-server" size={15} /> },
                { key: 'database', icon: <BootstrapIcon name="bi-database" size={15} /> },
                { key: 'opa', icon: <BootstrapIcon name="bi-shield-check" size={15} /> },
                { key: 'pipeline', icon: <BootstrapIcon name="bi-activity" size={15} /> }
              ].map(({ key, icon }) => {
                const dep = healthInfo.dependencies[key];
                const depColor = STATUS_COLORS[dep.status] || STATUS_COLORS.unknown;
                const statusChipText = dep.status === 'healthy' ? 'UP' : dep.status.toUpperCase();

                return (
                  <Box
                    key={key}
                    sx={{
                      p: 1.2,
                      backgroundColor: '#171B1C',
                      border: '1px solid #364345',
                      borderRadius: 1.5,
                      display: 'flex',
                      flexDirection: 'column',
                      gap: 0.4
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <Box sx={{ color: depColor, display: 'flex', alignItems: 'center' }}>
                          {icon}
                        </Box>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#F5F7F7', fontSize: '0.8rem' }}>
                          {dep.name}
                        </Typography>
                      </Box>
                      <Chip
                        label={statusChipText}
                        size="small"
                        sx={{
                          height: 18,
                          fontSize: '0.62rem',
                          fontWeight: 700,
                          backgroundColor: `${depColor}1F`,
                          color: depColor,
                          border: `1px solid ${depColor}4D`
                        }}
                      />
                    </Box>
                    <Typography variant="caption" sx={{ color: '#AAB8BC', fontSize: '0.71rem', pl: 3.1, lineHeight: 1.3 }}>
                      {dep.desc}
                    </Typography>
                  </Box>
                );
              })}
            </Stack>

            {/* Failure Alert Banner if any dependency is down/degraded */}
            {healthInfo.failedList.length > 0 && (
              <Box sx={{ mt: 1.5, p: 1.1, backgroundColor: 'rgba(239, 68, 68, 0.1)', border: '1px solid rgba(239, 68, 68, 0.3)', borderRadius: 1.5, display: 'flex', alignItems: 'flex-start', gap: 1 }}>
                <BootstrapIcon name="bi-exclamation-triangle-fill" size={16} color="#EF4444" sx={{ mt: 0.1 }} />
                <Box>
                  <Typography variant="caption" sx={{ color: '#EF4444', fontWeight: 700, display: 'block', fontSize: '0.74rem' }}>
                    Dependency Failure: {healthInfo.failedList.join(', ')}
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#AAB8BC', fontSize: '0.7rem', display: 'block' }}>
                    Security controls or JIT policy evaluations may fail closed until service connectivity is recovered.
                  </Typography>
                </Box>
              </Box>
            )}

            {/* Footer Action: Manual Refresh */}
            <Box sx={{ mt: 1.5, pt: 1, borderTop: '1px solid #364345', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <Typography variant="caption" sx={{ color: '#64748B', fontSize: '0.7rem' }}>
                Endpoint: <code>/health</code>
              </Typography>
              <Button
                size="small"
                variant="outlined"
                startIcon={refreshing ? <CircularProgress size={12} sx={{ color: '#55E6C1' }} /> : <BootstrapIcon name="bi-arrow-clockwise" size={14} />}
                onClick={() => fetchHealth(true)}
                disabled={refreshing}
                sx={{
                  fontSize: '0.73rem',
                  py: 0.25,
                  px: 1.25,
                  borderColor: '#364345',
                  color: '#F5F7F7',
                  textTransform: 'none',
                  '&:hover': {
                    borderColor: '#55E6C1',
                    backgroundColor: 'rgba(85, 230, 193, 0.08)'
                  }
                }}
              >
                {refreshing ? 'Polling...' : 'Check Status Now'}
              </Button>
            </Box>
          </Popover>
        </Box>

        {/* User Account / Profile Navigation */}
        {isAuthenticated ? (
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Chip
              size="small"
              label={user?.roles?.[0] || 'User'}
              color={user?.roles?.includes('admin') ? 'error' : user?.roles?.includes('dba') ? 'info' : 'primary'}
              sx={{ fontWeight: 600, textTransform: 'capitalize', height: 24, fontSize: '0.72rem' }}
            />
            <Tooltip title={`Account: ${user?.username}`}>
              <IconButton onClick={handleUserMenuOpen} size="small" sx={{ ml: 0.5 }} aria-label="User Account Menu">
                <Avatar sx={{ width: 32, height: 32, bgcolor: 'rgba(85, 230, 193, 0.15)', color: '#55E6C1', border: '1px solid rgba(85, 230, 193, 0.4)', fontSize: '0.8rem', fontWeight: 700 }}>
                  {user?.username ? user.username.slice(0, 2).toUpperCase() : <BootstrapIcon name="bi-person-circle" size={16} />}
                </Avatar>
              </IconButton>
            </Tooltip>
            <Menu
              anchorEl={userMenuAnchor}
              open={Boolean(userMenuAnchor)}
              onClose={handleUserMenuClose}
              onClick={handleUserMenuClose}
              PaperProps={{
                sx: { minWidth: 220, mt: 1, backgroundColor: '#252E30', border: '1px solid #364345' }
              }}
              transformOrigin={{ horizontal: 'right', vertical: 'top' }}
              anchorOrigin={{ horizontal: 'right', vertical: 'bottom' }}
            >
              <Box sx={{ px: 2, py: 1.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#F5F7F7' }}>
                  {user?.full_name || user?.username}
                </Typography>
                <Typography variant="caption" sx={{ color: '#AAB8BC' }} display="block">
                  {user?.email}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
                  {user?.roles?.map((r) => (
                    <Chip key={r} label={r} size="small" sx={{ height: 18, fontSize: '0.65rem' }} />
                  ))}
                </Box>
              </Box>
              <Divider sx={{ borderColor: '#364345' }} />
              {user?.roles?.includes('admin') && (
                <MenuItem onClick={() => navigate('/users')}>
                  <ListItemIcon sx={{ minWidth: 28 }}>
                    <BootstrapIcon name="bi-people-fill" size={16} color="#AAB8BC" />
                  </ListItemIcon>
                  User Management
                </MenuItem>
              )}
              <MenuItem onClick={handleLogout}>
                <ListItemIcon sx={{ minWidth: 28 }}>
                  <BootstrapIcon name="bi-box-arrow-right" size={16} color="#AAB8BC" />
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
            startIcon={<BootstrapIcon name="bi-person-circle" size={16} />}
            onClick={() => navigate('/login')}
          >
            Sign In
          </Button>
        )}
      </Toolbar>
    </AppBar>
  );
}
