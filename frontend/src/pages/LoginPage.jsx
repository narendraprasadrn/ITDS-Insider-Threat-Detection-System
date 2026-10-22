// frontend/src/pages/LoginPage.jsx
import React, { useState } from 'react';
import {
  Box,
  Card,
  CardContent,
  Typography,
  TextField,
  Button,
  Alert,
  CircularProgress,
  Chip,
  Divider,
  Container,
  Paper
} from '@mui/material';
import SecurityIcon from '@mui/icons-material/Security';
import LoginIcon from '@mui/icons-material/Login';
import PersonIcon from '@mui/icons-material/Person';
import { useAuth } from '../context/AuthContext.jsx';
import { useNavigate, useLocation } from 'react-router-dom';

const DEMO_PERSONAS = [
  { username: 'admin', role: 'admin', label: 'Admin', color: 'error' },
  { username: 'security_analyst', role: 'security_analyst', label: 'Sec Analyst', color: 'warning' },
  { username: 'dba', role: 'dba', label: 'DBA', color: 'info' },
  { username: 'developer', role: 'developer', label: 'Developer', color: 'primary' },
  { username: 'analyst', role: 'analyst', label: 'Analyst', color: 'secondary' },
  { username: 'hr_staff', role: 'hr_staff', label: 'HR Staff', color: 'success' }
];

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('Password123!');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const from = location.state?.from?.pathname || '/';

  const handleSubmit = async (e) => {
    if (e) e.preventDefault();
    setError(null);
    setLoading(true);

    try {
      await login(username, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPersona = (personaUsername) => {
    setUsername(personaUsername);
    setPassword('Password123!');
    setError(null);
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#070b14',
        p: 2
      }}
    >
      <Container maxWidth="sm">
        <Card
          sx={{
            backgroundColor: '#0f172a',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.5)',
            borderRadius: 3,
            p: 1
          }}
        >
          <CardContent sx={{ p: { xs: 3, sm: 4 } }}>
            <Box sx={{ textAlign: 'center', mb: 3 }}>
              <SecurityIcon sx={{ fontSize: 50, color: 'primary.main', mb: 1 }} />
              <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: '0.02em' }}>
                ITDS Authentication
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Insider Threat Detection System - Role-Based Access Control
              </Typography>
            </Box>

            {error && (
              <Alert severity="error" sx={{ mb: 3, borderRadius: 1.5 }}>
                {error}
              </Alert>
            )}

            <Box component="form" onSubmit={handleSubmit} noValidate>
              <TextField
                margin="normal"
                required
                fullWidth
                id="username"
                label="Username or Email"
                name="username"
                autoComplete="username"
                autoFocus
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                sx={{ mb: 2 }}
              />

              <TextField
                margin="normal"
                required
                fullWidth
                name="password"
                label="Password"
                type="password"
                id="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                sx={{ mb: 3 }}
              />

              <Button
                type="submit"
                fullWidth
                variant="contained"
                size="large"
                disabled={loading}
                startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <LoginIcon />}
                sx={{ py: 1.2, fontWeight: 600, fontSize: '0.95rem' }}
              >
                {loading ? 'Authenticating...' : 'Sign In'}
              </Button>
            </Box>

            <Divider sx={{ my: 3 }}>
              <Typography variant="caption" color="text.secondary">
                ONE-CLICK DEMO PERSONAS (Phase 2 Seed)
              </Typography>
            </Divider>

            <Paper variant="outlined" sx={{ p: 2, backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1.5 }}>
                Click any role to load seeded credentials (all use <code>Password123!</code>):
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {DEMO_PERSONAS.map((p) => (
                  <Chip
                    key={p.username}
                    label={`${p.label}`}
                    color={p.color}
                    variant={username === p.username ? 'filled' : 'outlined'}
                    onClick={() => handleSelectPersona(p.username)}
                    icon={<PersonIcon />}
                    clickable
                    size="small"
                  />
                ))}
              </Box>
            </Paper>
          </CardContent>
        </Card>
      </Container>
    </Box>
  );
}
