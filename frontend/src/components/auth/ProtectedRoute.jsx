// frontend/src/components/auth/ProtectedRoute.jsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { Box, CircularProgress, Typography, Alert, Button } from '@mui/material';
import BootstrapIcon from '../common/BootstrapIcon.jsx';

export default function ProtectedRoute({ children, requiredRoles = [] }) {
  const { user, loading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress size={32} sx={{ color: '#55E6C1' }} />
      </Box>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" state={{ from: location }} replace />;
  }

  if (requiredRoles.length > 0) {
    const hasRequired = user?.roles?.some(role => requiredRoles.includes(role));
    if (!hasRequired) {
      return (
        <Box sx={{ py: 6, px: 2, maxWidth: 540, mx: 'auto', textAlign: 'center' }}>
          <Alert
            severity="error"
            icon={<BootstrapIcon name="bi-shield-lock-fill" size={20} color="#EF4444" />}
            sx={{
              backgroundColor: 'rgba(239, 68, 68, 0.08)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              mb: 3,
              textAlign: 'left'
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 1, color: '#FCA5A5' }}>
              Access Denied (403 Forbidden)
            </Typography>
            <Typography variant="body2" sx={{ mb: 1, color: '#F5F7F7' }}>
              Your current role <strong>[{user?.roles?.join(', ')}]</strong> does not have permission to access this resource.
            </Typography>
            <Typography variant="caption" sx={{ color: '#AAB8BC' }}>
              Required one of: [{requiredRoles.join(', ')}]
            </Typography>
          </Alert>
          <Button
            variant="outlined"
            color="primary"
            startIcon={<BootstrapIcon name="bi-arrow-left" size={15} />}
            onClick={() => window.history.back()}
          >
            Return to Previous Page
          </Button>
        </Box>
      );
    }
  }

  return children;
}
