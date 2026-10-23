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
import BootstrapIcon from '../components/common/BootstrapIcon.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useNavigate, useLocation } from 'react-router-dom';

const DEMO_PERSONAS = [
  { username: 'admin', role: 'admin', label: 'Admin', color: 'error' },
  { username: 'dba', role: 'dba', label: 'DBA', color: 'info' },
  { username: 'developer', role: 'developer', label: 'Developer', color: 'primary' }
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
      setError(err.response?.data?.error?.message || err.message || 'Authentication failed. Please verify credentials.');
    } finally {
      setLoading(false);
    }
  };

  const handleSelectPersona = (personaUsername) => {
    setUsername(personaUsername);
    setPassword('Password123!');
  };

  return (
    <Box
      sx={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        backgroundColor: '#171B1C',
        px: 2,
        py: 4
      }}
    >
      <Container maxWidth="xs">
        <Card
          sx={{
            backgroundColor: '#252E30',
            border: '1px solid #364345',
            borderRadius: 2.5,
            boxShadow: '0 8px 32px rgba(0, 0, 0, 0.45)',
            p: 1
          }}
        >
          <CardContent sx={{ p: { xs: 2.5, sm: 3.5 } }}>
            <Box sx={{ textAlign: 'center', mb: 3 }}>
              <Box
                sx={{
                  width: 48,
                  height: 48,
                  borderRadius: 2,
                  bgcolor: 'rgba(85, 230, 193, 0.12)',
                  border: '1px solid rgba(85, 230, 193, 0.3)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  mx: 'auto',
                  mb: 1.5
                }}
              >
                <BootstrapIcon name="bi-shield-lock-fill" size={26} color="#55E6C1" />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 700, letterSpacing: '0.01em', color: '#F5F7F7' }}>
                ITDS Authentication
              </Typography>
              <Typography variant="body2" sx={{ color: '#AAB8BC', fontSize: '0.82rem', mt: 0.5 }}>
                Insider Threat Detection System • Zero-Trust Access Console
              </Typography>
            </Box>

            {error && (
              <Alert
                severity="error"
                icon={<BootstrapIcon name="bi-exclamation-triangle-fill" size={16} color="#EF4444" />}
                sx={{ mb: 2.5, borderRadius: 1.5 }}
              >
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
                startIcon={loading ? <CircularProgress size={18} color="inherit" /> : <BootstrapIcon name="bi-box-arrow-in-right" size={17} />}
                sx={{ py: 1.2, fontWeight: 700, fontSize: '0.92rem' }}
              >
                {loading ? 'Authenticating...' : 'Sign In to Console'}
              </Button>
            </Box>

            <Divider sx={{ my: 3, borderColor: '#364345' }}>
              <Typography variant="caption" sx={{ color: '#AAB8BC', fontSize: '0.72rem', letterSpacing: '0.04em' }}>
                QUICK-SELECT PERSONA
              </Typography>
            </Divider>

            <Paper variant="outlined" sx={{ p: 1.75, backgroundColor: '#171B1C', border: '1px solid #364345', borderRadius: 2 }}>
              <Typography variant="caption" sx={{ color: '#AAB8BC', mb: 1.25, fontSize: '0.74rem' }} display="block">
                Click any persona to load seeded role credentials:
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                {DEMO_PERSONAS.map((p) => (
                  <Chip
                    key={p.username}
                    label={p.label}
                    color={p.color}
                    variant={username === p.username ? 'filled' : 'outlined'}
                    onClick={() => handleSelectPersona(p.username)}
                    icon={<BootstrapIcon name="bi-person-badge" size={13} />}
                    clickable
                    size="small"
                    sx={{ height: 26, fontSize: '0.74rem', fontWeight: 600 }}
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
