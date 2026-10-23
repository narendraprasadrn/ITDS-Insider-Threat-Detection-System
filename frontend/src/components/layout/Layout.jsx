// frontend/src/components/layout/Layout.jsx
import React, { useState } from 'react';
import { Box, Toolbar, useMediaQuery, useTheme } from '@mui/material';
import { Outlet } from 'react-router-dom';
import Navbar from './Navbar.jsx';
import Sidebar, { EXPANDED_DRAWER_WIDTH, COLLAPSED_DRAWER_WIDTH } from './Sidebar.jsx';

export default function Layout() {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const [mobileOpen, setMobileOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const handleToggleSidebar = () => {
    if (isMobile) {
      setMobileOpen((prev) => !prev);
    } else {
      setSidebarCollapsed((prev) => !prev);
    }
  };

  const handleMobileClose = () => {
    setMobileOpen(false);
  };

  const currentDrawerWidth = isMobile
    ? 0
    : (sidebarCollapsed ? COLLAPSED_DRAWER_WIDTH : EXPANDED_DRAWER_WIDTH);

  return (
    <Box sx={{ display: 'flex', minHeight: '100vh', backgroundColor: 'background.default' }}>
      <Navbar
        onToggleSidebar={handleToggleSidebar}
        sidebarCollapsed={isMobile ? !mobileOpen : sidebarCollapsed}
        isMobile={isMobile}
      />
      <Sidebar
        isMobile={isMobile}
        mobileOpen={mobileOpen}
        onMobileClose={handleMobileClose}
        collapsed={!isMobile && sidebarCollapsed}
      />
      <Box
        component="main"
        sx={{
          flexGrow: 1,
          p: { xs: 2, sm: 3 },
          width: isMobile ? '100%' : `calc(100% - ${currentDrawerWidth}px)`,
          minHeight: '100vh',
          backgroundColor: 'background.default',
          transition: theme.transitions.create(['width', 'margin'], {
            easing: theme.transitions.easing.sharp,
            duration: theme.transitions.duration.enteringScreen
          }),
          overflowX: 'hidden'
        }}
      >
        <Toolbar sx={{ minHeight: '56px !important' }} />
        <Outlet />
      </Box>
    </Box>
  );
}
