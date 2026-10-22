// frontend/src/components/auth/ProtectedRoute.jsx
import React from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext.jsx';
import { Box, CircularProgress, Typography, Alert, Button } from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';

export default function ProtectedRoute({ children, requiredRoles = [] }) {
  const { user, loading, isAuthenticated } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
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
        <Box sx={{ py: 6, px: 2, maxWidth: 600, mx: 'auto', textAlign: 'center' }}>
          <Alert
            severity="error"
            icon={<LockIcon fontSize="inherit" />}
            sx={{
              backgroundColor: 'rgba(244, 67, 54, 0.1)',
              border: '1px solid rgba(244, 67, 54, 0.3)',
              mb: 3
            }}
          >
            <Typography variant="h6" sx={{ fontWeight: 600, mb: 1 }}>
              Access Denied (403 Forbidden)
            </Typography>
            <Typography variant="body2" sx={{ mb: 1 }}>
              Your current role <strong>[{user?.roles?.join(', ')}]</strong> does not have permission to access this resource.
            </Typography>
            <Typography variant="caption" color="text.secondary">
              Required one of: [{requiredRoles.join(', ')}]
            </Typography>
          </Alert>
          <Button variant="outlined" color="primary" onClick={() => window.history.back()}>
            Go Back
          </Button>
        </Box>
      );
    }
  }

  return children;
}
