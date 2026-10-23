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
import BootstrapIcon from '../components/common/BootstrapIcon.jsx';
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
  const isAdminOrDba = hasRole('admin') || hasRole('dba');

  // Live Stream State
  const [connected, setConnected] = useState(false);
  const [liveSqlFeed, setLiveSqlFeed] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);
  const [alerts, setAlerts] = useState([]);
  const [violations, setViolations] = useState([]);
  const [queryVelocityData, setQueryVelocityData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Evidence Dialog
  const [selectedEvidence, setSelectedEvidence] = useState(null);

  const eventSourceRef = useRef(null);
  const sqlTerminalEndRef = useRef(null);

  // Initial Data Fetch
  const fetchInitialData = async () => {
    try {
      setError(null);
      const [sessRes, alertsRes, eventsRes, scoresRes, violsRes] = await Promise.all([
        fetch('/api/sessions/active', { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch('/api/alerts?limit=50', { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch('/api/sql-events?limit=50', { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch('/api/risk-scores?limit=50', { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch('/api/violations?limit=50', { headers: { Authorization: `Bearer ${accessToken}` } })
      ]);

      if (!sessRes.ok || !alertsRes.ok || !eventsRes.ok || !scoresRes.ok || !violsRes.ok) {
        throw new Error('Failed to retrieve security data from server');
      }

      const [sessData, alertsData, eventsData, scoresData, violsData] = await Promise.all([
        sessRes.json(),
        alertsRes.json(),
        eventsRes.json(),
        scoresRes.json(),
        violsRes.json()
      ]);

      const scoresMap = new Map();
      if (scoresData.success) {
        scoresData.data.risk_scores.forEach(s => scoresMap.set(s.session_id, s));
      }

      if (sessData.success) {
        const sessionList = sessData.data.active_sessions || sessData.data.sessions || [];
        const enrichedSessions = sessionList.map(sess => ({
          ...sess,
          risk: scoresMap.get(sess.id) || { score: 0, risk_level: 'low', breakdown: [] }
        }));
        setActiveSessions(enrichedSessions);
      }

      if (alertsData.success) setAlerts(alertsData.data.alerts || []);
      if (eventsData.success) setLiveSqlFeed(eventsData.data.events || []);
      if (violsData.success) setViolations(violsData.data.violations || []);

      // Build velocity chart data from genuine recent SQL events
      buildInitialChartData(eventsData.data?.events || []);
    } catch (err) {
      console.error('Error fetching dashboard initial data:', err);
      setError(err.message || 'Unable to load security data');
    } finally {
      setLoading(false);
    }
  };

  const buildInitialChartData = (events) => {
    const buckets = new Map();
    const now = Date.now();
    for (let i = 9; i >= 0; i--) {
      const d = new Date(now - i * 60000);
      const timeKey = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      buckets.set(timeKey, 0);
    }

    events.forEach(evt => {
      if (!evt.event_time) return;
      const t = new Date(evt.event_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
      if (buckets.has(t)) {
        buckets.set(t, buckets.get(t) + 1);
      }
    });

    const chartPoints = Array.from(buckets.entries()).map(([time, count]) => ({ time, count }));
    setQueryVelocityData(chartPoints);
  };

  // SSE Pipeline Connection
  useEffect(() => {
    if (!accessToken || !isAdminOrDba) {
      setLoading(false);
      return;
    }

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
        setViolations((prev) => [violation, ...prev.filter(v => v.id !== violation.id).slice(0, 49)]);
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
  const openAlerts = alerts.filter(a => a.status === 'open');
  const openAlertsCount = openAlerts.length;
  const recentQpm = queryVelocityData.length > 0 ? queryVelocityData[queryVelocityData.length - 1].count : 0;

  // Open behavioral reviews (low/medium risk non-blocking reviews)
  const openReviewViolations = violations.filter(v =>
    v.rule === 'UNBOUNDED_BULK_READ' ||
    (v.severity === 'medium' && v.enforcement_type === 'detected_post_hoc')
  );
  const openReviewsCount = openReviewViolations.length;

  // High / Critical Incidents: open critical/high alerts or critical/high violations
  const criticalAlerts = alerts.filter(a => a.status === 'open' && (a.severity === 'critical' || a.severity === 'high'));
  const criticalViolations = violations.filter(v => v.severity === 'critical' || v.severity === 'high');
  const highCriticalIncidentsCount = criticalAlerts.length + criticalViolations.length;

  const highestRiskSession = activeSessions.reduce((max, s) => {
    return (s.risk?.score || 0) > (max?.risk?.score || 0) ? s : max;
  }, null);

  const getOperationColor = (op) => {
    switch (op) {
      case 'SELECT': return '#55E6C1';
      case 'INSERT': return '#10B981';
      case 'UPDATE': return '#F59E0B';
      case 'DELETE': return '#EF4444';
      case 'DDL': return '#55E6C1';
      default: return '#AAB8BC';
    }
  };


  if (!isAdminOrDba) {
    return (
      <Box sx={{ py: 6, px: 3, maxWidth: 680, mx: 'auto', textAlign: 'center' }}>
        <Card sx={{ p: 4, borderRadius: 2.5, backgroundColor: '#252E30', border: '1px solid #364345' }}>
          <Box
            sx={{
              width: 52,
              height: 52,
              borderRadius: 2,
              bgcolor: 'rgba(85, 230, 193, 0.12)',
              border: '1px solid rgba(85, 230, 193, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mx: 'auto',
              mb: 2
            }}
          >
            <BootstrapIcon name="bi-shield-lock-fill" size={26} color="#55E6C1" />
          </Box>
          <Typography variant="h5" sx={{ fontWeight: 700, mb: 1, color: '#F5F7F7' }}>
            Insider Threat Detection System
          </Typography>
          <Typography variant="body1" sx={{ color: '#AAB8BC', mb: 3 }}>
            Welcome, <strong>{user?.full_name || user?.username}</strong>! You are currently logged in with the <strong>[{user?.roles?.join(', ')}]</strong> role.
          </Typography>
          <Alert severity="info" icon={<BootstrapIcon name="bi-info-circle-fill" size={18} color="#38BDF8" />} sx={{ mb: 3.5, textAlign: 'left' }}>
            The central Security Operations Console & real-time telemetry stream are restricted to DBAs and Administrators.
            As a developer, you can request and manage Just-In-Time (JIT) ephemeral database credentials under the <strong>JIT Sessions</strong> tab.
          </Alert>
          <Button
            variant="contained"
            size="large"
            onClick={() => navigate('/sessions')}
            startIcon={<BootstrapIcon name="bi-key-fill" size={16} />}
            sx={{ px: 3.5, py: 1.1, fontWeight: 600 }}
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
      <Box sx={{ mb: 2.5, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#F5F7F7' }}>
            {user?.roles?.includes('dba') && !user?.roles?.includes('admin')
              ? 'DBA Database Security & Operations Monitor'
              : 'ITDS Central Security Operations Console'}
          </Typography>
          <Typography variant="body2" sx={{ color: '#AAB8BC', mt: 0.5 }}>
            {user?.roles?.includes('dba') && !user?.roles?.includes('admin')
              ? 'Live database engine telemetry, active JIT ephemeral accounts, and database-level policy violation auditing.'
              : 'Enterprise security governance, JIT access orchestration, real-time SQL auditing, and insider threat intelligence.'}
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Chip
            icon={<BootstrapIcon name="bi-record-fill" size={11} color={connected ? '#10B981' : '#EF4444'} />}
            label={connected ? 'LIVE PIPELINE (SSE)' : 'DISCONNECTED'}
            size="small"
            variant="outlined"
            sx={{
              borderColor: connected ? 'rgba(16, 185, 129, 0.4)' : 'rgba(239, 68, 68, 0.4)',
              color: connected ? '#10B981' : '#EF4444',
              fontWeight: 700
            }}
          />
          <Button
            size="small"
            variant="outlined"
            startIcon={<BootstrapIcon name="bi-arrow-clockwise" size={15} />}
            onClick={fetchInitialData}
          >
            Sync
          </Button>
        </Stack>
      </Box>

      {error && (
        <Alert
          severity="error"
          sx={{ mb: 3 }}
          action={
            <Button color="inherit" size="small" onClick={fetchInitialData}>
              Retry
            </Button>
          }
        >
          Unable to load security data: {error}
        </Alert>
      )}

      {/* Prominent High/Critical Incident Highlighting */}
      {highCriticalIncidentsCount > 0 && (
        <Alert
          severity="error"
          icon={<BootstrapIcon name="bi-exclamation-triangle-fill" size={18} color="#EF4444" />}
          sx={{
            mb: 3,
            bgcolor: 'rgba(239, 68, 68, 0.08)',
            border: '1px solid rgba(239, 68, 68, 0.4)',
            borderRadius: 2,
            alignItems: 'center'
          }}
          action={
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                color="error"
                variant="outlined"
                onClick={() => navigate('/monitoring')}
                sx={{ fontWeight: 600, textTransform: 'none', fontSize: '0.75rem' }}
              >
                Security Monitoring
              </Button>
              <Button
                size="small"
                color="error"
                variant="contained"
                onClick={() => navigate('/monitoring')}
                sx={{ fontWeight: 600, textTransform: 'none', fontSize: '0.75rem' }}
              >
                Incidents ({highCriticalIncidentsCount})
              </Button>
            </Stack>
          }
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#FCA5A5' }}>
            High / Critical Security Incidents Detected ({highCriticalIncidentsCount} active event{highCriticalIncidentsCount === 1 ? '' : 's'})
          </Typography>
          <Typography variant="body2" sx={{ color: '#FECACA', fontSize: '0.82rem' }}>
            {criticalAlerts.length > 0
              ? `Automated threat detection engine flagged ${criticalAlerts.length} high-severity alert(s). Action required by SOC/DBA.`
              : `Pre-execution or critical policy violations detected on sensitive database resources.`}
          </Typography>
        </Alert>
      )}

      {/* Top Bar Metrics */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: '#252E30', border: '1px solid #364345' }}>
            <CardContent sx={{ py: 2 }}>
              <Typography variant="caption" sx={{ color: '#AAB8BC', textTransform: 'uppercase', fontWeight: 600 }}>
                Active JIT Sessions
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#55E6C1', mt: 0.5 }}>
                {activeSessionsCount}
              </Typography>
              <Typography variant="caption" sx={{ color: '#AAB8BC' }}>
                Ephemeral accounts in MySQL
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: '#252E30', border: '1px solid #364345' }}>
            <CardContent sx={{ py: 2 }}>
              <Typography variant="caption" sx={{ color: '#AAB8BC', textTransform: 'uppercase', fontWeight: 600 }}>
                Queries / Minute (Telemetry)
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#10B981', mt: 0.5 }}>
                {recentQpm} QPM
              </Typography>
              <Typography variant="caption" sx={{ color: '#AAB8BC' }}>
                Ingested from general_log
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: '#252E30', border: '1px solid #364345' }}>
            <CardContent sx={{ py: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" sx={{ color: '#AAB8BC', textTransform: 'uppercase', fontWeight: 600 }}>
                  Open Behavioral Reviews
                </Typography>
                <Chip
                  label="View Feed"
                  size="small"
                  onClick={() => navigate('/monitoring')}
                  sx={{ height: 18, fontSize: '0.62rem', cursor: 'pointer', borderColor: '#364345' }}
                />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: openReviewsCount > 0 ? '#F59E0B' : '#10B981', mt: 0.5 }}>
                {openReviewsCount}
              </Typography>
              <Typography variant="caption" sx={{ color: '#AAB8BC' }}>
                Non-blocking telemetry scans
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: '#252E30', border: '1px solid #364345' }}>
            <CardContent sx={{ py: 2 }}>
              <Typography variant="caption" sx={{ color: '#AAB8BC', textTransform: 'uppercase', fontWeight: 600 }}>
                Peak Risk Session
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, color: (highestRiskSession?.risk?.score || 0) >= 70 ? '#EF4444' : '#F59E0B', mt: 0.5 }}>
                {highestRiskSession ? `${highestRiskSession.risk?.score || 0}/100` : 'None'}
              </Typography>
              <Typography variant="caption" sx={{ color: '#AAB8BC' }}>
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
          <Card sx={{ bgcolor: '#252E30', border: '1px solid #364345', height: 380, display: 'flex', flexDirection: 'column' }}>
            <CardHeader
              avatar={<BootstrapIcon name="bi-terminal" size={18} color="#55E6C1" />}
              title={<Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#F5F7F7' }}>Live Server-Side SQL Feed (mysql.general_log)</Typography>}
              subheader={<Typography variant="caption" sx={{ color: '#AAB8BC' }}>Auto-scrolling stream directly from database engine</Typography>}
              action={<Chip label={`${liveSqlFeed.length} buffered`} size="small" sx={{ bgcolor: '#171B1C', border: '1px solid #364345', color: '#AAB8BC' }} />}
              sx={{ pb: 1 }}
            />
            <Divider sx={{ borderColor: '#364345' }} />
            <Box sx={{ p: 1.5, flex: 1, overflowY: 'auto', fontFamily: 'monospace', fontSize: '0.78rem' }}>
              {liveSqlFeed.length === 0 ? (
                <Typography variant="caption" sx={{ color: '#64748B', p: 1, display: 'block' }}>
                  Awaiting database queries...
                </Typography>
              ) : (
                liveSqlFeed.map((evt, idx) => {
                  const tStr = new Date(evt.event_time).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' });
                  return (
                    <Box key={evt.id || idx} sx={{ mb: 1, p: 0.9, bgcolor: '#171B1C', borderRadius: 1.5, border: '1px solid #364345', borderLeft: `3px solid ${getOperationColor(evt.operation)}` }}>
                      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.4 }}>
                        <Stack direction="row" spacing={1} alignItems="center">
                          <Typography variant="caption" sx={{ color: '#AAB8BC', fontSize: '0.7rem' }}>{tStr}</Typography>
                          <Chip label={evt.operation} size="small" sx={{ height: 16, fontSize: '0.62rem', fontWeight: 700, bgcolor: `${getOperationColor(evt.operation)}22`, color: getOperationColor(evt.operation) }} />
                          {evt.id && (
                            <Chip label={`#${evt.id}`} size="small" variant="outlined" sx={{ height: 16, fontSize: '0.62rem', fontFamily: 'monospace', borderColor: '#364345' }} />
                          )}
                          <Typography variant="caption" sx={{ color: '#55E6C1', fontWeight: 600 }}>
                            {evt.username ? `${evt.username} (#${evt.session_id})` : evt.mysql_username}
                          </Typography>
                          {evt.status === 'blocked' && (
                            <Chip label="BLOCKED" size="small" color="error" sx={{ height: 16, fontSize: '0.6rem', fontWeight: 700 }} />
                          )}
                        </Stack>
                        {evt.flags?.is_unbounded_read && (
                          <Chip label="UNBOUNDED" size="small" color="warning" sx={{ height: 16, fontSize: '0.6rem', fontWeight: 700 }} />
                        )}
                      </Box>
                      <Typography variant="body2" sx={{ fontFamily: 'monospace', fontSize: '0.75rem', color: '#F5F7F7', wordBreak: 'break-all' }}>
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
          <Card sx={{ bgcolor: '#252E30', border: '1px solid #364345', height: 380, display: 'flex', flexDirection: 'column' }}>
            <CardHeader
              avatar={<BootstrapIcon name="bi-activity" size={18} color="#55E6C1" />}
              title={<Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#F5F5F5' }}>Query Telemetry Volume Over Time</Typography>}
              subheader={<Typography variant="caption" sx={{ color: '#A6ADB4' }}>Queries ingested per time interval</Typography>}
              sx={{ pb: 1 }}
            />
            <Divider sx={{ borderColor: '#343F3D' }} />
            <Box sx={{ p: 2, flex: 1, minHeight: 280 }}>
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={queryVelocityData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="queryGradient" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#55E6C1" stopOpacity={0.6} />
                      <stop offset="95%" stopColor="#55E6C1" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#343F3D" />
                  <XAxis dataKey="time" stroke="#A6ADB4" fontSize={11} />
                  <YAxis stroke="#A6ADB4" fontSize={11} />
                  <RechartsTooltip contentStyle={{ backgroundColor: '#20272B', borderColor: '#343F3D', borderRadius: 8, color: '#F5F5F5' }} />
                  <Area type="monotone" dataKey="count" stroke="#55E6C1" strokeWidth={2.5} fillOpacity={1} fill="url(#queryGradient)" name="Queries" />
                </AreaChart>
              </ResponsiveContainer>
            </Box>
          </Card>
        </Grid>
      </Grid>

      {/* Active JIT Sessions with 1-Click Revoke & Live Threat Score */}
      <Card sx={{ bgcolor: 'background.paper', border: '1px solid rgba(255,255,255,0.08)', mb: 3 }}>
        <CardHeader
          avatar={<BootstrapIcon name="bi-key-fill" size={20} color="#55E6C1" />}
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
                              <IconButton size="small" onClick={() => setSelectedEvidence({ title: `Session #${sess.id} Threat Breakdown`, score, breakdown: sess.risk.breakdown })} aria-label="Inspect evidence">
                                <BootstrapIcon name="bi-search" size={13} />
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
                          startIcon={<BootstrapIcon name="bi-shield-x" size={15} />}
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
          avatar={<BootstrapIcon name="bi-exclamation-triangle-fill" size={20} color="#EF4444" />}
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
                        startIcon={<BootstrapIcon name="bi-search" size={13} />}
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

      {/* Policy Violations & Behavioral Reviews Stream */}
      <Card sx={{ bgcolor: '#252E30', border: '1px solid #364345', mt: 3 }}>
        <CardHeader
          avatar={<BootstrapIcon name="bi-shield-check" size={20} color="#55E6C1" />}
          title={<Typography variant="subtitle1" sx={{ fontWeight: 700 }}>Recent Policy Violations & Behavioral Reviews</Typography>}
          subheader="Database engine policy decisions and telemetry triggers using canonical event records"
          action={
            <Button
              size="small"
              variant="outlined"
              startIcon={<BootstrapIcon name="bi-activity" size={14} />}
              onClick={() => navigate('/monitoring')}
            >
              Security Monitoring ({violations.length})
            </Button>
          }
        />
        <Divider />
        <TableContainer>
          <Table size="small">
            <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.02)' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Event ID</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Rule</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Severity</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Enforcement</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Session / User</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Reason / Details</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Time</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {violations.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} align="center" sx={{ py: 3 }}>
                    <Typography variant="body2" color="text.secondary">
                      No policy violations or review flags recorded.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                violations.slice(0, 5).map((v) => (
                  <TableRow key={v.id} hover>
                    <TableCell>
                      <Chip label={`#${v.event_id || v.id}`} size="small" variant="outlined" color="primary" sx={{ height: 20, fontSize: '0.65rem', fontFamily: 'monospace' }} />
                    </TableCell>
                    <TableCell sx={{ fontWeight: 700, fontFamily: 'monospace', fontSize: '0.78rem' }}>
                      {v.rule}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={v.severity.toUpperCase()}
                        size="small"
                        color={v.severity === 'critical' ? 'error' : v.severity === 'high' ? 'error' : v.severity === 'medium' ? 'warning' : 'info'}
                        sx={{ fontSize: '0.65rem', height: 20, fontWeight: 700 }}
                      />
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={v.enforcement_type}
                        size="small"
                        variant="outlined"
                        sx={{ fontSize: '0.65rem', height: 20 }}
                      />
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                        {v.username || (v.session_id ? `Session #${v.session_id}` : 'Unattributed')}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 300 }}>
                      <Typography variant="body2" sx={{ fontSize: '0.78rem', color: 'text.secondary' }}>
                        {v.reason}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ fontSize: '0.78rem', color: 'text.secondary', whiteSpace: 'nowrap' }}>
                      {new Date(v.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
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
            <BootstrapIcon name="bi-activity" size={20} color="#F59E0B" />
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
                  <Paper key={idx} sx={{ p: 2, bgcolor: '#171B1C', border: '1px solid #364345', borderRadius: 2 }}>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                      <Typography variant="subtitle2" sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#55E6C1' }}>
                        {item.rule_id}
                      </Typography>
                      <Chip label={`+${item.weight} pts`} color="error" size="small" sx={{ fontWeight: 700, height: 20 }} />
                    </Box>
                    <Typography variant="body2" sx={{ color: '#F5F7F7', mb: 1 }}>{item.explanation}</Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="caption" sx={{ color: '#AAB8BC' }}>Trigger Event IDs:</Typography>
                      {Array.isArray(item.evidence_event_ids) && item.evidence_event_ids.map(id => (
                        <Chip key={id} label={`Event #${id}`} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.65rem', borderColor: '#364345' }} />
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
