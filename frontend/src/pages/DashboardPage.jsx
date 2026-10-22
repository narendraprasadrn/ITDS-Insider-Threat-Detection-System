// frontend/src/pages/DashboardPage.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Alert,
  IconButton,
  Tooltip,
  Divider,
  Stack,
  LinearProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions
} from '@mui/material';
import ShieldIcon from '@mui/icons-material/Shield';
import SpeedIcon from '@mui/icons-material/Speed';
import WarningAmberIcon from '@mui/icons-material/WarningAmber';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import TerminalIcon from '@mui/icons-material/Terminal';
import RefreshIcon from '@mui/icons-material/Refresh';
import FiberManualRecordIcon from '@mui/icons-material/FiberManualRecord';
import CodeIcon from '@mui/icons-material/Code';
import PersonIcon from '@mui/icons-material/Person';
import PolicyIcon from '@mui/icons-material/Policy';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  CartesianGrid
} from 'recharts';
import { useAuth } from '../context/AuthContext.jsx';

export default function DashboardPage() {
  const navigate = useNavigate();
  const { user, accessToken, hasRole } = useAuth();
  const isAdminOrSecurity = hasRole('admin') || hasRole('security_analyst');

  // Live Stream State
  const [connected, setConnected] = useState(false);
  const [liveSqlFeed, setLiveSqlFeed] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [queryVelocityData, setQueryVelocityData] = useState([]);
  const [loading, setLoading] = useState(true);

  // Evidence Dialog
  const [selectedEvidence, setSelectedEvidence] = useState(null);

  const eventSourceRef = useRef(null);
  const sqlTerminalEndRef = useRef(null);

  // Initial Data Fetch
  const fetchInitialData = async () => {
    try {
      const [sessRes, alertsRes, eventsRes, scoresRes] = await Promise.all([
        fetch('/api/sessions/active', { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch('/api/alerts?limit=10', { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch('/api/sql-events?limit=25', { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch('/api/risk-scores?limit=50', { headers: { Authorization: `Bearer ${accessToken}` } })
      ]);

      const [sessData, alertsData, eventsData, scoresData] = await Promise.all([
        sessRes.json(),
        alertsRes.json(),
        eventsRes.json(),
        scoresRes.json()
      ]);

      const scoresMap = new Map();
      if (scoresData.success) {
        scoresData.data.risk_scores.forEach(s => scoresMap.set(s.session_id, s));
      }

      if (sessData.success) {
        const enrichedSessions = (sessData.data.active_sessions || []).map(sess => ({
          ...sess,
          risk: scoresMap.get(sess.id) || { score: 0, risk_level: 'low', breakdown: [] }
        }));
        setActiveSessions(enrichedSessions);
      }

      if (alertsData.success) setAlerts(alertsData.data.alerts || []);
      if (eventsData.success) setLiveSqlFeed(eventsData.data.events || []);

      // Seed chart history
      buildInitialChartData(eventsData.data?.events || []);
    } catch (err) {
      console.error('Error fetching dashboard initial data:', err);
    } finally {
      setLoading(false);
    }
  };

  const buildInitialChartData = (events) => {
    const buckets = {};
    const now = Date.now();
    for (let i = 9; i >= 0; i--) {
      const timeKey = new Date(now - i * 30000).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      buckets[timeKey] = 0;
    }

    events.forEach(evt => {
      const t = new Date(evt.event_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (buckets[t] !== undefined) buckets[t] += 1;
    });

    const chartPoints = Object.entries(buckets).map(([time, count]) => ({ time, count }));
    setQueryVelocityData(chartPoints);
  };

  // SSE Pipeline Connection
  useEffect(() => {
    if (!accessToken) return;

    fetchInitialData();

    const streamUrl = `/api/stream?token=${encodeURIComponent(accessToken)}`;
    const es = new EventSource(streamUrl);
    eventSourceRef.current = es;

    es.addEventListener('open', () => {
      setConnected(true);
    });

    es.addEventListener('connected', () => {
      setConnected(true);
    });

    // 1. Observed SQL telemetry
    es.addEventListener('query_observed', (event) => {
      try {
        const newEvt = JSON.parse(event.data);
        setLiveSqlFeed((prev) => [newEvt, ...prev.slice(0, 49)]);

        // Update velocity chart
        const timeKey = new Date(newEvt.event_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
        setQueryVelocityData((prev) => {
          const updated = [...prev];
          const lastIdx = updated.length - 1;
          if (lastIdx >= 0 && updated[lastIdx].time === timeKey) {
            updated[lastIdx].count += 1;
          } else {
            updated.push({ time: timeKey, count: 1 });
            if (updated.length > 12) updated.shift();
          }
          return updated;
        });
      } catch (e) {
        console.error('SSE parse error:', e);
      }
    });

    // 2. Policy Violations
    es.addEventListener('violation_detected', (event) => {
      try {
        const violation = JSON.parse(event.data);
        // Highlight in UI or update session risk
      } catch (e) {
        console.error('SSE violation parse error:', e);
      }
    });

    // 3. Risk Score Updates
    es.addEventListener('risk_updated', (event) => {
      try {
        const scoreData = JSON.parse(event.data);
        setActiveSessions((prev) =>
          prev.map((s) => (s.id === scoreData.session_id ? { ...s, risk: scoreData } : s))
        );
      } catch (e) {
        console.error('SSE risk parse error:', e);
      }
    });

    // 4. Alerts Created
    es.addEventListener('alert_created', (event) => {
      try {
        const newAlert = JSON.parse(event.data);
        setAlerts((prev) => [newAlert, ...prev.filter(a => a.id !== newAlert.id)]);
      } catch (e) {
        console.error('SSE alert parse error:', e);
      }
    });

    es.onerror = () => {
      setConnected(false);
    };

    return () => {
      es.close();
    };
  }, [accessToken]);

  // One-Click Session Revocation
  const handleRevokeSession = async (sessionId) => {
    try {
      const res = await fetch(`/api/sessions/${sessionId}/revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      if (data.success) {
        setActiveSessions((prev) => prev.filter((s) => s.id !== sessionId));
      }
    } catch (err) {
      console.error('Error revoking session:', err);
    }
  };

  // Metrics computation
  const activeSessionsCount = activeSessions.length;
  const openAlertsCount = alerts.filter(a => a.status === 'open').length;
  const recentQpm = queryVelocityData.length > 0 ? queryVelocityData[queryVelocityData.length - 1].count * 2 : 0;

  const highestRiskSession = activeSessions.reduce((max, s) => {
    return (s.risk?.score || 0) > (max?.risk?.score || 0) ? s : max;
  }, null);

  const getOperationColor = (op) => {
    switch (op) {
      case 'SELECT': return '#29b6f6';
      case 'INSERT': return '#66bb6a';
      case 'UPDATE': return '#ffa726';
      case 'DELETE': return '#ef5350';
      case 'DDL': return '#ab47bc';
      default: return '#78909c';
    }
  };


  if (!isAdminOrSecurity) {
    return (
      <Box sx={{ py: 6, px: 3, maxWidth: 720, mx: 'auto', textAlign: 'center' }}>
        <Card sx={{ p: 4, borderRadius: 3, boxShadow: '0 8px 32px rgba(0,0,0,0.2)' }}>
          <ShieldIcon sx={{ fontSize: 64, color: 'primary.main', mb: 2 }} />
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 1.5 }}>
            Insider Threat Detection System
          </Typography>
          <Typography variant="body1" color="text.secondary" sx={{ mb: 3 }}>
            Welcome, <strong>{user?.full_name || user?.username}</strong>! You are currently logged in with the <strong>[{user?.roles?.join(', ')}]</strong> role.
          </Typography>
          <Alert severity="info" sx={{ mb: 4, textAlign: 'left' }}>
            The central Security Operations Console & real-time telemetry stream are restricted to Security Analysts and Administrators.
            As an employee or developer, you can request and manage Just-In-Time (JIT) ephemeral database credentials under the <strong>JIT Sessions</strong> tab.
          </Alert>
          <Button
            variant="contained"
            size="large"
            onClick={() => navigate('/sessions')}
            startIcon={<LockOpenIcon />}
            sx={{ px: 4, py: 1.2, fontWeight: 600 }}
          >
            Go to JIT Access Sessions
          </Button>
        </Card>
      </Box>
    );
  }

  return (
    <Box>
      {/* Real-time Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#e0e6ed' }}>
            ITDS Security Operations Center
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Real-time server-side database auditing, least-privilege JIT sessions, and behavioral insider threat defense.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Chip
            icon={<FiberManualRecordIcon sx={{ fontSize: '12px !important', color: connected ? '#4caf50' : '#f44336' }} />}
            label={connected ? 'LIVE PIPELINE (SSE)' : 'DISCONNECTED'}
            size="small"
            variant="outlined"
            sx={{
              borderColor: connected ? 'rgba(76, 175, 80, 0.4)' : 'rgba(244, 67, 54, 0.4)',
              color: connected ? '#81c784' : '#e57373',
              fontWeight: 700
            }}
          />
          <Button
            size="small"
            variant="outlined"
            startIcon={<RefreshIcon />}
            onClick={fetchInitialData}
          >
            Sync
          </Button>
        </Stack>
      </Box>

      {/* Top Bar Metrics */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: 'background.paper', border: '1px solid rgba(255,255,255,0.08)' }}>
            <CardContent sx={{ py: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                Active JIT Sessions
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#90caf9', mt: 0.5 }}>
                {activeSessionsCount}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Ephemeral accounts in MySQL
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: 'background.paper', border: '1px solid rgba(255,255,255,0.08)' }}>
            <CardContent sx={{ py: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                Queries / Minute (Telemetry)
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#81c784', mt: 0.5 }}>
                {recentQpm} QPM
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Ingested from general_log
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: 'background.paper', border: '1px solid rgba(255,255,255,0.08)' }}>
            <CardContent sx={{ py: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                Open Threat Alerts
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, color: openAlertsCount > 0 ? '#ef5350' : '#81c784', mt: 0.5 }}>
                {openAlertsCount}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Requires analyst triage
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: 'background.paper', border: '1px solid rgba(255,255,255,0.08)' }}>
            <CardContent sx={{ py: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                Peak Risk Session
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, color: (highestRiskSession?.risk?.score || 0) >= 70 ? '#ef5350' : '#ffa726', mt: 0.5 }}>
                {highestRiskSession ? `${highestRiskSession.risk?.score || 0}/100` : 'None'}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                {highestRiskSession ? `Session #${highestRiskSession.id} (${highestRiskSession.username})` : 'All sessions nominal'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Main Grid: Live Terminal Feed & Telemetry Velocity Chart */}
      <Grid container spacing={3} sx={{ mb: 3 }}>
        {/* Terminal Live SQL Activity Feed */}
        <Grid item xs={12} lg={7}>
          <Card sx={{ bgcolor: '#07090e', border: '1px solid rgba(255,255,255,0.1)', height: 380, display: 'flex', flexDirection: 'column' }}>
            <CardHeader
              avatar={<TerminalIcon sx={{ color: '#90caf9' }} />}
              title={<Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#e0e6ed' }}>Live Server-Side SQL Feed (mysql.general_log)</Typography>}
              subheader={<Typography variant="caption" color="text.secondary">Auto-scrolling stream directly from database engine</Typography>}
              action={<Chip label={`${liveSqlFeed.length} buffered`} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.05)' }} />}
              sx={{ pb: 1 }}
            />
            <Divider sx={{ borderColor: 'rgba(255,255,255,0.06)' }} />
            <Box sx={{ p: 1.5, flex: 1, overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.78rem' }}>
              {liveSqlFeed.length === 0 ? (
                <Typography variant="caption" color="text.disabled" sx={{ p: 1, display: 'block' }}>
                  Awaiting database queries...
                </Typography>
              ) : (
                liveSqlFeed.map((evt, idx) => {
                  const tStr = new Date(evt.event_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                  return (
                    <Box key={evt.id || idx} sx={{ mb: 1, p: 0.8, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 1, borderLeft: `3px solid ${getOperationColor(evt.operation)}` }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.3 }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="caption" sx={{ color: '#78909c' }}>{tStr}</Typography>
                          <Chip label={evt.operation} size="small" sx={{ height: 16, fontSize: '0.62rem', fontWeight: 700, bgcolor: `${getOperationColor(evt.operation)}22`, color: getOperationColor(evt.operation) }} />
                          <Typography variant="caption" sx={{ color: '#90caf9', fontWeight: 600 }}>
                            {evt.username ? `${evt.username} (#${evt.session_id})` : evt.mysql_username}
                          </Typography>
                        </Stack>
                        {evt.flags?.is_unbounded_read && (
                          <Chip label="UNBOUNDED" size="small" color="warning" sx={{ height: 16, fontSize: '0.6rem', fontWeight: 700 }} />
                        )}
                      </Box>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#cfd8dc', wordBreak: 'break-all' }}>
                        {evt.raw_sql}
                      </Typography>
                    </Box>
                  );
                })
              )}
              <div ref={sqlTerminalEndRef} />
            </Box>
          </Card>
        </Grid>

        {/* Query Volume Area Chart */}
        <Grid item xs={12} lg={5}>
          <Card sx={{ bgcolor: 'background.paper', border: '1px solid rgba(255,255,255,0.08)', height: 380, display: 'flex', flexDirection: 'column' }}>
            <CardHeader
              avatar={<SpeedIcon color="primary" />}
              title={<Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Query Telemetry Volume Over Time</Typography>}
              subheader="Queries ingested per time interval"
              sx={{ pb: 1 }}
            />
            <Divider />
            <Box sx={{ p: 2, flex: 1, minHeight: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={queryVelocityData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="queryGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#0288d1" stopOpacity={0.8} />
                      <stop offset="95%" stopColor="#0288d1" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.05)" />
                  <XAxis dataKey="time" stroke="#78909c" fontSize={11} />
                  <YAxis stroke="#78909c" fontSize={11} />
                  <RechartsTooltip contentStyle={{ backgroundColor: '#10141b', borderColor: '#37474f' }} />
                  <Area type="monotone" dataKey="count" stroke="#0288d1" fillOpacity={1} fill="url(#queryGradient)" name="Queries" />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
          </Card>
        </Grid>
      </Grid>

      {/* Active JIT Sessions with 1-Click Revoke & Live Threat Score */}
      <Card sx={{ bgcolor: 'background.paper', border: '1px solid rgba(255,255,255,0.08)', mb: 3 }}>
        <CardHeader
          avatar={<LockOpenIcon color="primary" />}
          title={<Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Monitored Active JIT Database Sessions</Typography>}
          subheader="Real-time session risk evaluation and instant connection termination"
          action={
            <Chip
              label={`${activeSessions.length} Active`}
              color="primary"
              size="small"
              sx={{ fontWeight: 700 }}
            />
          }
        />
        <Divider />
        <TableContainer>
          <Table size="small">
            <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Session</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Attributed User</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Access Profile</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>MySQL Ephemeral User</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Expires At</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Live Risk Score</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {activeSessions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                    <Typography variant="body2" color="text.secondary">
                      No active JIT database sessions currently provisioned.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                activeSessions.map((sess) => {
                  const score = sess.risk?.score || 0;
                  const riskLevel = sess.risk?.risk_level || 'low';
                  const expires = new Date(sess.end_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

                  return (
                    <TableRow key={sess.id} hover>
                      <TableCell>
                        <Chip label={`#${sess.id}`} size="small" color="primary" variant="outlined" sx={{ height: 20 }} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{sess.username}</Typography>
                        <Typography variant="caption" color="text.secondary">{sess.full_name}</Typography>
                      </TableCell>
                      <TableCell>{sess.profile_name}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem' }}>
                        {sess.mysql_username}
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.8rem' }}>{expires}</TableCell>
                      <TableCell sx={{ width: 180 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 700, color: score >= 70 ? '#ef5350' : score >= 40 ? '#ffa726' : '#81c784' }}>
                            {score}/100
                          </Typography>
                          <Box sx={{ width: 70 }}>
                            <LinearProgress
                              variant="determinate"
                              value={score}
                              color={score >= 70 ? 'error' : score >= 40 ? 'warning' : 'success'}
                              sx={{ height: 6, borderRadius: 3 }}
                            />
                          </Box>
                          {sess.risk?.breakdown?.length > 0 && (
                            <Tooltip title={`${sess.risk.breakdown.length} detector(s) fired`}>
                              <IconButton size="small" onClick={() => setSelectedEvidence({ title: `Session #${sess.id} Threat Breakdown`, score, breakdown: sess.risk.breakdown })}>
                                <CodeIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <Button
                          variant="outlined"
                          color="error"
                          size="small"
                          startIcon={<DeleteForeverIcon />}
                          onClick={() => handleRevokeSession(sess.id)}
                          sx={{ fontSize: '0.7rem', py: 0.3 }}
                        >
                          Revoke
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* Real-time Alerts Feed */}
      <Card sx={{ bgcolor: 'background.paper', border: '1px solid rgba(255,255,255,0.08)' }}>
        <CardHeader
          avatar={<WarningAmberIcon color="error" />}
          title={<Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Security Incident Alerts</Typography>}
          subheader="Automated high-risk session incident detections"
          action={<Chip label={`${alerts.length} total`} size="small" sx={{ bgcolor: 'rgba(255,255,255,0.05)' }} />}
        />
        <Divider />
        <TableContainer>
          <Table size="small">
            <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Severity</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Risk Score</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Session / User</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Alert Details</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Evidence Audit</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {alerts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} align="center" sx={{ py: 3 }}>
                    <Typography variant="body2" color="text.secondary">
                      No security incident alerts generated.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                alerts.slice(0, 5).map((alert) => (
                  <TableRow key={alert.id} hover>
                    <TableCell>
                      <Chip
                        label={alert.status.toUpperCase()}
                        size="small"
                        color={alert.status === 'open' ? 'error' : alert.status === 'investigating' ? 'warning' : 'success'}
                        variant="outlined"
                        sx={{ fontSize: '0.65rem', height: 20, fontWeight: 700 }}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={alert.severity.toUpperCase()}
                        size="small"
                        color={alert.severity === 'critical' ? 'error' : 'warning'}
                        sx={{ fontSize: '0.65rem', height: 20, fontWeight: 700 }}
                      />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, color: '#ef5350' }}>
                      {alert.risk_score}/100
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>Session #{alert.session_id}</Typography>
                      <Typography variant="caption" color="text.secondary">{alert.username}</Typography>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 320 }}>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>{alert.title}</Typography>
                      <Typography variant="caption" color="text.secondary">{alert.description}</Typography>
                    </TableCell>
                    <TableCell align="center">
                      <Button
                        size="small"
                        variant="outlined"
                        onClick={() => setSelectedEvidence({ title: alert.title, score: alert.risk_score, breakdown: alert.evidence })}
                        sx={{ fontSize: '0.7rem', py: 0.2 }}
                      >
                        Inspect Evidence
                      </Button>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* Evidence Breakdown Dialog */}
      <Dialog
        open={Boolean(selectedEvidence)}
        onClose={() => setSelectedEvidence(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <SpeedIcon color="warning" />
            <Typography variant="h6">{selectedEvidence?.title}</Typography>
          </Box>
          <Chip
            label={`Score: ${selectedEvidence?.score || 0}/100`}
            color={(selectedEvidence?.score || 0) >= 70 ? 'error' : 'warning'}
            sx={{ fontWeight: 700 }}
          />
        </DialogTitle>
        <DialogContent dividers>
          {selectedEvidence && (
            <Stack spacing={2}>
              {Array.isArray(selectedEvidence.breakdown) && selectedEvidence.breakdown.length > 0 ? (
                selectedEvidence.breakdown.map((item, idx) => (
                  <Paper key={idx} sx={{ p: 2, bgcolor: '#0a0d12', border: '1px solid rgba(255,255,255,0.08)' }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="subtitle2" sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#90caf9' }}>
                        {item.rule_id}
                      </Typography>
                      <Chip label={`+${item.weight} pts`} color="error" size="small" sx={{ fontWeight: 700, height: 20 }} />
                    </Box>
                    <Typography variant="body2" sx={{ color: '#cfd8dc', mb: 1 }}>{item.explanation}</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="caption" color="text.secondary">Trigger Event IDs:</Typography>
                      {Array.isArray(item.evidence_event_ids) && item.evidence_event_ids.map(id => (
                        <Chip key={id} label={`Event #${id}`} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.65rem' }} />
                      ))}
                    </Box>
                  </Paper>
                ))
              ) : (
                <Typography variant="body2" color="text.secondary">No anomalous evidence recorded.</Typography>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedEvidence(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
