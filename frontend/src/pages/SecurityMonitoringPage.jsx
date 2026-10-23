// frontend/src/pages/SecurityMonitoringPage.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  CircularProgress,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  IconButton,
  Tooltip,
  Divider,
  Stack,
  Switch,
  FormControlLabel,
  InputAdornment
} from '@mui/material';
import BootstrapIcon from '../components/common/BootstrapIcon.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function SecurityMonitoringPage() {
  const { user, accessToken, hasRole } = useAuth();
  const isAdmin = hasRole('admin');
  const isDba = hasRole('dba');

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [connected, setConnected] = useState(false);

  // Stats directly derived from MySQL records
  const [stats, setStats] = useState(null);

  // Raw telemetry records from backend APIs
  const [alerts, setAlerts] = useState([]);
  const [violations, setViolations] = useState([]);
  const [riskScores, setRiskScores] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);

  // Filter States
  const [categoryFilter, setCategoryFilter] = useState('ALL'); // ALL, ALERTS, VIOLATIONS, CRITICAL
  const [enforcementFilter, setEnforcementFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [searchQuery, setSearchQuery] = useState('');

  // Dialog States
  const [selectedEvidence, setSelectedEvidence] = useState(null);
  const [copiedQuery, setCopiedQuery] = useState(false);
  const [actionDialog, setActionDialog] = useState({
    open: false,
    alert: null,
    newStatus: '',
    notes: '',
    submitting: false
  });

  const eventSourceRef = useRef(null);
  const isFetchingRef = useRef(false);

  // Fetch all persisted telemetry from backend
  const fetchData = useCallback(async () => {
    if (isFetchingRef.current || !accessToken) return;
    isFetchingRef.current = true;

    try {
      const [statsRes, alertsRes, violsRes, scoresRes, sessRes] = await Promise.all([
        fetch('/api/monitoring-stats', { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch('/api/alerts?limit=250', { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch('/api/violations?limit=250', { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch('/api/risk-scores?limit=250', { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch('/api/sessions/active', { headers: { Authorization: `Bearer ${accessToken}` } })
      ]);

      if (!statsRes.ok || !alertsRes.ok || !violsRes.ok || !scoresRes.ok || !sessRes.ok) {
        throw new Error('Security API responded with an error status');
      }

      const [statsData, alertsData, violsData, scoresData, sessData] = await Promise.all([
        statsRes.json(),
        alertsRes.json(),
        violsRes.json(),
        scoresRes.json(),
        sessRes.json()
      ]);

      if (!statsData.success) throw new Error(statsData.error?.message || 'Failed to fetch monitoring statistics');
      if (!alertsData.success) throw new Error(alertsData.error?.message || 'Failed to fetch security alerts');
      if (!violsData.success) throw new Error(violsData.error?.message || 'Failed to fetch policy violations');
      if (!scoresData.success) throw new Error(scoresData.error?.message || 'Failed to fetch risk assessments');
      if (!sessData.success) throw new Error(sessData.error?.message || 'Failed to fetch active sessions');

      setError(null);
      setStats(statsData.data);
      setAlerts(alertsData.data.alerts || []);
      setViolations(violsData.data.violations || []);
      setRiskScores(scoresData.data.risk_scores || []);
      setActiveSessions(sessData.data.active_sessions || sessData.data.sessions || []);
    } catch (err) {
      console.error('Error loading security monitoring data:', err);
      setError(err.message || 'Error communicating with security backend');
    } finally {
      isFetchingRef.current = false;
      setLoading(false);
    }
  }, [accessToken]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Live SSE Telemetry listener
  useEffect(() => {
    if (!accessToken) return;

    const streamUrl = `/api/stream?token=${encodeURIComponent(accessToken)}`;
    const es = new EventSource(streamUrl);
    eventSourceRef.current = es;

    es.addEventListener('open', () => {
      setConnected(true);
    });

    es.addEventListener('connected', () => {
      setConnected(true);
    });

    es.addEventListener('violation_detected', (event) => {
      try {
        const v = JSON.parse(event.data);
        setViolations((prev) => [v, ...prev.filter(item => item.id !== v.id).slice(0, 249)]);
        setStats((prev) => {
          if (!prev) return null;
          const isBlocked = ['blocked_pre_execution', 'blocked_by_db'].includes(v.enforcement_type);
          const isPostHoc = v.enforcement_type === 'detected_post_hoc';
          const isCrit = ['critical', 'high'].includes(v.severity);
          return {
            ...prev,
            total_violations_count: prev.total_violations_count + 1,
            blocked_pre_exec_count: isBlocked ? prev.blocked_pre_exec_count + 1 : prev.blocked_pre_exec_count,
            detected_post_hoc_count: isPostHoc ? prev.detected_post_hoc_count + 1 : prev.detected_post_hoc_count,
            critical_high_count: isCrit ? prev.critical_high_count + 1 : prev.critical_high_count
          };
        });
      } catch (e) {
        console.error('SSE violation parse error:', e);
      }
    });

    es.addEventListener('alert_created', (event) => {
      try {
        const a = JSON.parse(event.data);
        setAlerts((prev) => [a, ...prev.filter(item => item.id !== a.id).slice(0, 249)]);
        setStats((prev) => {
          if (!prev) return null;
          const isCrit = ['critical', 'high'].includes(a.severity);
          return {
            ...prev,
            open_alerts_count: prev.open_alerts_count + 1,
            critical_high_count: isCrit ? prev.critical_high_count + 1 : prev.critical_high_count
          };
        });
      } catch (e) {
        console.error('SSE alert parse error:', e);
      }
    });

    es.addEventListener('risk_updated', (event) => {
      try {
        const scoreData = JSON.parse(event.data);
        setRiskScores((prev) => [scoreData, ...prev.filter(item => item.session_id !== scoreData.session_id).slice(0, 249)]);
      } catch (e) {
        console.error('SSE risk parse error:', e);
      }
    });

    es.onerror = () => {
      setConnected(false);
    };

    return () => {
      es.close();
    };
  }, [accessToken]);

  // Periodic polling fallback
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchData();
    }, 4000);
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  // --- Deduplication & Event Unification ---
  // Map alerts by their triggering event IDs
  const eventIdToAlertMap = new Map();
  alerts.forEach((alert) => {
    const evidenceList = Array.isArray(alert.evidence)
      ? alert.evidence
      : (typeof alert.evidence === 'string' ? JSON.parse(alert.evidence || '[]') : []);

    evidenceList.forEach((ev) => {
      if (Array.isArray(ev.evidence_event_ids)) {
        ev.evidence_event_ids.forEach((evtId) => {
          eventIdToAlertMap.set(evtId, alert);
        });
      }
    });
  });

  // Risk scores by session ID
  const sessionRiskMap = new Map();
  riskScores.forEach((s) => {
    sessionRiskMap.set(s.session_id, s);
  });

  // Construct unified event items from actual persisted records
  const unifiedEvents = [];
  const processedEventIds = new Set();

  // 1. Process policy violations
  violations.forEach((v) => {
    const eventId = v.event_id || v.id;
    processedEventIds.add(eventId);

    const linkedAlert = eventIdToAlertMap.get(eventId);
    const sessionRisk = sessionRiskMap.get(v.session_id);

    unifiedEvents.push({
      id: `viol_${v.id}`,
      canonicalEventId: eventId,
      violationId: v.id,
      alertId: linkedAlert?.id || null,
      timestamp: v.created_at || v.event_time,
      type: linkedAlert ? 'ALERT_PROMOTED' : 'VIOLATION',
      rule: v.rule,
      title: linkedAlert ? linkedAlert.title : v.rule,
      username: v.username || v.mysql_username || linkedAlert?.username || 'Unattributed',
      sessionId: v.session_id,
      severity: linkedAlert ? linkedAlert.severity : v.severity,
      enforcementType: v.enforcement_type,
      rawSql: v.raw_sql,
      reason: v.reason || linkedAlert?.description,
      riskScore: sessionRisk?.score || linkedAlert?.risk_score || null,
      riskLevel: sessionRisk?.risk_level || 'nominal',
      breakdown: sessionRisk?.breakdown || linkedAlert?.evidence || [],
      investigationStatus: linkedAlert ? linkedAlert.status : 'logged',
      isAlert: Boolean(linkedAlert),
      originalAlert: linkedAlert || null
    });
  });

  // 2. Add alerts that might not have a matching raw violation in the local buffer
  alerts.forEach((a) => {
    const evidenceList = Array.isArray(a.evidence)
      ? a.evidence
      : (typeof a.evidence === 'string' ? JSON.parse(a.evidence || '[]') : []);

    let hasRepresentedEvent = false;
    evidenceList.forEach((ev) => {
      if (Array.isArray(ev.evidence_event_ids)) {
        if (ev.evidence_event_ids.some(id => processedEventIds.has(id))) {
          hasRepresentedEvent = true;
        }
      }
    });

    if (!hasRepresentedEvent) {
      const sessionRisk = sessionRiskMap.get(a.session_id);
      unifiedEvents.push({
        id: `alert_${a.id}`,
        canonicalEventId: evidenceList[0]?.evidence_event_ids?.[0] || a.id,
        violationId: null,
        alertId: a.id,
        timestamp: a.created_at,
        type: 'SECURITY_ALERT',
        rule: evidenceList[0]?.rule_id || 'HIGH_RISK_ANOMALY',
        title: a.title,
        username: a.username || 'Unattributed',
        sessionId: a.session_id,
        severity: a.severity,
        enforcementType: 'detected_post_hoc',
        rawSql: null,
        reason: a.description,
        riskScore: a.risk_score || sessionRisk?.score || null,
        riskLevel: a.severity === 'critical' ? 'critical' : 'high',
        breakdown: evidenceList,
        investigationStatus: a.status,
        isAlert: true,
        originalAlert: a
      });
    }
  });

  // Sort unified events by timestamp descending
  unifiedEvents.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  // --- Filter Logic ---
  const filteredEvents = unifiedEvents.filter((item) => {
    // Category Filter
    if (categoryFilter === 'ALERTS' && !item.isAlert) return false;
    if (categoryFilter === 'VIOLATIONS' && item.isAlert) return false;
    if (categoryFilter === 'CRITICAL' && !['critical', 'high'].includes(item.severity)) return false;

    // Enforcement Type Filter
    if (enforcementFilter && item.enforcementType !== enforcementFilter) return false;

    // Investigation Status Filter
    if (statusFilter && item.investigationStatus !== statusFilter) return false;

    // Search Query (User, Session, Rule, Event ID)
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase().trim();
      const matchUser = (item.username || '').toLowerCase().includes(q);
      const matchSession = String(item.sessionId || '').includes(q);
      const matchRule = (item.rule || '').toLowerCase().includes(q);
      const matchEventId = String(item.canonicalEventId || '').includes(q);
      if (!matchUser && !matchSession && !matchRule && !matchEventId) return false;
    }

    return true;
  });

  // --- 4 Prioritized Summary Metrics derived from actual MySQL records ---
  const openAlertsCount = stats?.open_alerts_count !== undefined
    ? stats.open_alerts_count
    : alerts.filter(a => a.status === 'open').length;

  const criticalHighCount = stats?.critical_high_count !== undefined
    ? stats.critical_high_count
    : unifiedEvents.filter(e => ['critical', 'high'].includes(e.severity)).length;

  const totalViolationsCount = stats?.total_violations_count !== undefined
    ? stats.total_violations_count
    : violations.length;

  const blockedPreExecCount = stats?.blocked_pre_exec_count !== undefined
    ? stats.blocked_pre_exec_count
    : violations.filter(v => v.enforcement_type === 'blocked_pre_execution' || v.enforcement_type === 'blocked_by_db').length;

  const detectedPostHocCount = stats?.detected_post_hoc_count !== undefined
    ? stats.detected_post_hoc_count
    : violations.filter(v => v.enforcement_type === 'detected_post_hoc').length;

  const sessionsAtRiskCount = stats?.sessions_at_risk_count !== undefined
    ? stats.sessions_at_risk_count
    : activeSessions.filter(s => (sessionRiskMap.get(s.id)?.score || 0) >= 40).length;

  const activeSessionsCount = stats?.active_sessions_count !== undefined
    ? stats.active_sessions_count
    : activeSessions.length;

  // --- Handlers ---
  const handleUpdateAlertStatus = async () => {
    if (!actionDialog.alert || !actionDialog.newStatus) return;
    setActionDialog(prev => ({ ...prev, submitting: true }));

    try {
      const res = await fetch(`/api/alerts/${actionDialog.alert.id}`, {
        method: 'PATCH',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          status: actionDialog.newStatus,
          notes: actionDialog.notes
        })
      });

      const data = await res.json();
      if (data.success) {
        setAlerts(prev => prev.map(a => a.id === actionDialog.alert.id ? { ...a, status: actionDialog.newStatus, analyst_notes: actionDialog.notes } : a));
        setActionDialog({ open: false, alert: null, newStatus: '', notes: '', submitting: false });
        fetchData();
      } else {
        setError(data.error?.message || 'Failed to update alert');
      }
    } catch (err) {
      setError(err.message || 'Error updating alert status');
    } finally {
      setActionDialog(prev => ({ ...prev, submitting: false }));
    }
  };

  const handleRevokeSession = async (sessionId) => {
    if (!sessionId) return;
    try {
      const res = await fetch(`/api/sessions/${sessionId}/revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      if (data.success) {
        fetchData();
      }
    } catch (err) {
      console.error('Error revoking session:', err);
    }
  };

  const handleCopy = (text) => {
    navigator.clipboard.writeText(text);
    setCopiedQuery(true);
    setTimeout(() => setCopiedQuery(false), 2000);
  };

  const getSeverityChip = (sev) => {
    switch (sev) {
      case 'critical':
        return <Chip label="CRITICAL" size="small" color="error" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }} />;
      case 'high':
        return <Chip label="HIGH" size="small" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700, bgcolor: '#EF4444', color: '#fff' }} />;
      case 'medium':
        return <Chip label="MEDIUM" size="small" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700, bgcolor: '#F59E0B', color: '#0F172A' }} />;
      default:
        return <Chip label="LOW" size="small" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700, bgcolor: '#343F3D', color: '#F5F5F5' }} />;
    }
  };

  const getEnforcementChip = (type) => {
    if (type === 'blocked_pre_execution' || type === 'blocked_by_db') {
      return (
        <Chip
          icon={<BootstrapIcon name="bi-shield-x" size={12} />}
          label="BLOCKED PRE-EXEC"
          size="small"
          color="error"
          variant="outlined"
          sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }}
        />
      );
    }
    return (
      <Chip
        icon={<BootstrapIcon name="bi-activity" size={12} />}
        label="DETECTED POST-HOC"
        size="small"
        color="warning"
        variant="outlined"
        sx={{ height: 20, fontSize: '0.65rem', fontWeight: 600 }}
      />
    );
  };

  const isUnavailable = error && !stats && alerts.length === 0;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#F5F7F7', display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <BootstrapIcon name="bi-activity" size={24} color="#55E6C1" /> Security Monitoring
          </Typography>
          <Typography variant="body2" sx={{ color: '#AAB8BC', mt: 0.5 }}>
            Unified real-time policy enforcement stream, behavioural threat detection, and incident investigation console.
          </Typography>
        </Box>
        <Stack direction="row" spacing={1.5} alignItems="center">
          <Chip
            icon={
              <BootstrapIcon
                name={connected ? 'bi-record-fill' : autoRefresh ? 'bi-arrow-repeat' : 'bi-exclamation-circle-fill'}
                size={11}
                color={connected ? '#10B981' : autoRefresh ? '#55E6C1' : '#EF4444'}
              />
            }
            label={connected ? 'LIVE PIPELINE (SSE)' : autoRefresh ? 'POLLING ACTIVE' : 'DISCONNECTED'}
            size="small"
            variant="outlined"
            sx={{
              borderColor: connected ? 'rgba(16, 185, 129, 0.4)' : autoRefresh ? 'rgba(85, 230, 193, 0.4)' : 'rgba(239, 68, 68, 0.4)',
              color: connected ? '#10B981' : autoRefresh ? '#55E6C1' : '#EF4444',
              fontWeight: 700
            }}
          />
          <FormControlLabel
            control={
              <Switch
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                color="primary"
                size="small"
              />
            }
            label={<Typography variant="caption" sx={{ color: '#AAB8BC' }}>Live Polling (4s)</Typography>}
          />
          <Button
            size="small"
            variant="outlined"
            startIcon={<BootstrapIcon name="bi-arrow-clockwise" size={15} />}
            onClick={() => { setLoading(true); fetchData(); }}
          >
            Refresh
          </Button>
        </Stack>
      </Box>

      {/* Backend Unavailable Error Card */}
      {isUnavailable && (
        <Card sx={{ p: 4, mb: 3, bgcolor: '#252E30', border: '1px solid #EF4444', textAlign: 'center', borderRadius: 2 }}>
          <Box
            sx={{
              width: 52,
              height: 52,
              borderRadius: '50%',
              bgcolor: 'rgba(239, 68, 68, 0.12)',
              border: '1px solid rgba(239, 68, 68, 0.3)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              mx: 'auto',
              mb: 2
            }}
          >
            <BootstrapIcon name="bi-exclamation-triangle-fill" size={26} color="#EF4444" />
          </Box>
          <Typography variant="h6" sx={{ fontWeight: 700, color: '#F5F7F7', mb: 1 }}>
            Unable to load security data
          </Typography>
          <Typography variant="body2" sx={{ color: '#AAB8BC', maxWidth: 480, mx: 'auto', mb: 2.5 }}>
            {error}. The security telemetry backend or database service could not be reached.
          </Typography>
          <Button
            variant="contained"
            color="primary"
            startIcon={<BootstrapIcon name="bi-arrow-clockwise" size={16} />}
            onClick={() => { setLoading(true); fetchData(); }}
            sx={{ px: 3, fontWeight: 600 }}
          >
            Retry Connection
          </Button>
        </Card>
      )}

      {/* Partial Refresh Failure Banner */}
      {!isUnavailable && error && (
        <Alert
          severity="error"
          sx={{ mb: 3 }}
          action={
            <Button color="inherit" size="small" onClick={() => fetchData()}>
              Retry
            </Button>
          }
        >
          Unable to refresh security data: {error}
        </Alert>
      )}

      {/* 4 Prioritized Summary Metrics */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        {/* Metric 1: Open Security Alerts */}
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: '#252E30', border: '1px solid #364345' }}>
            <CardContent sx={{ py: 2 }}>
              <Typography variant="caption" sx={{ color: '#AAB8BC', textTransform: 'uppercase', fontWeight: 600 }}>
                Open Security Alerts
              </Typography>
              <Typography
                variant="h5"
                sx={{
                  fontWeight: 700,
                  color: isUnavailable ? '#AAB8BC' : openAlertsCount > 0 ? '#EF4444' : '#10B981',
                  mt: 0.5
                }}
              >
                {isUnavailable ? '--' : openAlertsCount}
              </Typography>
              <Typography variant="caption" sx={{ color: '#AAB8BC' }}>
                {isUnavailable ? 'Backend unavailable' : openAlertsCount > 0 ? 'Requires administrative triage' : 'No active incident alerts'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Metric 2: High / Critical Incidents */}
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: '#252E30', border: '1px solid #364345' }}>
            <CardContent sx={{ py: 2 }}>
              <Typography variant="caption" sx={{ color: '#AAB8BC', textTransform: 'uppercase', fontWeight: 600 }}>
                High / Critical Incidents
              </Typography>
              <Typography
                variant="h5"
                sx={{
                  fontWeight: 700,
                  color: isUnavailable ? '#AAB8BC' : criticalHighCount > 0 ? '#EF4444' : '#10B981',
                  mt: 0.5
                }}
              >
                {isUnavailable ? '--' : criticalHighCount}
              </Typography>
              <Typography variant="caption" sx={{ color: '#AAB8BC' }}>
                {isUnavailable ? 'Backend unavailable' : 'Severe policy denials & threat spikes'}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Metric 3: Total Policy Violations */}
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: '#252E30', border: '1px solid #364345' }}>
            <CardContent sx={{ py: 2 }}>
              <Typography variant="caption" sx={{ color: '#AAB8BC', textTransform: 'uppercase', fontWeight: 600 }}>
                Total Policy Violations
              </Typography>
              <Typography
                variant="h5"
                sx={{
                  fontWeight: 700,
                  color: isUnavailable ? '#AAB8BC' : '#F59E0B',
                  mt: 0.5
                }}
              >
                {isUnavailable ? '--' : totalViolationsCount}
              </Typography>
              <Typography variant="caption" sx={{ color: '#AAB8BC' }}>
                {isUnavailable ? 'Backend unavailable' : `${blockedPreExecCount} blocked pre-exec | ${detectedPostHocCount} post-hoc`}
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        {/* Metric 4: Sessions at Risk */}
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: '#252E30', border: '1px solid #364345' }}>
            <CardContent sx={{ py: 2 }}>
              <Typography variant="caption" sx={{ color: '#AAB8BC', textTransform: 'uppercase', fontWeight: 600 }}>
                Sessions At Risk
              </Typography>
              <Typography
                variant="h5"
                sx={{
                  fontWeight: 700,
                  color: isUnavailable ? '#AAB8BC' : sessionsAtRiskCount > 0 ? '#EF4444' : '#10B981',
                  mt: 0.5
                }}
              >
                {isUnavailable ? '--' : sessionsAtRiskCount}
              </Typography>
              <Typography variant="caption" sx={{ color: '#AAB8BC' }}>
                {isUnavailable ? 'Backend unavailable' : `${activeSessionsCount} active ephemeral account${activeSessionsCount === 1 ? '' : 's'}`}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filter Toolbar */}
      <Paper sx={{ p: 2, mb: 3, bgcolor: '#252E30', border: '1px solid #364345' }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth size="small">
              <InputLabel id="category-filter-label">Event Stream</InputLabel>
              <Select
                labelId="category-filter-label"
                value={categoryFilter}
                label="Event Stream"
                onChange={(e) => setCategoryFilter(e.target.value)}
              >
                <MenuItem value="ALL">All Security Events ({unifiedEvents.length})</MenuItem>
                <MenuItem value="ALERTS">Security Alerts Only ({alerts.length})</MenuItem>
                <MenuItem value="VIOLATIONS">Policy Violations Only ({violations.length})</MenuItem>
                <MenuItem value="CRITICAL">High / Critical Only ({criticalHighCount})</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={2.5}>
            <FormControl fullWidth size="small">
              <InputLabel id="enforcement-filter-label">Enforcement Type</InputLabel>
              <Select
                labelId="enforcement-filter-label"
                value={enforcementFilter}
                label="Enforcement Type"
                onChange={(e) => setEnforcementFilter(e.target.value)}
              >
                <MenuItem value="">All Outcomes</MenuItem>
                <MenuItem value="blocked_pre_execution">Blocked Pre-Exec</MenuItem>
                <MenuItem value="detected_post_hoc">Detected Post-Hoc</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={2.5}>
            <FormControl fullWidth size="small">
              <InputLabel id="status-filter-label">Investigation Status</InputLabel>
              <Select
                labelId="status-filter-label"
                value={statusFilter}
                label="Investigation Status"
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <MenuItem value="">All Statuses</MenuItem>
                <MenuItem value="open">Open Alerts</MenuItem>
                <MenuItem value="investigating">Investigating</MenuItem>
                <MenuItem value="closed">Closed / Resolved</MenuItem>
                <MenuItem value="logged">Automated Audit Log</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={4}>
            <TextField
              size="small"
              fullWidth
              placeholder="Search by User, Session ID, Rule, or Event ID..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: (
                  <InputAdornment position="start">
                    <BootstrapIcon name="bi-search" size={14} color="#A6ADB4" />
                  </InputAdornment>
                )
              }}
            />
          </Grid>
        </Grid>
      </Paper>

      {/* Unified Security Events Table */}
      <Card sx={{ bgcolor: 'background.paper', border: '1px solid rgba(255,255,255,0.08)' }}>
        <TableContainer sx={{ maxHeight: 620 }}>
          <Table stickyHeader size="small">
            <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.04)' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Event ID</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Timestamp</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Event / Rule</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>User / Identity</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Session</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Severity</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Enforcement Outcome</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Risk Score</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Investigation Status</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && filteredEvents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={32} />
                    <Typography variant="body2" color="text.secondary" sx={{ mt: 1.5 }}>
                      Aggregating security telemetry stream...
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : filteredEvents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={10} align="center" sx={{ py: 6 }}>
                    <Box sx={{ mb: 1.5, opacity: 0.8 }}>
                      <BootstrapIcon name="bi-shield-check" size={32} color="#55E6C1" />
                    </Box>
                    <Typography variant="body1" sx={{ color: '#F5F7F7', fontWeight: 600 }}>
                      No security events recorded.
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#AAB8BC', display: 'block', mt: 0.5 }}>
                      All monitored database traffic conforms to active authorization policies.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filteredEvents.map((evt) => {
                  const timeStr = new Date(evt.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  });

                  return (
                    <TableRow key={evt.id} hover sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                      {/* Canonical Event ID */}
                      <TableCell>
                        <Chip
                          label={`#${evt.canonicalEventId || 'N/A'}`}
                          size="small"
                          color="primary"
                          variant="outlined"
                          sx={{ height: 20, fontSize: '0.65rem', fontFamily: 'monospace', fontWeight: 700 }}
                        />
                      </TableCell>

                      {/* Timestamp */}
                      <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.78rem', color: 'text.secondary' }}>
                        {timeStr}
                      </TableCell>

                      {/* Event / Rule */}
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 700, fontSize: '0.8rem', fontFamily: 'monospace' }}>
                          {evt.rule}
                        </Typography>
                        {evt.title && evt.title !== evt.rule && (
                          <Typography variant="caption" color="text.secondary" sx={{ display: 'block', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                            {evt.title}
                          </Typography>
                        )}
                      </TableCell>

                      {/* User */}
                      <TableCell>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <BootstrapIcon name="bi-person-circle" size={15} color="#55E6C1" />
                          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                            {evt.username}
                          </Typography>
                        </Box>
                      </TableCell>

                      {/* JIT Session */}
                      <TableCell>
                        {evt.sessionId ? (
                          <Chip
                            label={`Session #${evt.sessionId}`}
                            size="small"
                            variant="outlined"
                            sx={{ height: 20, fontSize: '0.65rem' }}
                          />
                        ) : (
                          <Typography variant="caption" color="text.disabled">No Session</Typography>
                        )}
                      </TableCell>

                      {/* Severity */}
                      <TableCell>
                        {getSeverityChip(evt.severity)}
                      </TableCell>

                      {/* Enforcement */}
                      <TableCell>
                        {getEnforcementChip(evt.enforcementType)}
                      </TableCell>

                      {/* Risk Score */}
                      <TableCell>
                        {evt.riskScore !== null && evt.riskScore !== undefined ? (
                          <Typography variant="body2" sx={{ fontWeight: 700, color: evt.riskScore >= 70 ? '#ef5350' : evt.riskScore >= 40 ? '#ffa726' : '#81c784', fontSize: '0.8rem' }}>
                            {evt.riskScore}/100
                          </Typography>
                        ) : (
                          <Typography variant="caption" color="text.disabled">-</Typography>
                        )}
                      </TableCell>

                      {/* Investigation Status */}
                      <TableCell>
                        {evt.isAlert ? (
                          <Chip
                            label={(evt.investigationStatus === 'closed' ? 'CLOSED' : evt.investigationStatus).toUpperCase()}
                            size="small"
                            color={evt.investigationStatus === 'open' ? 'error' : evt.investigationStatus === 'investigating' ? 'warning' : 'success'}
                            variant="outlined"
                            sx={{ fontSize: '0.65rem', height: 20, fontWeight: 700 }}
                          />
                        ) : (
                          <Chip
                            label="LOGGED"
                            size="small"
                            variant="outlined"
                            sx={{ fontSize: '0.65rem', height: 20, color: 'text.secondary', borderColor: 'rgba(255,255,255,0.1)' }}
                          />
                        )}
                      </TableCell>

                      {/* Actions */}
                      <TableCell align="center">
                        <Stack direction="row" spacing={0.5} justifyContent="center">
                          <Tooltip title="Inspect Evidence & Telemetry">
                            <IconButton
                              size="small"
                              color="primary"
                              onClick={() => setSelectedEvidence(evt)}
                              aria-label="Inspect Evidence & Telemetry"
                            >
                              <BootstrapIcon name="bi-search" size={14} />
                            </IconButton>
                          </Tooltip>

                          {/* Admin-only Investigation Actions */}
                          {isAdmin && evt.isAlert && (
                            <Tooltip title="Update Investigation Status">
                              <IconButton
                                size="small"
                                color="warning"
                                onClick={() => setActionDialog({
                                  open: true,
                                  alert: evt.originalAlert,
                                  newStatus: evt.originalAlert.status,
                                  notes: evt.originalAlert.analyst_notes || '',
                                  submitting: false
                                })}
                                aria-label="Update Investigation Status"
                              >
                                <BootstrapIcon name="bi-pencil" size={14} />
                              </IconButton>
                            </Tooltip>
                          )}

                          {isAdmin && evt.sessionId && (
                            <Tooltip title="Force-Revoke JIT Session">
                              <IconButton
                                size="small"
                                color="error"
                                onClick={() => handleRevokeSession(evt.sessionId)}
                                aria-label="Force-Revoke JIT Session"
                              >
                                <BootstrapIcon name="bi-shield-x" size={15} color="#EF4444" />
                              </IconButton>
                            </Tooltip>
                          )}
                        </Stack>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* Evidence & Telemetry Detail Dialog */}
      <Dialog
        open={Boolean(selectedEvidence)}
        onClose={() => setSelectedEvidence(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <BootstrapIcon name="bi-shield-lock-fill" size={22} color="#55E6C1" />
            <Typography variant="h6">
              Security Evidence [Canonical Event #{selectedEvidence?.canonicalEventId}]
            </Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            {selectedEvidence && getSeverityChip(selectedEvidence.severity)}
            {selectedEvidence && getEnforcementChip(selectedEvidence.enforcementType)}
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          {selectedEvidence && (
            <Stack spacing={2.5}>
              {/* Context Summary */}
              <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: 'primary.light' }}>
                  Event Context & Attribution
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Triggered Rule</Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                      {selectedEvidence.rule}
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Attributed User</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {selectedEvidence.username}
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">JIT Session</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {selectedEvidence.sessionId ? `Session #${selectedEvidence.sessionId}` : 'None'}
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Risk Assessment</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: (selectedEvidence.riskScore || 0) >= 70 ? '#ef5350' : '#ffa726' }}>
                      {selectedEvidence.riskScore !== null ? `${selectedEvidence.riskScore}/100` : 'Not Scored'}
                    </Typography>
                  </Grid>
                </Grid>
              </Box>

              {/* Policy Explanation */}
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
                  Explanation & Decision Context
                </Typography>
                <Alert severity={selectedEvidence.severity === 'critical' || selectedEvidence.severity === 'high' ? 'error' : 'warning'}>
                  {selectedEvidence.reason || 'Security event triggered based on policy constraints.'}
                </Alert>
              </Box>

              {/* Raw SQL Statement if available */}
              {selectedEvidence.rawSql && (
                <Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                      Triggering SQL Statement
                    </Typography>
                    <Button
                      size="small"
                      startIcon={copiedQuery ? <BootstrapIcon name="bi-check-circle-fill" size={14} color="#10B981" /> : <BootstrapIcon name="bi-clipboard" size={14} />}
                      onClick={() => handleCopy(selectedEvidence.rawSql)}
                    >
                      {copiedQuery ? 'Copied' : 'Copy SQL'}
                    </Button>
                  </Box>
                  <Paper
                    sx={{
                      p: 2,
                      bgcolor: '#171B1C',
                      border: '1px solid #364345',
                      fontFamily: 'monospace',
                      fontSize: '0.85rem',
                      color: '#55E6C1',
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-all'
                    }}
                  >
                    {selectedEvidence.rawSql}
                  </Paper>
                </Box>
              )}

              {/* Risk Breakdown & Detector Evidence if alert */}
              {Array.isArray(selectedEvidence.breakdown) && selectedEvidence.breakdown.length > 0 && (
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1 }}>
                    Threat Detector Score Breakdown
                  </Typography>
                  <Stack spacing={1}>
                    {selectedEvidence.breakdown.map((item, idx) => (
                      <Paper key={idx} sx={{ p: 1.5, bgcolor: '#171B1C', border: '1px solid #364345' }}>
                        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#55E6C1' }}>
                            {item.rule_id}
                          </Typography>
                          <Chip label={`+${item.weight} pts`} color="error" size="small" sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }} />
                        </Box>
                        <Typography variant="caption" sx={{ color: '#AAB8BC' }} display="block">
                          {item.explanation}
                        </Typography>
                      </Paper>
                    ))}
                  </Stack>
                </Box>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedEvidence(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Admin Alert Status Update Dialog */}
      <Dialog
        open={actionDialog.open}
        onClose={() => setActionDialog(prev => ({ ...prev, open: false }))}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Update Security Alert Investigation</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2" color="text.secondary">
              Managing alert: <strong>{actionDialog.alert?.title}</strong> (Session #{actionDialog.alert?.session_id})
            </Typography>
            <FormControl fullWidth size="small">
              <InputLabel id="action-status-label">Investigation State</InputLabel>
              <Select
                labelId="action-status-label"
                value={actionDialog.newStatus}
                label="Investigation State"
                onChange={(e) => setActionDialog(prev => ({ ...prev, newStatus: e.target.value }))}
              >
                <MenuItem value="open">Open (Requires Action)</MenuItem>
                <MenuItem value="investigating">Investigating (Triage in Progress)</MenuItem>
                <MenuItem value="closed">Closed / Resolved (Risk Cleared)</MenuItem>
              </Select>
            </FormControl>
            <TextField
              fullWidth
              multiline
              rows={3}
              label="Analyst Notes & Justification"
              placeholder="Record forensic review details, user interview notes, or rationale for resolution..."
              value={actionDialog.notes}
              onChange={(e) => setActionDialog(prev => ({ ...prev, notes: e.target.value }))}
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActionDialog(prev => ({ ...prev, open: false }))}>Cancel</Button>
          <Button
            variant="contained"
            color="primary"
            disabled={actionDialog.submitting || !actionDialog.newStatus}
            onClick={handleUpdateAlertStatus}
          >
            {actionDialog.submitting ? 'Updating...' : 'Save Investigation'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
