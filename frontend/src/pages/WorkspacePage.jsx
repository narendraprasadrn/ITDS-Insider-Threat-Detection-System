// frontend/src/pages/WorkspacePage.jsx
import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Box,
  Typography,
  Grid,
  Card,
  CardContent,
  CardHeader,
  Chip,
  Button,
  Tabs,
  Tab,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Alert,
  CircularProgress,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Stack,
  Divider
} from '@mui/material';
import BootstrapIcon from '../components/common/BootstrapIcon.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useWorkspace } from '../context/WorkspaceContext.jsx';

const SAMPLE_QUERIES = [
  {
    name: 'Compliant Bounded Read (ALLOW)',
    sql: "SELECT customer_code, name, customer_category, credit_limit FROM Customers WHERE customer_category = 'enterprise' LIMIT 5;"
  },
  {
    name: 'Authorized Read (ALLOW)',
    sql: 'SELECT * FROM Products;'
  },
  {
    name: 'Critical Data Scan (Blocked)',
    sql: 'SELECT * FROM Payroll;'
  },
  {
    name: 'Unauthorized DELETE (Blocked)',
    sql: 'DELETE FROM Customers WHERE id = 99999;'
  },
  {
    name: 'Unauthorized DDL (Blocked)',
    sql: 'DROP TABLE Products;'
  }
];

export default function WorkspacePage() {
  const { user, accessToken, hasRole } = useAuth();
  const isAdminOrDba = hasRole ? (hasRole('admin') || hasRole('dba')) : ((user?.roles || []).includes('admin') || (user?.roles || []).includes('dba'));
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Persistent workspace state stored in React Context across navigation
  const {
    selectedSessionId,
    setSelectedSessionId,
    sqlQuery,
    setSqlQuery,
    executionResult,
    setExecutionResult,
    activeTab,
    setActiveTab,
    history,
    setHistory,
    violations,
    setViolations,
    resetWorkspace
  } = useWorkspace();

  const [allSessions, setAllSessions] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);
  const [availableProfiles, setAvailableProfiles] = useState([]);
  const [executing, setExecuting] = useState(false);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState(null);
  const [timeLeft, setTimeLeft] = useState('');

  const userRoles = Array.isArray(user?.roles) ? user.roles : (user?.role ? [user.role] : []);
  const isAdmin = userRoles.includes('admin') || user?.role === 'admin';
  const isDba = userRoles.includes('dba') || user?.role === 'dba';
  const primaryRole = isAdmin ? 'admin' : (isDba ? 'dba' : (user?.role || 'developer'));

  const routineProfile = availableProfiles.find(p => !p.requires_approval) || availableProfiles[0];
  const routineProfileName = routineProfile
    ? routineProfile.name
    : (isAdmin ? 'Admin Security Administration' : (isDba ? 'DBA Operations Profile' : 'Developer Read Profile'));

  // Clear workspace state if authenticated user switches or logs out
  const lastUserIdRef = useRef(user?.id);
  useEffect(() => {
    if (lastUserIdRef.current && lastUserIdRef.current !== user?.id) {
      resetWorkspace();
      setSelectedSessionId('');
    }
    lastUserIdRef.current = user?.id;
  }, [user?.id, resetWorkspace, setSelectedSessionId]);

  // 1. Fetch authenticated user's JIT sessions (both active and historical)
  const fetchSessions = async () => {
    if (!accessToken) return;
    try {
      const res = await fetch('/api/sessions/my', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const rawSessions = data.data.sessions || [];
        const live = (data.data.active_sessions || rawSessions).filter(s => s.status === 'active');
        setAllSessions(rawSessions);
        setActiveSessions(live);

        // Require explicit selection or preserve URL query param
        const urlSessionId = searchParams.get('sessionId');
        if (urlSessionId) {
          setSelectedSessionId(urlSessionId);
        } else if (!selectedSessionId && live.length === 1) {
          // If no session was previously selected and there is exactly 1 active session, default to it
          setSelectedSessionId(String(live[0].id));
        }
      }
    } catch (err) {
      console.error('Error fetching sessions:', err);
    }
  };

  const fetchAvailableProfiles = async () => {
    if (!accessToken) return;
    try {
      const res = await fetch('/api/profiles/available', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setAvailableProfiles(data.data.profiles || []);
      }
    } catch (err) {
      console.error('Error fetching available profiles:', err);
    }
  };

  useEffect(() => {
    fetchSessions();
    fetchAvailableProfiles();
  }, [accessToken, user?.id]);

  const activeSession = activeSessions.find(s => String(s.id) === String(selectedSessionId));
  const anySession = allSessions.find(s => String(s.id) === String(selectedSessionId));
  const selectedSession = activeSession || anySession;

  const isSessionActive = Boolean(activeSession && activeSession.status === 'active');
  const isSessionExpiredOrRevoked = Boolean(selectedSessionId && !isSessionActive);

  // 2. Fetch history & violations when selected session changes
  const fetchSessionTelemetry = async () => {
    if (!selectedSessionId) {
      setHistory([]);
      setViolations([]);
      return;
    }
    try {
      const [histRes, violRes] = await Promise.all([
        fetch(`/api/workspace/history/${selectedSessionId}`, { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch(`/api/workspace/violations/${selectedSessionId}`, { headers: { Authorization: `Bearer ${accessToken}` } })
      ]);

      const [histData, violData] = await Promise.all([histRes.json(), violRes.json()]);
      if (histRes.ok && histData.success) setHistory(histData.data.history || []);
      if (violRes.ok && violData.success) setViolations(violData.data.violations || []);
    } catch (err) {
      console.error('Error fetching session telemetry:', err);
    }
  };

  useEffect(() => {
    fetchSessionTelemetry();
  }, [selectedSessionId]);

  // 3. Countdown timer for active session
  useEffect(() => {
    if (!selectedSession) {
      setTimeLeft('');
      return;
    }

    if (!isSessionActive) {
      setTimeLeft(selectedSession.status ? selectedSession.status.toUpperCase() : 'INACTIVE');
      return;
    }

    const updateTimer = () => {
      const remainingMs = new Date(selectedSession.end_time).getTime() - Date.now();
      if (remainingMs <= 0) {
        setTimeLeft('EXPIRED');
        return;
      }
      const mins = Math.floor(remainingMs / 60000);
      const secs = Math.floor((remainingMs % 60000) / 1000);
      setTimeLeft(`${mins}m ${secs}s`);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);
    return () => clearInterval(interval);
  }, [selectedSession, isSessionActive]);

  // Quick activate routine role profile
  const handleQuickActivateRoleProfile = async () => {
    setActivating(true);
    setError(null);
    try {
      const targetProfile = availableProfiles.find(p => !p.requires_approval) || availableProfiles[0];
      const targetProfileId = targetProfile ? targetProfile.id : (isAdmin ? 7 : (isDba ? 3 : 1));

      const res = await fetch('/api/requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          profile_id: targetProfileId,
          requested_duration_minutes: 60,
          justification: `Routine operational access activated by ${primaryRole} workspace console.`
        })
      });

      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to activate role session');
      }

      await fetchSessions();
      if (data.data?.request?.session_id) {
        setSelectedSessionId(String(data.data.request.session_id));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setActivating(false);
    }
  };

  // 4. Execute Query Pipeline
  const handleExecute = async () => {
    if (!selectedSessionId) {
      setError('Please explicitly select an active JIT session before executing SQL.');
      return;
    }
    if (!isSessionActive || timeLeft === 'EXPIRED') {
      setError('The selected session is expired or revoked. Please activate or request a new JIT session.');
      return;
    }
    if (!sqlQuery.trim()) {
      setError('Please enter a SQL query.');
      return;
    }

    setExecuting(true);
    setError(null);
    setExecutionResult(null);

    try {
      const res = await fetch('/api/workspace/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          session_id: parseInt(selectedSessionId, 10),
          sql: sqlQuery.trim()
        })
      });

      const data = await res.json();

      if (res.status === 403 && data.data?.blocked) {
        // Pre-Execution Policy Block
        setExecutionResult({
          blocked: true,
          outcome: 'DENIED',
          eventId: data.data.eventId,
          sessionId: data.data.sessionId,
          policyDecision: data.data.policyDecision,
          operation: data.data.operation,
          tables: data.data.tables,
          message: data.data.message
        });
      } else if (!res.ok || !data.success) {
        setError(data.error?.message || 'SQL execution failed');
      } else {
        // Successful execution (ALLOWED, REVIEW, or POST-EXECUTION DETECTED)
        setExecutionResult(data.data);
      }

      // Refresh telemetry tabs
      fetchSessionTelemetry();
    } catch (err) {
      setError(err.message || 'Network error while executing query');
    } finally {
      setExecuting(false);
    }
  };

  const isRoleMismatched = selectedSession && isSessionActive && (
    (isAdmin && selectedSession.profile_name === 'Developer Read Profile') ||
    (isDba && selectedSession.profile_name === 'Developer Read Profile')
  );

  const canExecute = isSessionActive && timeLeft !== 'EXPIRED' && !executing;

  return (
    <Box>
      {/* Top Banner */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#F5F7F7', display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <BootstrapIcon name="bi-terminal" size={24} color="#55E6C1" /> In-App SQL Workspace
          </Typography>
          <Typography variant="body2" sx={{ color: '#AAB8BC', mt: 0.5 }}>
            Execute SQL queries directly against <code>FinanceCorpDB</code> using your authorized least-privilege JIT session.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <Chip
            label={`Identity: ${user?.username} (${(user?.role || user?.roles?.[0] || 'user').toUpperCase()})`}
            color="primary"
            variant="outlined"
            sx={{ fontWeight: 600 }}
          />
          <Button
            startIcon={<BootstrapIcon name="bi-arrow-clockwise" size={15} />}
            variant="outlined"
            size="small"
            onClick={() => { fetchSessions(); fetchSessionTelemetry(); }}
          >
            Refresh
          </Button>
          <Button
            startIcon={<BootstrapIcon name="bi-plus-circle" size={15} />}
            variant="contained"
            size="small"
            onClick={() => navigate('/sessions')}
          >
            Request New Session
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>{error}</Alert>}

      {/* Actionable Renewal Notice if Selected Session is Inactive/Expired/Revoked */}
      {isSessionExpiredOrRevoked && (
        <Alert
          severity="warning"
          icon={<BootstrapIcon name="bi-exclamation-triangle-fill" size={18} color="#F59E0B" />}
          sx={{ mb: 3 }}
          action={
            <Stack direction="row" spacing={1}>
              <Button
                size="small"
                color="warning"
                variant="contained"
                startIcon={activating ? <CircularProgress size={14} color="inherit" /> : <BootstrapIcon name="bi-lightning-charge-fill" size={14} />}
                onClick={handleQuickActivateRoleProfile}
                disabled={activating}
                sx={{ textTransform: 'none' }}
              >
                {`Activate ${routineProfileName}`}
              </Button>
              <Button
                size="small"
                color="inherit"
                variant="outlined"
                onClick={() => navigate('/sessions')}
                sx={{ textTransform: 'none' }}
              >
                Request Session
              </Button>
            </Stack>
          }
        >
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Session #{selectedSessionId} is {selectedSession?.status ? selectedSession.status.toUpperCase() : 'INACTIVE'}
          </Typography>
          <Typography variant="body2">
            Execution is disabled for this session. Your SQL query text, results, and history are preserved. Please activate or request an active session to continue executing queries.
          </Typography>
        </Alert>
      )}

      {/* Role Profile Mismatch Warning */}
      {isRoleMismatched && (
        <Alert severity="warning" sx={{ mb: 2 }}>
          <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
            Notice: Developer Profile Active for {primaryRole.toUpperCase()}
          </Typography>
          <Typography variant="body2">
            You are currently selected on <b>Developer Read Profile</b>. As an <b>{primaryRole.toUpperCase()}</b>, you should use your authorized routine profile (e.g., <b>{isAdmin ? 'Admin Security Administration' : 'DBA Operations Profile'}</b>) for full visibility.
          </Typography>
        </Alert>
      )}

      {/* Active Session Selector Bar */}
      <Card sx={{ mb: 3, borderLeft: isSessionActive ? '4px solid #55E6C1' : '4px solid #F59E0B' }}>
        <CardContent sx={{ py: 2 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={4}>
              <FormControl fullWidth size="small">
                <InputLabel id="active-session-label">Active JIT Session</InputLabel>
                <Select
                  labelId="active-session-label"
                  value={selectedSessionId}
                  label="Active JIT Session"
                  onChange={(e) => setSelectedSessionId(e.target.value)}
                >
                  <MenuItem value="">
                    <em>-- Select a JIT Session --</em>
                  </MenuItem>
                  {activeSessions.map((s) => (
                    <MenuItem key={s.id} value={String(s.id)}>
                      #{s.id} — {s.profile_name} ({s.mysql_username}) [ACTIVE]
                    </MenuItem>
                  ))}
                  {/* Preserve inactive selected session option in dropdown */}
                  {isSessionExpiredOrRevoked && anySession && (
                    <MenuItem key={anySession.id} value={String(anySession.id)} sx={{ color: 'text.secondary' }}>
                      #{anySession.id} — {anySession.profile_name} ({anySession.status ? anySession.status.toUpperCase() : 'INACTIVE'})
                    </MenuItem>
                  )}
                </Select>
              </FormControl>
            </Grid>

            {selectedSession ? (
              <>
                <Grid item xs={12} sm={3}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    EPHEMERAL IDENTITY & SCOPE
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
                    {selectedSession.mysql_username}
                  </Typography>
                  <Typography variant="caption" sx={{ color: isSessionActive ? '#55E6C1' : '#F59E0B', fontWeight: 600 }}>
                    {selectedSession.profile_name} (DB: FinanceCorpDB)
                  </Typography>
                </Grid>

                <Grid item xs={12} sm={3}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    GRANTED OPERATIONS
                  </Typography>
                  <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap', gap: 0.5 }}>
                    {(selectedSession.granted_operations || []).map(op => (
                      <Chip key={op} label={op} size="small" color={isSessionActive ? 'primary' : 'default'} sx={{ height: 18, fontSize: '0.65rem' }} />
                    ))}
                  </Stack>
                </Grid>

                <Grid item xs={12} sm={2} sx={{ textAlign: 'right' }}>
                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, bgcolor: '#151A1D', border: '1px solid #343F3D', p: 1, borderRadius: 1.5 }}>
                    <BootstrapIcon name="bi-clock-history" size={16} color={isSessionActive && timeLeft !== 'EXPIRED' ? '#55E6C1' : '#EF4444'} />
                    <Box sx={{ textAlign: 'left' }}>
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ lineHeight: 1 }}>
                        SESSION STATUS
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: isSessionActive && timeLeft !== 'EXPIRED' ? '#55E6C1' : '#EF4444' }}>
                        {timeLeft || (isSessionActive ? 'Active' : 'Inactive')}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
              </>
            ) : (
              <Grid item xs={12} sm={8}>
                <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', bgcolor: 'rgba(245, 158, 11, 0.08)', border: '1px solid rgba(245, 158, 11, 0.3)', p: 1.5, borderRadius: 1.5 }}>
                  <Typography variant="body2" color="warning.main" sx={{ fontWeight: 500 }}>
                    {activeSessions.length === 0
                      ? `No active JIT sessions found for ${user?.username}. Click below to activate your routine profile.`
                      : 'Please select an active JIT session from the dropdown above to execute queries.'}
                  </Typography>
                  <Button
                    size="small"
                    variant="contained"
                    color="warning"
                    startIcon={activating ? <CircularProgress size={14} color="inherit" /> : <BootstrapIcon name="bi-lightning-charge-fill" size={14} />}
                    onClick={handleQuickActivateRoleProfile}
                    disabled={activating}
                    sx={{ textTransform: 'none', ml: 2, whiteSpace: 'nowrap' }}
                  >
                    {`Activate ${routineProfileName}`}
                  </Button>
                </Box>
              </Grid>
            )}
          </Grid>
        </CardContent>
      </Card>

      {/* SQL Editor & Sample Query Quick Select */}
      <Card sx={{ mb: 3 }}>
        <CardHeader
          title="SQL Query Console"
          titleTypographyProps={{ variant: 'subtitle1', fontWeight: 600 }}
          action={
            <Stack direction="row" spacing={1} alignItems="center">
              <Typography variant="caption" color="text.secondary">
                Templates:
              </Typography>
              {SAMPLE_QUERIES.map((sq, idx) => (
                <Chip
                  key={idx}
                  label={sq.name}
                  size="small"
                  clickable
                  variant="outlined"
                  onClick={() => setSqlQuery(sq.sql)}
                  sx={{ fontSize: '0.7rem' }}
                />
              ))}
            </Stack>
          }
        />
        <Divider />
        <CardContent>
          <TextField
            multiline
            rows={5}
            fullWidth
            value={sqlQuery}
            onChange={(e) => setSqlQuery(e.target.value)}
            placeholder="SELECT * FROM Customers LIMIT 5;"
            sx={{
              fontFamily: 'monospace',
              '& .MuiInputBase-input': {
                fontFamily: 'Consolas, Monaco, monospace',
                fontSize: '0.9rem',
                lineHeight: 1.5
              }
            }}
          />

          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mt: 2 }}>
            <Typography variant="caption" color="text.secondary">
              Database scope: <code>FinanceCorpDB</code> | Multi-statement execution restricted.
            </Typography>
            <Button
              variant="contained"
              color="primary"
              startIcon={executing ? <CircularProgress size={16} color="inherit" /> : <BootstrapIcon name="bi-play-fill" size={16} />}
              onClick={handleExecute}
              disabled={!canExecute}
            >
              {executing ? 'Evaluating & Executing...' : 'Execute Query'}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* 4 DISTINCT OUTCOMES: ALLOWED, DENIED, REVIEW, POST-EXECUTION DETECTED */}
      {executionResult && (
        <Box sx={{ mb: 2.5 }}>
          {/* 1. DENIED (Pre-execution preventative block) */}
          {(executionResult.blocked || executionResult.outcome === 'DENIED') && (
            <Alert
              severity="error"
              icon={<BootstrapIcon name="bi-shield-x" size={20} color="#EF4444" />}
              sx={{ fontWeight: 500 }}
              action={
                executionResult.eventId && (
                  <Button
                    size="small"
                    color="inherit"
                    variant="outlined"
                    startIcon={<BootstrapIcon name="bi-shield-check" size={14} />}
                    onClick={() => setActiveTab(2)}
                    sx={{ fontSize: '0.72rem', textTransform: 'none' }}
                  >
                    Inspect Violation #{executionResult.eventId}
                  </Button>
                )
              }
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Query Pre-Emptively Blocked [DENIED]
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {executionResult.message || 'Operation or table access denied prior to execution by policy.'}
              </Typography>
              {isAdminOrDba && (
                <Box sx={{ mt: 1, display: 'flex', gap: 1, flexWrap: 'wrap' }}>
                  {(executionResult.policyDecision?.violations || []).map(v => (
                    <Chip key={v} label={`Violation: ${v}`} size="small" color="error" sx={{ height: 20, fontSize: '0.7rem' }} />
                  ))}
                </Box>
              )}
            </Alert>
          )}

          {/* 2. REVIEW (Executed with non-blocking behavioral review flag e.g. UNBOUNDED_BULK_READ on large/sensitive tables) */}
          {executionResult.outcome === 'REVIEW' && (
            <Paper
              variant="outlined"
              sx={{
                p: 1.5,
                bgcolor: 'rgba(245, 158, 11, 0.08)',
                borderColor: 'rgba(245, 158, 11, 0.35)',
                borderRadius: 2
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <BootstrapIcon name="bi-exclamation-circle" size={18} color="#F59E0B" />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#FCD34D' }}>
                    Query Executed Successfully
                  </Typography>
                  <Chip
                    label="REVIEW"
                    size="small"
                    sx={{ bgcolor: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B', fontWeight: 700, height: 20, fontSize: '0.65rem' }}
                  />
                </Box>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip icon={<BootstrapIcon name="bi-stopwatch" size={12} />} label={`${executionResult.executionTimeMs} ms`} size="small" variant="outlined" sx={{ height: 22, fontSize: '0.7rem' }} />
                  <Chip label={`${executionResult.rowCount} rows`} size="small" sx={{ bgcolor: 'rgba(245, 158, 11, 0.15)', color: '#FCD34D', fontWeight: 700, height: 22, fontSize: '0.7rem' }} />
                  {executionResult.eventId && (
                    <Button
                      size="small"
                      variant="text"
                      color="info"
                      startIcon={<BootstrapIcon name="bi-shield-check" size={13} />}
                      onClick={() => setActiveTab(2)}
                      sx={{ fontSize: '0.75rem', py: 0.2, textTransform: 'none' }}
                    >
                      View in Session Violations (Event #{executionResult.eventId})
                    </Button>
                  )}
                </Stack>
              </Box>
              <Typography variant="body2" sx={{ color: '#A6ADB4', mt: 0.5, fontSize: '0.82rem' }}>
                {isAdminOrDba
                  ? `Behavioral review: Query flagged by rule ${executionResult.policyDecision?.violations?.join(', ') || 'UNBOUNDED_BULK_READ'} (full table scan without LIMIT). Attributed to Event #${executionResult.eventId || 'N/A'}.`
                  : 'Behavioral review note: Query executed without a LIMIT clause. Result returned with session telemetry tracking.'}
              </Typography>
            </Paper>
          )}

          {/* 3. POST-EXECUTION DETECTED (Executed, then anomaly detected post-hoc) */}
          {executionResult.outcome === 'POST-EXECUTION DETECTED' && (
            <Paper
              variant="outlined"
              sx={{
                p: 1.5,
                bgcolor: 'rgba(245, 158, 11, 0.08)',
                borderColor: 'rgba(245, 158, 11, 0.35)',
                borderRadius: 2
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <BootstrapIcon name="bi-exclamation-triangle" size={18} color="#F59E0B" />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#FDE68A' }}>
                    Query Executed Successfully
                  </Typography>
                  <Chip
                    label="POST-EXECUTION DETECTED"
                    size="small"
                    sx={{ bgcolor: 'rgba(245, 158, 11, 0.15)', color: '#F59E0B', fontWeight: 700, height: 20, fontSize: '0.65rem' }}
                  />
                </Box>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip icon={<BootstrapIcon name="bi-stopwatch" size={12} />} label={`${executionResult.executionTimeMs} ms`} size="small" variant="outlined" sx={{ height: 22, fontSize: '0.7rem' }} />
                  <Chip label={`${executionResult.rowCount} rows`} size="small" sx={{ bgcolor: 'rgba(245, 158, 11, 0.2)', color: '#FCD34D', fontWeight: 700, height: 22, fontSize: '0.7rem' }} />
                  {executionResult.eventId && (
                    <Button
                      size="small"
                      variant="text"
                      color="warning"
                      startIcon={<BootstrapIcon name="bi-shield-check" size={13} />}
                      onClick={() => setActiveTab(2)}
                      sx={{ fontSize: '0.75rem', py: 0.2, textTransform: 'none' }}
                    >
                      View in Session Violations (Event #{executionResult.eventId})
                    </Button>
                  )}
                </Stack>
              </Box>
              <Typography variant="body2" sx={{ color: '#A6ADB4', mt: 0.5, fontSize: '0.82rem' }}>
                {isAdminOrDba
                  ? `Post-execution anomaly: Query returned ${executionResult.rowCount} rows exceeding baseline threshold. Attributed to Event #${executionResult.eventId || 'N/A'}.`
                  : `Telemetry note: Query returned ${executionResult.rowCount} rows exceeding baseline threshold.`}
              </Typography>
            </Paper>
          )}

          {/* 4. ALLOWED (Fully compliant) */}
          {executionResult.outcome === 'ALLOWED' && (
            <Paper
              variant="outlined"
              sx={{
                p: 1.5,
                bgcolor: 'rgba(16, 185, 129, 0.08)',
                borderColor: 'rgba(16, 185, 129, 0.35)',
                borderRadius: 2
              }}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <BootstrapIcon name="bi-check-circle-fill" size={18} color="#10B981" />
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#A7F3D0' }}>
                    Query Executed Successfully [ALLOWED]
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1} alignItems="center">
                  <Chip icon={<BootstrapIcon name="bi-stopwatch" size={12} />} label={`${executionResult.executionTimeMs} ms`} size="small" variant="outlined" sx={{ height: 22, fontSize: '0.7rem' }} />
                  <Chip label={`${executionResult.rowCount} rows`} size="small" sx={{ bgcolor: 'rgba(16, 185, 129, 0.2)', color: '#34D399', fontWeight: 700, height: 22, fontSize: '0.7rem' }} />
                </Stack>
              </Box>
              <Typography variant="body2" sx={{ color: '#A6ADB4', mt: 0.5, fontSize: '0.82rem' }}>
                Operation: <b>{executionResult.operation}</b> | Target Tables: <b>{executionResult.tables?.join(', ') || 'N/A'}</b>
              </Typography>
            </Paper>
          )}
        </Box>
      )}

      {/* Bottom Tabs: Query Results, Session Query History, Policy Violations */}
      <Tabs
        value={activeTab}
        onChange={(e, val) => setActiveTab(val)}
        sx={{ mb: 2, borderBottom: '1px solid #343F3D' }}
      >
        <Tab label={`Query Results ${executionResult?.rows ? `(${executionResult.rowCount})` : ''}`} />
        <Tab label={`Session Query History (${history.length})`} />
        <Tab label={`Session Violations (${violations.length})`} />
      </Tabs>

      {/* TAB 0: Query Results Table */}
      {activeTab === 0 && (
        <Card>
          <TableContainer component={Paper} variant="outlined" sx={{ maxHeight: 420 }}>
            <Table stickyHeader size="small">
              <TableHead>
                <TableRow>
                  {executionResult?.columns && executionResult.columns.length > 0 ? (
                    executionResult.columns.map((col, idx) => (
                      <TableCell key={idx} sx={{ fontWeight: 700, backgroundColor: 'rgba(255,255,255,0.06)' }}>
                        {col}
                      </TableCell>
                    ))
                  ) : (
                    <TableCell sx={{ fontWeight: 700 }}>Results</TableCell>
                  )}
                </TableRow>
              </TableHead>
              <TableBody>
                {!executionResult ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                      Execute a query to view results in this table.
                    </TableCell>
                  </TableRow>
                ) : executionResult.blocked ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'error.light' }}>
                      No results returned: Query was blocked pre-execution.
                    </TableCell>
                  </TableRow>
                ) : !executionResult.rows || executionResult.rows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={executionResult.columns?.length || 1} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      Query executed successfully with 0 rows returned.
                    </TableCell>
                  </TableRow>
                ) : (
                  executionResult.rows.map((row, rIdx) => (
                    <TableRow key={rIdx} hover>
                      {executionResult.columns.map((col, cIdx) => (
                        <TableCell key={cIdx} sx={{ fontSize: '0.85rem' }}>
                          {row[col] !== null && row[col] !== undefined ? String(row[col]) : <em style={{ opacity: 0.4 }}>NULL</em>}
                        </TableCell>
                      ))}
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {/* TAB 1: Session Query History */}
      {activeTab === 1 && (
        <Card>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead sx={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Event ID</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Timestamp</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Operation</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>SQL Statement</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Duration</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {history.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      No queries executed yet in this session.
                    </TableCell>
                  </TableRow>
                ) : (
                  history.map((h) => (
                    <TableRow key={h.id} hover>
                      <TableCell>
                        <Chip label={`#${h.id}`} size="small" variant="outlined" sx={{ height: 20, fontSize: '0.7rem', fontFamily: 'monospace' }} />
                      </TableCell>
                      <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.8rem' }}>
                        {new Date(h.event_time).toLocaleTimeString()}
                      </TableCell>
                      <TableCell>
                        <Chip label={h.operation} size="small" color={h.operation === 'SELECT' ? 'primary' : 'warning'} sx={{ height: 20, fontSize: '0.7rem' }} />
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontSize: '0.8rem', maxWidth: 400 }}>
                        {h.raw_sql}
                      </TableCell>
                      <TableCell>{h.execution_time_ms ? `${h.execution_time_ms} ms` : '-'}</TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={h.status.toUpperCase()}
                          color={h.status === 'blocked' ? 'error' : 'success'}
                          sx={{ height: 20, fontSize: '0.7rem' }}
                        />
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {/* TAB 2: Session Violations */}
      {activeTab === 2 && (
        <Card>
          <TableContainer component={Paper} variant="outlined">
            <Table size="small">
              <TableHead sx={{ backgroundColor: 'rgba(255,255,255,0.04)' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Event ID</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Rule</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Severity</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Enforcement</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Reason</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Detected At</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {violations.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      No policy violations recorded for this session.
                    </TableCell>
                  </TableRow>
                ) : (
                  violations.map((v) => (
                    <TableRow key={v.id} hover>
                      <TableCell>
                        <Chip label={`#${v.event_id || v.eventId || v.id}`} size="small" color="primary" variant="outlined" sx={{ height: 20, fontSize: '0.7rem', fontFamily: 'monospace' }} />
                      </TableCell>
                      <TableCell sx={{ fontWeight: 700, color: 'error.light' }}>{v.rule}</TableCell>
                      <TableCell>
                        <Chip size="small" label={v.severity.toUpperCase()} color={v.severity === 'critical' ? 'error' : 'warning'} sx={{ height: 20, fontSize: '0.7rem' }} />
                      </TableCell>
                      <TableCell>
                        <Chip size="small" variant="outlined" label={v.enforcement_type} sx={{ height: 20, fontSize: '0.7rem' }} />
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.85rem' }}>{v.reason}</TableCell>
                      <TableCell sx={{ fontSize: '0.8rem', whiteSpace: 'nowrap' }}>
                        {new Date(v.created_at).toLocaleTimeString()}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}
    </Box>
  );
}
