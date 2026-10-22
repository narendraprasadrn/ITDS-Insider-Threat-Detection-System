// frontend/src/pages/NotFound.jsx
import React from 'react';
import { Box, Typography, Button, Container } from '@mui/material';
import HomeIcon from '@mui/icons-material/Home';
import { useNavigate } from 'react-router-dom';

export default function NotFound() {
  const navigate = useNavigate();

  return (
    <Container maxWidth="sm">
      <Box sx={{ textAlign: 'center', py: 8 }}>
        <Typography variant="h1" color="primary" sx={{ fontWeight: 800, fontSize: '5rem', mb: 1 }}>
          404
        </Typography>
        <Typography variant="h5" sx={{ mb: 2, fontWeight: 600 }}>
          Page Not Found
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 4 }}>
          The requested page or route does not exist in this phase of the Insider Threat Detection System.
        </Typography>
        <Button
          variant="contained"
          startIcon={<HomeIcon />}
          onClick={() => navigate('/')}
        >
          Return to System Dashboard
        </Button>
      </Box>
    </Container>
  );
}
