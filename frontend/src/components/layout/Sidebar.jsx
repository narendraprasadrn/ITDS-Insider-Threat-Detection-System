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
  Chip
} from '@mui/material';
import DashboardIcon from '@mui/icons-material/Dashboard';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import StorageIcon from '@mui/icons-material/Storage';
import RuleIcon from '@mui/icons-material/Rule';
import VisibilityIcon from '@mui/icons-material/Visibility';
import WarningIcon from '@mui/icons-material/Warning';
import HealthAndSafetyIcon from '@mui/icons-material/HealthAndSafety';
import AdminPanelSettingsIcon from '@mui/icons-material/AdminPanelSettings';
import PolicyIcon from '@mui/icons-material/Policy';
import TerminalIcon from '@mui/icons-material/Terminal';
import { useLocation, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';

const DRAWER_WIDTH = 260;

export default function Sidebar({ open, onClose, variant = 'permanent' }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, isAuthenticated } = useAuth();

  const userRoles = user?.roles || [];
  const isAdmin = userRoles.includes('admin');
  const isAdminOrDba = userRoles.includes('admin') || userRoles.includes('dba');

  const menuItems = [
    { text: 'Security Console', icon: <DashboardIcon />, path: '/', active: true, phase: 'Phase 9', roles: ['admin', 'dba'] },
    {
      text: 'User & RBAC',
      icon: <AdminPanelSettingsIcon />,
      path: '/users',
      active: true,
      phase: 'Phase 2',
      roles: ['admin']
    },
    { text: 'Access Profiles', icon: <StorageIcon />, path: '/profiles', active: true, phase: 'Phase 3' },
    { text: 'OPA Policies', icon: <RuleIcon />, path: '/policies', active: true, phase: 'Phase 4' },
    { text: 'JIT Sessions', icon: <LockOpenIcon />, path: '/sessions', active: true, phase: 'Phase 5' },
    { text: 'SQL Workspace', icon: <TerminalIcon />, path: '/workspace', active: true, phase: 'Phase 5' },
    { text: 'SQL Activity Log', icon: <VisibilityIcon />, path: '/sql-events', active: true, phase: 'Phase 6', roles: ['admin', 'dba'] },
    { text: 'Policy Violations', icon: <PolicyIcon />, path: '/violations', active: true, phase: 'Phase 7', roles: ['admin', 'dba'] },
    { text: 'Threat & Risk Feed', icon: <WarningIcon />, path: '/threats', active: true, phase: 'Phase 8', roles: ['admin', 'dba'] }
  ];

  return (
    <Drawer
      variant={variant}
      open={open}
      onClose={onClose}
      sx={{
        width: DRAWER_WIDTH,
        flexShrink: 0,
        [`& .MuiDrawer-paper`]: {
          width: DRAWER_WIDTH,
          boxSizing: 'border-box'
        }
      }}
    >
      <Toolbar />
      <Box sx={{ p: 2 }}>
        <Typography variant="overline" color="text.secondary" sx={{ fontWeight: 700, letterSpacing: 1.2 }}>
          Navigation Shell
        </Typography>
        {isAuthenticated && (
          <Box sx={{ mt: 1, p: 1, bgcolor: 'rgba(255, 255, 255, 0.03)', borderRadius: 1.5 }}>
            <Typography variant="caption" color="text.secondary" display="block">
              Logged in as:
            </Typography>
            <Typography variant="body2" sx={{ fontWeight: 600 }}>
              {user?.username}
            </Typography>
            <Box sx={{ display: 'flex', gap: 0.5, mt: 0.5, flexWrap: 'wrap' }}>
              {userRoles.map((r) => (
                <Chip
                  key={r}
                  label={r}
                  size="small"
                  color={r === 'admin' ? 'error' : r === 'dba' ? 'info' : 'primary'}
                  sx={{ height: 18, fontSize: '0.65rem' }}
                />
              ))}
            </Box>
          </Box>
        )}
      </Box>
      <Divider />
      <List sx={{ px: 1 }}>
        {menuItems.map((item) => {
          if (item.roles && !item.roles.some(r => userRoles.includes(r))) return null;
          if (item.adminOnly && !isAdmin) return null;
          const isCurrent = location.pathname === item.path;
          return (
            <ListItem key={item.text} disablePadding sx={{ mb: 0.5 }}>
              <ListItemButton
                selected={isCurrent}
                onClick={() => navigate(item.path)}
                disabled={!item.active && !isCurrent}
                sx={{
                  borderRadius: 1.5,
                  '&.Mui-selected': {
                    backgroundColor: 'rgba(2, 136, 209, 0.16)',
                    color: 'primary.light',
                    '&:hover': {
                      backgroundColor: 'rgba(2, 136, 209, 0.24)'
                    }
                  }
                }}
              >
                <ListItemIcon sx={{ color: isCurrent ? 'primary.light' : 'text.secondary', minWidth: 40 }}>
                  {item.icon}
                </ListItemIcon>
                <ListItemText
                  primary={item.text}
                  primaryTypographyProps={{ fontSize: '0.9rem', fontWeight: isCurrent ? 600 : 400 }}
                />
                {!item.active ? (
                  <Chip
                    label={item.phase}
                    size="small"
                    sx={{ height: 20, fontSize: '0.65rem', backgroundColor: 'rgba(255,255,255,0.06)' }}
                  />
                ) : (
                  item.adminOnly && (
                    <Chip
                      label="Admin"
                      size="small"
                      color="error"
                      variant="outlined"
                      sx={{ height: 18, fontSize: '0.6rem' }}
                    />
                  )
                )}
              </ListItemButton>
            </ListItem>
          );
        })}
      </List>
      <Box sx={{ mt: 'auto', p: 2 }}>
        <Typography variant="caption" color="text.secondary" display="block">
          Role-Based Access Control Active
        </Typography>
      </Box>
    </Drawer>
  );
}
export { DRAWER_WIDTH };
