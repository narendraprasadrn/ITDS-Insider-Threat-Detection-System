// frontend/src/components/layout/Sidebar.jsx
import React from 'react';
import {
  Drawer,
  List,
  ListItem,
  ListItemButton,
  ListItemIcon,
  ListItemText,
  Toolbar,
  Divider,
  Box,
  Typography,
  Chip,
  Tooltip,
  Avatar
} from '@mui/material';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import BootstrapIcon from '../common/BootstrapIcon.jsx';

export const EXPANDED_DRAWER_WIDTH = 250;
export const COLLAPSED_DRAWER_WIDTH = 68;
export const DRAWER_WIDTH = EXPANDED_DRAWER_WIDTH;

export default function Sidebar({
  isMobile = false,
  mobileOpen = false,
  onMobileClose,
  collapsed = false
}) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();

  const userRoles = user?.roles || [];
  const isAdmin = userRoles.includes('admin');

  // Unified enterprise menu with strict icon and role mapping
  const menuItems = [
    { text: 'Security Console', iconName: 'bi-grid-1x2-fill', path: '/', active: true, roles: ['admin', 'dba'] },
    { text: 'User & RBAC', iconName: 'bi-people-fill', path: '/users', active: true, roles: ['admin'] },
    { text: 'Access Profiles', iconName: 'bi-database-lock', path: '/profiles', active: true },
    { text: 'OPA Policies', iconName: 'bi-shield-check', path: '/policies', active: true, roles: ['admin'] },
    { text: 'JIT Sessions', iconName: 'bi-key-fill', path: '/sessions', active: true },
    { text: 'SQL Workspace', iconName: 'bi-terminal', path: '/workspace', active: true },
    { text: 'SQL Activity Log', iconName: 'bi-journal-text', path: '/sql-events', active: true, roles: ['admin', 'dba'] },
    { text: 'Security Monitoring', iconName: 'bi-activity', path: '/monitoring', active: true, roles: ['admin', 'dba'] }
  ];

  const currentWidth = isMobile
    ? EXPANDED_DRAWER_WIDTH
    : (collapsed ? COLLAPSED_DRAWER_WIDTH : EXPANDED_DRAWER_WIDTH);

  return (
    <Drawer
      variant={isMobile ? 'temporary' : 'permanent'}
      open={isMobile ? mobileOpen : true}
      onClose={onMobileClose}
      ModalProps={{
        keepMounted: true // Optimized mobile drawer performance
      }}
      sx={{
        width: currentWidth,
        flexShrink: 0,
        whiteSpace: 'nowrap',
        boxSizing: 'border-box',
        [`& .MuiDrawer-paper`]: {
          width: currentWidth,
          boxSizing: 'border-box',
          backgroundColor: '#1F292B',
          borderRight: '1px solid #364345',
          overflowX: 'hidden',
          transition: (theme) => theme.transitions.create('width', {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen
          })
        }
      }}
    >
      <Toolbar sx={{ minHeight: '56px !important' }} />

      {/* User info status box */}
      {isAuthenticated && (
        collapsed ? (
          <Tooltip title={`Logged in as ${user?.username} (${userRoles.join(', ')})`} placement="right" arrow>
            <Box sx={{ display: 'flex', justifyContent: 'center', my: 2 }}>
              <Avatar
                sx={{
                  width: 34,
                  height: 34,
                  bgcolor: 'rgba(85, 230, 193, 0.15)',
                  color: '#55E6C1',
                  border: '1px solid rgba(85, 230, 193, 0.35)',
                  fontSize: '0.8rem',
                  fontWeight: 700
                }}
              >
                {user?.username ? user.username.slice(0, 2).toUpperCase() : 'U'}
              </Avatar>
            </Box>
          </Tooltip>
        ) : (
          <Box sx={{ p: 2 }}>
            <Box sx={{ p: 1.25, bgcolor: '#171B1C', border: '1px solid #364345', borderRadius: 1.5 }}>
              <Typography variant="caption" sx={{ color: '#AAB8BC', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', fontWeight: 600 }} display="block">
                Active Persona
              </Typography>
              <Typography variant="body2" sx={{ fontWeight: 700, color: '#F5F7F7', mt: 0.25 }}>
                {user?.username}
              </Typography>
              <Box sx={{ display: 'flex', gap: 0.5, mt: 0.75, flexWrap: 'wrap' }}>
                {userRoles.map((r) => (
                  <Chip
                    key={r}
                    label={r.toUpperCase()}
                    size="small"
                    color={r === 'admin' ? 'error' : r === 'dba' ? 'info' : 'primary'}
                    sx={{ height: 18, fontSize: '0.62rem', fontWeight: 700 }}
                  />
                ))}
              </Box>
            </Box>
          </Box>
        )
      )}

      <Divider sx={{ borderColor: '#364345' }} />

      {/* Navigation List */}
      <List sx={{ px: collapsed ? 0.75 : 1.25, pt: 1.25 }}>
        {menuItems.map((item) => {
          // Strictly enforce role-based navigation visibility
          if (item.roles && !item.roles.some(r => userRoles.includes(r))) return null;
          if (item.adminOnly && !isAdmin) return null;
          const isCurrent = location.pathname === item.path || (item.path !== '/' && location.pathname.startsWith(item.path));

          return (
            <ListItem key={item.text} disablePadding sx={{ mb: 0.5 }}>
              <Tooltip title={collapsed ? item.text : ''} placement="right" arrow disableHoverListener={!collapsed}>
                <ListItemButton
                  selected={isCurrent}
                  onClick={() => {
                    navigate(item.path);
                    if (isMobile && onMobileClose) onMobileClose();
                  }}
                  sx={{
                    borderRadius: 1.5,
                    borderLeft: isCurrent ? '3px solid #55E6C1' : '3px solid transparent',
                    px: collapsed ? 1 : 1.5,
                    justifyContent: collapsed ? 'center' : 'initial',
                    minHeight: 42,
                    '&.Mui-selected': {
                      backgroundColor: '#243D37',
                      color: '#55E6C1',
                      '&:hover': {
                        backgroundColor: 'rgba(36, 61, 55, 0.85)'
                      }
                    },
                    '&:hover': {
                      backgroundColor: 'rgba(255, 255, 255, 0.04)'
                    }
                  }}
                >
                  <ListItemIcon
                    sx={{
                      color: isCurrent ? '#55E6C1' : '#AAB8BC',
                      minWidth: collapsed ? 0 : 34,
                      mr: collapsed ? 0 : 1,
                      justifyContent: 'center',
                      alignItems: 'center'
                    }}
                  >
                    <BootstrapIcon name={item.iconName} size={17} />
                  </ListItemIcon>
                  {!collapsed && (
                    <ListItemText
                      primary={item.text}
                      primaryTypographyProps={{
                        fontSize: '0.85rem',
                        fontWeight: isCurrent ? 700 : 500,
                        color: isCurrent ? '#55E6C1' : '#F5F7F7',
                        noWrap: true
                      }}
                    />
                  )}
                </ListItemButton>
              </Tooltip>
            </ListItem>
          );
        })}
      </List>

      {/* Footer Branding Status */}
      <Box sx={{ mt: 'auto', p: collapsed ? 1.5 : 2, textAlign: collapsed ? 'center' : 'left' }}>
        {collapsed ? (
          <Tooltip title="Zero Trust Security Architecture" placement="right" arrow>
            <Box sx={{ display: 'inline-flex', color: '#55E6C1' }}>
              <BootstrapIcon name="bi-shield-check" size={16} />
            </Box>
          </Tooltip>
        ) : (
          <Typography variant="caption" sx={{ color: '#64748B', display: 'flex', alignItems: 'center', gap: 0.75, fontSize: '0.72rem' }}>
            <BootstrapIcon name="bi-shield-check" size={13} color="#55E6C1" />
            Zero-Trust RBAC Enforced
          </Typography>
        )}
      </Box>
    </Drawer>
  );
}
