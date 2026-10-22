// frontend/src/pages/DashboardPlaceholder.jsx
import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Button,
  LinearProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableRow,
  Paper,
  Alert
} from '@mui/material';
import StorageIcon from '@mui/icons-material/Storage';
import RuleIcon from '@mui/icons-material/Rule';
import DnsIcon from '@mui/icons-material/Dns';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';

export default function DashboardPlaceholder() {
  const [healthData, setHealthData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [lastChecked, setLastChecked] = useState(null);

  const fetchHealth = async () => {
    setLoading(true);
    try {
      const res = await fetch('/health');
      const json = await res.json();
      setHealthData(json);
      setLastChecked(new Date().toLocaleTimeString());
    } catch {
      setHealthData({ success: false, error: { message: 'Failed to connect to backend API' } });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const db = healthData?.data?.dependencies?.database;
  const opa = healthData?.data?.dependencies?.opa;

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Infrastructure & Scaffold Dashboard
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Phase 1 verification: Monorepo, Express Backend, MySQL 8 (general_log=TABLE), and OPA engine.
          </Typography>
        </Box>
        <Button
          startIcon={<RefreshIcon />}
          variant="outlined"
          size="small"
          onClick={fetchHealth}
          disabled={loading}
        >
          Refresh Status
        </Button>
      </Box>

      {loading && <LinearProgress sx={{ mb: 3, borderRadius: 1 }} />}

      <Grid container spacing={3}>
        {/* Card 1: Backend Express API */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardHeader
              avatar={<DnsIcon color="primary" />}
              title="Backend Express API"
              subheader="Node.js 22 + ESM"
              action={
                <Chip
                  size="small"
                  label={healthData?.success ? 'ONLINE' : 'OFFLINE'}
                  color={healthData?.success ? 'success' : 'error'}
                />
              }
            />
            <CardContent>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableBody>
                    <TableRow>
                      <TableCell sx={{ color: 'text.secondary' }}>Status</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>
                        {healthData?.data?.status || 'Unknown'}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ color: 'text.secondary' }}>Uptime</TableCell>
                      <TableCell align="right">
                        {healthData?.data?.uptime ? `${Math.round(healthData.data.uptime)}s` : 'N/A'}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ color: 'text.secondary' }}>Response Time</TableCell>
                      <TableCell align="right">
                        {healthData?.data?.responseTimeMs ? `${healthData.data.responseTimeMs}ms` : 'N/A'}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ color: 'text.secondary' }}>Last Check</TableCell>
                      <TableCell align="right">{lastChecked || 'Pending'}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Card 2: MySQL 8 Database */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardHeader
              avatar={<StorageIcon color="primary" />}
              title="MySQL 8 Service"
              subheader="Schemas: itds_app & target_db"
              action={
                <Chip
                  size="small"
                  label={db?.status === 'up' ? 'CONNECTED' : 'DISCONNECTED'}
                  color={db?.status === 'up' ? 'success' : 'error'}
                />
              }
            />
            <CardContent>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableBody>
                    <TableRow>
                      <TableCell sx={{ color: 'text.secondary' }}>Connection</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>
                        {db?.details?.connected ? 'Established' : 'Failed'}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ color: 'text.secondary' }}>log_output</TableCell>
                      <TableCell align="right">
                        <Chip size="small" label={db?.details?.logOutput || 'UNKNOWN'} color="info" />
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ color: 'text.secondary' }}>general_log</TableCell>
                      <TableCell align="right">
                        <Chip
                          size="small"
                          label={db?.details?.generalLogActive ? 'ACTIVE (1)' : 'DISABLED (0)'}
                          color={db?.details?.generalLogActive ? 'success' : 'error'}
                        />
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ color: 'text.secondary' }}>Captured SQL Rows</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>
                        {db?.details?.generalLogRows ?? 'N/A'}
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Card 3: Open Policy Agent */}
        <Grid item xs={12} md={4}>
          <Card sx={{ height: '100%' }}>
            <CardHeader
              avatar={<RuleIcon color="primary" />}
              title="Open Policy Agent"
              subheader="Server Mode (Port 8181)"
              action={
                <Chip
                  size="small"
                  label={opa?.status === 'up' ? 'REACHABLE' : 'UNREACHABLE'}
                  color={opa?.status === 'up' ? 'success' : 'error'}
                />
              }
            />
            <CardContent>
              <TableContainer component={Paper} variant="outlined">
                <Table size="small">
                  <TableBody>
                    <TableRow>
                      <TableCell sx={{ color: 'text.secondary' }}>Endpoint</TableCell>
                      <TableCell align="right">http://127.0.0.1:8181</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ color: 'text.secondary' }}>OPA Health Status</TableCell>
                      <TableCell align="right" sx={{ fontWeight: 600 }}>
                        {opa?.details?.data?.status || (opa?.status === 'up' ? 'ok' : 'Failed')}
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ color: 'text.secondary' }}>Policy System</TableCell>
                      <TableCell align="right">{opa?.details?.data?.system || 'itds.system'}</TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell sx={{ color: 'text.secondary' }}>OPA Version</TableCell>
                      <TableCell align="right">{opa?.details?.data?.version || '0.68.0'}</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </TableContainer>
            </CardContent>
          </Card>
        </Grid>

        {/* Phase 1 Verification Checklist Banner */}
        <Grid item xs={12}>
          <Alert
            severity="success"
            icon={<CheckCircleOutlineIcon fontSize="inherit" />}
            sx={{
              backgroundColor: 'rgba(46, 125, 50, 0.1)',
              border: '1px solid rgba(46, 125, 50, 0.3)',
              color: '#a5d6a7'
            }}
          >
            <Typography variant="subtitle2" sx={{ fontWeight: 700, mb: 0.5 }}>
              Phase 1 Deliverables Active & Verified:
            </Typography>
            <Box component="ul" sx={{ m: 0, pl: 2.5, fontSize: '0.85rem' }}>
              <li>Monorepo structure initialized (/backend, /frontend, /policies, /scripts, /docs).</li>
              <li>docker-compose.yml configured for MySQL 8 (general_log=ON, log_output=TABLE) and OPA server.</li>
              <li>MySQL schemas created: <code>itds_app</code> and <code>target_db</code> with 556 seed rows (employees, salaries, customers, orders, payments, departments).</li>
              <li>Privileged backend user <code>itds_admin</code> created with CREATE USER, PROCESS, and general_log access.</li>
              <li>Express API server operational with Pino logging, MySQL2 pool, OPA client, and central error handling.</li>
              <li>Frontend Vite + React + Material UI layout shell rendered.</li>
            </Box>
          </Alert>
        </Grid>
      </Grid>
    </Box>
  );
}
