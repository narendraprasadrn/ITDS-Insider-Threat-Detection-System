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
  Divider,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Tooltip
} from '@mui/material';
import BootstrapIcon from '../components/common/BootstrapIcon.jsx';
import { useAuth } from '../context/AuthContext.jsx';
import { useWorkspace } from '../context/WorkspaceContext.jsx';

const SAMPLE_QUERIES = [
  {
    name: 'Authorized Unbounded Read (ALLOW)',
    sql: 'SELECT * FROM Products;'
  },
  {
    name: 'Authorized Bounded Read (ALLOW)',
    sql: 'SELECT * FROM Products LIMIT 100;'
  },
  {
    name: 'Restricted Table Scope (Blocked)',
    sql: 'SELECT * FROM Payroll;'
  },
  {
    name: 'Unauthorized Operation (Blocked)',
    sql: 'DELETE FROM Products;'
  },
  {
    name: 'Multi-Table Out of Scope (Blocked)',
    sql: 'SELECT c.name, e.first_name FROM Customers c JOIN Employees e ON c.id = e.id;'
  },
  {
    name: 'Prohibited Destructive DDL (Blocked)',
    sql: 'DROP TABLE Customers;'
  },
  {
    name: 'System Schema Access (Blocked)',
    sql: 'SELECT * FROM mysql.user;'
  }
];

export default function WorkspacePage() {
  const { user, accessToken, hasRole } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const userRoles = Array.isArray(user?.roles) ? user.roles : (user?.role ? [user.role] : []);
  const isAdmin = userRoles.includes('admin') || user?.role === 'admin';
  const isDba = userRoles.includes('dba') || user?.role === 'dba';
  const primaryRole = isAdmin ? 'admin' : (isDba ? 'dba' : (user?.role || 'developer'));

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
  const [catalogResources, setCatalogResources] = useState([]);
  const [executing, setExecuting] = useState(false);
  const [activating, setActivating] = useState(false);
  const [error, setError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);
  const [timeLeft, setTimeLeft] = useState('');

  // Table-level access request modal
  const [openTableDialog, setOpenTableDialog] = useState(false);
  const [tableRequestForm, setTableRequestForm] = useState({
    target_table: '',
    operations: ['SELECT'],
    requested_duration_minutes: 60,
    justification: ''
  });
  const [submittingTableReq, setSubmittingTableReq] = useState(false);

  // Clear workspace state if authenticated user switches or logs out
  const lastUserIdRef = useRef(user?.id);
  useEffect(() => {
    if (lastUserIdRef.current && lastUserIdRef.current !== user?.id) {
      resetWorkspace();
      setSelectedSessionId('');
    }
    lastUserIdRef.current = user?.id;
  }, [user?.id, resetWorkspace, setSelectedSessionId]);

  // 1. Fetch authenticated user's JIT sessions
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

        const urlSessionId = searchParams.get('sessionId');
        if (urlSessionId) {
          setSelectedSessionId(urlSessionId);
        } else if (!isAdmin && !selectedSessionId && live.length > 0) {
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

  const fetchCatalogResources = async () => {
    if (!accessToken) return;
    try {
      const res = await fetch('/api/resources', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCatalogResources(data.data.resources || []);
      }
    } catch (err) {
      console.error('Error fetching catalog resources:', err);
    }
  };

  useEffect(() => {
    fetchSessions();
    fetchAvailableProfiles();
    fetchCatalogResources();
  }, [accessToken, user?.id]);

  const activeSession = activeSessions.find(s => String(s.id) === String(selectedSessionId));
  const anySession = allSessions.find(s => String(s.id) === String(selectedSessionId));
  const selectedSession = activeSession || anySession;

  const isSessionActive = Boolean(activeSession && activeSession.status === 'active');
  const isSessionExpiredOrRevoked = Boolean(selectedSessionId && !isSessionActive && !isAdmin);

  // 2. Fetch history & violations when selected session changes
  const fetchSessionTelemetry = async () => {
    const teleSessionId = selectedSessionId || (isAdmin ? 'admin' : '');
    if (!teleSessionId) {
      setHistory([]);
      setViolations([]);
      return;
    }
    try {
      const [histRes, violRes] = await Promise.all([
        fetch(`/api/workspace/history/${teleSessionId}`, { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch(`/api/workspace/violations/${teleSessionId}`, { headers: { Authorization: `Bearer ${accessToken}` } })
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
  }, [selectedSessionId, isAdmin]);

  // 3. Countdown timer for active session
  useEffect(() => {
    if (isAdmin) {
      setTimeLeft('ADMIN DIRECT ACCESS');
      return;
    }
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
  }, [selectedSession, isSessionActive, isAdmin]);

  // Quick activate routine role profile
  const handleQuickActivateRoleProfile = async () => {
    setActivating(true);
    setError(null);
    try {
      const targetProfile = availableProfiles.find(p => !p.requires_approval) || availableProfiles[0];
      const targetProfileId = targetProfile ? targetProfile.id : (isDba ? 3 : 1);

      const res = await fetch('/api/access-requests', {
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
      const newSessionId = data.data?.sessionId || data.data?.session_id;
      if (newSessionId) {
        setSelectedSessionId(String(newSessionId));
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setActivating(false);
    }
  };

  // 4. Execute Query Pipeline
  const handleExecute = async () => {
    if (!isAdmin && !selectedSessionId) {
      setError('Please select an active JIT session before executing SQL.');
      return;
    }
    if (!isAdmin && (!isSessionActive || timeLeft === 'EXPIRED')) {
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

    const execSessionId = selectedSessionId ? parseInt(selectedSessionId, 10) : 'admin';

    try {
      const res = await fetch('/api/workspace/execute', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          session_id: execSessionId,
          sql: sqlQuery.trim()
        })
      });

      const data = await res.json();

      if ((res.status === 403 || !res.ok) && data.data?.blocked) {
        // Pre-Execution Policy Block (Zero rows returned)
        setError(null);
        setExecutionResult({
          blocked: true,
          outcome: data.data.outcome || 'BLOCKED PRE-EXECUTION',
          rule: data.data.rule || data.data.policyDecision?.violations?.[0] || 'UNAUTHORIZED_QUERY',
          explanation: data.data.explanation || data.data.policyDecision?.reasons?.[0] || data.data.message || 'Query blocked by security policy',
          message: data.data.message || 'Query Blocked by Security Policy',
          eventId: data.data.eventId,
          sessionId: data.data.sessionId,
          policyDecision: data.data.policyDecision,
          operation: data.data.operation,
          tables: data.data.tables,
          rows: [],
          rowCount: 0,
          columns: []
        });
      } else if (!res.ok || !data.success) {
        setExecutionResult(null);
        setError(`Database Error: ${data.error?.message || 'SQL execution failed'}`);
      } else {
        // Successful execution (ALLOWED or POST-EXECUTION DETECTED)
        setError(null);
        setExecutionResult(data.data);
      }

      fetchSessionTelemetry();
    } catch (err) {
      setError(err.message || 'Network error while executing query');
    } finally {
      setExecuting(false);
    }
  };

  // Table Request Handling
  const handleOpenTableRequest = (tableName = '') => {
    setTableRequestForm({
      target_table: tableName || (catalogResources[0]?.table_name || ''),
      operations: ['SELECT'],
      requested_duration_minutes: 60,
      justification: ''
    });
    setOpenTableDialog(true);
  };

  const handleSubmitTableRequest = async (e) => {
    e.preventDefault();
    if (!tableRequestForm.justification.trim()) {
      setError('Business justification is required for table-level access requests');
      return;
    }

    setSubmittingTableReq(true);
    setError(null);
    try {
      const res = await fetch('/api/access-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          request_type: 'table',
          target_table: tableRequestForm.target_table,
          operations: tableRequestForm.operations,
          requested_duration_minutes: tableRequestForm.requested_duration_minutes,
          justification: tableRequestForm.justification.trim()
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setOpenTableDialog(false);
        setActionSuccess(`Access request for table '${tableRequestForm.target_table}' submitted to approval queue.`);
      } else {
        setError(data.error?.message || 'Failed to submit table access request');
      }
    } catch {
      setError('Network error while submitting table access request');
    } finally {
      setSubmittingTableReq(false);
    }
  };

  // Compute Accessible vs Inaccessible Tables for the workspace
  let accessibleTables = [];
  let restrictedTables = [];

  if (isAdmin) {
    accessibleTables = catalogResources.map(r => r.table_name);
    restrictedTables = [];
  } else if ((selectedSession || activeSession) && (selectedSession?.granted_resources || activeSession?.granted_resources)) {
    const currentGrants = selectedSession?.granted_resources || activeSession?.granted_resources || [];
    const grantedList = currentGrants.map(r => (r.includes('.') ? r.split('.')[1] : r));
    accessibleTables = [...new Set(grantedList)];
    restrictedTables = catalogResources.filter(
      r => !accessibleTables.some(at => at.toLowerCase() === r.table_name.toLowerCase())
    );
  } else {
    const routine = availableProfiles.find(p => !p.requires_approval) || availableProfiles[0];
    const routineTables = (routine?.resources || []).map(r => r.table_name);
    accessibleTables = routineTables;
    restrictedTables = catalogResources.filter(
      r => !accessibleTables.some(at => at.toLowerCase() === r.table_name.toLowerCase())
    );
  }

  const canExecute = (isAdmin || (isSessionActive && timeLeft !== 'EXPIRED')) && !executing;

  return (
    <Box>
      {/* Top Banner */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#F5F7F7', display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <BootstrapIcon name="bi-terminal" size={24} color="#55E6C1" /> In-App SQL Workspace
          </Typography>
          <Typography variant="body2" sx={{ color: '#AAB8BC', mt: 0.5 }}>
            {isAdmin
              ? 'Authoritative Administrative Console with pre-execution OPA policy enforcement.'
              : 'Execute SQL queries against FinanceCorpDB using your authorized least-privilege JIT session.'}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5, alignItems: 'center' }}>
          <Chip
            label={`Identity: ${user?.username} (${primaryRole.toUpperCase()})`}
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
          {!isAdmin && (
            <Button
              startIcon={<BootstrapIcon name="bi-plus-circle" size={15} />}
              variant="contained"
              size="small"
              onClick={() => navigate('/sessions')}
            >
              Request New Session
            </Button>
          )}
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>{error}</Alert>}
      {actionSuccess && <Alert severity="success" sx={{ mb: 3 }} onClose={() => setActionSuccess(null)}>{actionSuccess}</Alert>}

      {/* Actionable Renewal Notice if Selected Session is Inactive (Developers/DBAs only) */}
      {!isAdmin && isSessionExpiredOrRevoked && (
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
                {`Activate Routine Profile`}
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
            Execution is disabled for this session. Your SQL query text and results are preserved. Please activate or request an active session to continue executing queries.
          </Typography>
        </Alert>
      )}

      {/* Scope and Identity Bar */}
      <Card sx={{ mb: 3, borderLeft: (isAdmin || isSessionActive) ? '4px solid #55E6C1' : '4px solid #F59E0B' }}>
        <CardContent sx={{ py: 2 }}>
          {isAdmin ? (
            /* Admin Direct Execution Bar */
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={4}>
                <Typography variant="caption" color="text.secondary" display="block">
                  ADMINISTRATIVE CONSOLE SCOPE
                </Typography>
                <Typography variant="body1" sx={{ fontWeight: 700, color: '#55E6C1', display: 'flex', alignItems: 'center', gap: 1 }}>
                  <BootstrapIcon name="bi-shield-lock-fill" size={18} color="#55E6C1" />
                  Full Catalog Scope (All Tables)
                </Typography>
                <Typography variant="caption" sx={{ color: '#AAB8BC' }}>
                  Target Database: <code>itds_db</code> • Direct execution authorized
                </Typography>
              </Grid>

              <Grid item xs={12} sm={4}>
                <Typography variant="caption" color="text.secondary" display="block">
                  SECURITY POLICY ENFORCEMENT
                </Typography>
                <Chip
                  icon={<BootstrapIcon name="bi-shield-check" size={14} />}
                  label="OPA Pre-Execution Active"
                  size="small"
                  color="success"
                  variant="outlined"
                  sx={{ fontWeight: 600, height: 24, mt: 0.5 }}
                />
                <Typography variant="caption" sx={{ color: '#AAB8BC', display: 'block', mt: 0.5 }}>
                  Destructive DDL and system tables strictly blocked
                </Typography>
              </Grid>

              <Grid item xs={12} sm={4} sx={{ textAlign: 'right' }}>
                <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 1, bgcolor: '#151A1D', border: '1px solid #343F3D', p: 1, borderRadius: 1.5 }}>
                  <BootstrapIcon name="bi-check-circle-fill" size={18} color="#55E6C1" />
                  <Box sx={{ textAlign: 'left' }}>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ lineHeight: 1 }}>
                      WORKSPACE STATUS
                    </Typography>
                    <Typography variant="body2" sx={{ fontWeight: 700, color: '#55E6C1' }}>
                      Ready to Execute
                    </Typography>
                  </Box>
                </Box>
              </Grid>
            </Grid>
          ) : (
            /* Developer / DBA JIT Session Selector Bar */
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
                      {selectedSession.profile_name} (itds_db)
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
                      Activate Routine Profile
                    </Button>
                  </Box>
                </Grid>
              )}
            </Grid>
          )}
        </CardContent>
      </Card>

      {/* SQL Editor & Sample Query Quick Select */}
      <Card sx={{ mb: 2 }}>
        <CardHeader
          title="SQL Query Console"
          titleTypographyProps={{ variant: 'subtitle1', fontWeight: 600 }}
          action={
            <Stack direction="row" spacing={1} alignItems="center" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
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
              Database scope: <code>itds_db</code> • Multi-statement execution restricted • Pre-execution OPA verified
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

      {/* Scope & Accessible Tables Bar */}
      <Card sx={{ mb: 3, bgcolor: '#1F2527', border: '1px solid #364345' }}>
        <CardContent sx={{ py: 1.5 }}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} md={6}>
              <Typography variant="caption" sx={{ color: '#55E6C1', fontWeight: 700, display: 'block', mb: 0.5 }}>
                ACCESSIBLE TABLES ({accessibleTables.length})
              </Typography>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                {accessibleTables.map(t => (
                  <Chip
                    key={t}
                    label={t}
                    size="small"
                    onClick={() => setSqlQuery(`SELECT * FROM ${t};`)}
                    clickable
                    sx={{
                      height: 22,
                      fontSize: '0.72rem',
                      fontWeight: 600,
                      bgcolor: 'rgba(85, 230, 193, 0.1)',
                      borderColor: '#55E6C1',
                      color: '#55E6C1',
                      border: '1px solid'
                    }}
                  />
                ))}
              </Box>
            </Grid>

            {!isAdmin && restrictedTables.length > 0 && (
              <Grid item xs={12} md={6}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                  <Typography variant="caption" sx={{ color: '#F59E0B', fontWeight: 700 }}>
                    RESTRICTED TABLES ({restrictedTables.length}) — CLICK TO REQUEST ACCESS
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                  {restrictedTables.map(r => (
                    <Tooltip key={r.table_name} title={`Request table-level access to '${r.table_name}' (${r.sensitivity} sensitivity)`}>
                      <Chip
                        icon={<BootstrapIcon name="bi-lock-fill" size={11} color="#AAB8BC" />}
                        label={r.table_name}
                        size="small"
                        onClick={() => handleOpenTableRequest(r.table_name)}
                        clickable
                        sx={{
                          height: 22,
                          fontSize: '0.72rem',
                          bgcolor: '#151A1D',
                          borderColor: '#435154',
                          color: '#AAB8BC',
                          border: '1px solid',
                          '&:hover': {
                            borderColor: '#F59E0B',
                            color: '#FCD34D'
                          }
                        }}
                      />
                    </Tooltip>
                  ))}
                </Box>
              </Grid>
            )}
          </Grid>
        </CardContent>
      </Card>

      {/* Query Execution Result Card */}
      {executionResult && (
        <Box sx={{ mb: 2.5 }}>
          {/* BLOCKED PRE-EXECUTION */}
          {(executionResult.blocked || executionResult.outcome === 'DENIED' || executionResult.outcome === 'BLOCKED PRE-EXECUTION') && (
            <Alert
              severity="error"
              icon={<BootstrapIcon name="bi-shield-x" size={22} color="#EF4444" />}
              sx={{ fontWeight: 500, bgcolor: 'rgba(239, 68, 68, 0.08)', border: '1px solid rgba(239, 68, 68, 0.4)' }}
            >
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, flexWrap: 'wrap', mb: 0.5 }}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#F87171' }}>
                  Query Blocked by Security Policy
                </Typography>
                <Chip
                  label="BLOCKED PRE-EXECUTION"
                  size="small"
                  sx={{ bgcolor: 'rgba(239, 68, 68, 0.25)', color: '#FCA5A5', fontWeight: 700, height: 22, fontSize: '0.68rem', border: '1px solid #EF4444' }}
                />
                {executionResult.rule && (
                  <Chip
                    label={`Rule: ${executionResult.rule}`}
                    size="small"
                    sx={{ bgcolor: 'rgba(239, 68, 68, 0.15)', color: '#F87171', fontWeight: 600, height: 22, fontSize: '0.68rem' }}
                  />
                )}
                <Chip
                  label="0 Rows Returned • MySQL Execution Prevented"
                  size="small"
                  variant="outlined"
                  sx={{ borderColor: 'rgba(239, 68, 68, 0.4)', color: '#FCA5A5', height: 22, fontSize: '0.68rem' }}
                />
              </Box>
              <Typography variant="body2" sx={{ mt: 0.5, color: '#E2E8F0' }}>
                {executionResult.explanation || executionResult.message || 'Query blocked by security policy.'}
              </Typography>

              {/* Actionable Request Access Button inside Blocked Alert for Table Out of Scope */}
              {!isAdmin && executionResult.tables && executionResult.tables.length > 0 && (
                <Box sx={{ mt: 1.5, display: 'flex', gap: 1, alignItems: 'center', flexWrap: 'wrap' }}>
                  <Typography variant="caption" sx={{ color: '#FCD34D', fontWeight: 600 }}>
                    Requires table authorization:
                  </Typography>
                  {executionResult.tables.map(tbl => {
                    const cleanTbl = tbl.includes('.') ? tbl.split('.')[1] : tbl;
                    return (
                      <Button
                        key={cleanTbl}
                        size="small"
                        variant="contained"
                        color="warning"
                        startIcon={<BootstrapIcon name="bi-key-fill" size={13} />}
                        onClick={() => handleOpenTableRequest(cleanTbl)}
                        sx={{ fontSize: '0.72rem', py: 0.3, textTransform: 'none' }}
                      >
                        Request Access to {cleanTbl}
                      </Button>
                    );
                  })}
                </Box>
              )}
            </Alert>
          )}

          {/* ALLOWED */}
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

      {/* Tabs: Query Results, Session Query History, Policy Violations */}
      <Tabs
        value={activeTab}
        onChange={(e, val) => setActiveTab(val)}
        sx={{ mb: 2, borderBottom: '1px solid #343F3D' }}
      >
        <Tab label={`Query Results ${executionResult?.rows ? `(${executionResult.rowCount})` : ''}`} />
        <Tab label={`Execution History (${history.length})`} />
        <Tab label={`Policy Violations (${violations.length})`} />
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
                    <TableCell colSpan={6} align="center" sx={{ py: 5, color: 'error.light' }}>
                      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                        <BootstrapIcon name="bi-shield-x" size={28} color="#EF4444" />
                        <Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#F87171' }}>
                          0 Rows Returned: Query Blocked by Security Policy
                        </Typography>
                        <Typography variant="body2" sx={{ color: '#AAB8BC', maxWidth: 500 }}>
                          Database execution was prevented prior to reaching MySQL. No rows or sensitive data were returned.
                        </Typography>
                        <Chip
                          label={executionResult.rule ? `Triggered Rule: ${executionResult.rule}` : 'Pre-execution policy violation'}
                          size="small"
                          sx={{ bgcolor: 'rgba(239, 68, 68, 0.15)', color: '#FCA5A5', mt: 0.5 }}
                        />
                      </Box>
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

      {/* TAB 1: Query History */}
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

      {/* TAB 2: Policy Violations */}
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
                      No policy violations recorded for this workspace.
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
                        <Chip
                          size="small"
                          variant="outlined"
                          label={v.enforcement_type === 'blocked_pre_execution' ? 'BLOCKED PRE-EXEC' : (v.enforcement_type === 'blocked_by_db' ? 'BLOCKED PRE-EXEC (DB)' : 'DETECTED POST-HOC')}
                          color={v.enforcement_type === 'blocked_pre_execution' || v.enforcement_type === 'blocked_by_db' ? 'error' : 'warning'}
                          sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700 }}
                        />
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

      {/* Table Access Request Dialog */}
      <Dialog open={openTableDialog} onClose={() => setOpenTableDialog(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleSubmitTableRequest}>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <BootstrapIcon name="bi-database-lock" size={20} color="#55E6C1" />
            Request Table Access Grant
          </DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
            <Typography variant="body2" sx={{ color: '#AAB8BC' }}>
              Request out-of-scope database table access. Once approved, permissions will attach dynamically to your active session.
            </Typography>

            <FormControl fullWidth size="small">
              <InputLabel id="table-select-ws-label">Target Table</InputLabel>
              <Select
                labelId="table-select-ws-label"
                value={tableRequestForm.target_table}
                label="Target Table"
                onChange={(e) => setTableRequestForm({ ...tableRequestForm, target_table: e.target.value })}
              >
                {catalogResources.map((r) => (
                  <MenuItem key={r.table_name} value={r.table_name}>
                    {r.table_name} ({r.sensitivity?.toUpperCase()} sensitivity)
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth size="small">
              <InputLabel id="duration-ws-label">Requested Duration</InputLabel>
              <Select
                labelId="duration-ws-label"
                value={tableRequestForm.requested_duration_minutes}
                label="Requested Duration"
                onChange={(e) => setTableRequestForm({ ...tableRequestForm, requested_duration_minutes: Number(e.target.value) })}
              >
                <MenuItem value={15}>15 Minutes</MenuItem>
                <MenuItem value={30}>30 Minutes</MenuItem>
                <MenuItem value={60}>60 Minutes (1 Hour)</MenuItem>
                <MenuItem value={120}>120 Minutes (2 Hours)</MenuItem>
              </Select>
            </FormControl>

            <TextField
              label="Business Justification (Mandatory)"
              multiline
              rows={3}
              required
              fullWidth
              size="small"
              placeholder="Explain the technical or business necessity for accessing this specific table..."
              value={tableRequestForm.justification}
              onChange={(e) => setTableRequestForm({ ...tableRequestForm, justification: e.target.value })}
            />
          </DialogContent>
          <DialogActions sx={{ p: 2 }}>
            <Button onClick={() => setOpenTableDialog(false)} disabled={submittingTableReq} size="small">
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={submittingTableReq || !tableRequestForm.justification.trim()}
              size="small"
              startIcon={submittingTableReq ? <CircularProgress size={14} color="inherit" /> : <BootstrapIcon name="bi-send" size={14} />}
            >
              {submittingTableReq ? 'Submitting...' : 'Submit Request'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
}
