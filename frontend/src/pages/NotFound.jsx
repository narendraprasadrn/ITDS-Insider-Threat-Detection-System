// frontend/src/pages/NotFound.jsx
import React from 'react';
import { Box, Typography, Button, Container } from '@mui/material';
import BootstrapIcon from '../components/common/BootstrapIcon.jsx';
import { useNavigate } from 'react-router-dom';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <Container maxWidth="sm">
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <BootstrapIcon name="bi-shield-lock-fill" size={48} color="#55E6C1" sx={{ mb: 2, opacity: 0.8 }} />
        <Typography variant="h1" sx={{ fontWeight: 800, fontSize: '4.5rem', mb: 1, color: '#55E6C1' }}>
          404
        </Typography>
        <Typography variant="h5" sx={{ mb: 1.5, fontWeight: 700, color: '#F5F7F7' }}>
          Resource Not Found
        </Typography>
        <Typography variant="body2" sx={{ color: '#AAB8BC', mb: 4, maxWidth: 420, mx: 'auto' }}>
          The requested security endpoint or console route does not exist in the Insider Threat Detection System.
        </Typography>
        <Button
          variant="contained"
          startIcon={<BootstrapIcon name="bi-house-door-fill" size={16} />}
          onClick={() => navigate('/')}
        >
          Return to Security Console
        </Button>
      </Box>
    </Container>
  );
}
