// frontend/src/pages/WorkspacePage.jsx
import React, { useState, useEffect } from 'react';
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
  Tooltip,
  IconButton
} from '@mui/material';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import TerminalIcon from '@mui/icons-material/Terminal';
import StorageIcon from '@mui/icons-material/Storage';
import TimerIcon from '@mui/icons-material/Timer';
import SecurityIcon from '@mui/icons-material/Security';
import HistoryIcon from '@mui/icons-material/History';
import ReportProblemIcon from '@mui/icons-material/ReportProblem';
import RefreshIcon from '@mui/icons-material/Refresh';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import BlockIcon from '@mui/icons-material/Block';
import SpeedIcon from '@mui/icons-material/Speed';
import AddTaskIcon from '@mui/icons-material/AddTask';
import { useAuth } from '../context/AuthContext.jsx';

const SAMPLE_QUERIES = [
  {
    name: 'Compliant Read',
    sql: "SELECT customer_code, name, customer_category, credit_limit FROM Customers WHERE customer_category = 'enterprise' LIMIT 5;"
  },
  {
    name: 'Bulk Read (Post-Hoc Anomaly)',
    sql: 'SELECT * FROM Orders;'
  },
  {
    name: 'Out-of-Scope Table (Blocked)',
    sql: 'SELECT salary_amount, payment_status FROM Payroll LIMIT 5;'
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
  const { user, accessToken } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [activeSessions, setActiveSessions] = useState([]);
  const [selectedSessionId, setSelectedSessionId] = useState(searchParams.get('sessionId') || '');
  const [sqlQuery, setSqlQuery] = useState(SAMPLE_QUERIES[0].sql);
  const [executing, setExecuting] = useState(false);
  const [executionResult, setExecutionResult] = useState(null);
  const [error, setError] = useState(null);
  const [activeTab, setActiveTab] = useState(0);

  // Telemetry lists
  const [history, setHistory] = useState([]);
  const [violations, setViolations] = useState([]);
  const [timeLeft, setTimeLeft] = useState('');

  // 1. Fetch user's active JIT sessions
  const fetchSessions = async () => {
    try {
      const res = await fetch('/api/sessions/my', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        const live = (data.data.sessions || []).filter(s => s.status === 'active');
        setActiveSessions(live);

        // Auto-select session if none selected or specified in URL
        if (!selectedSessionId && live.length > 0) {
          setSelectedSessionId(String(live[0].id));
        } else if (selectedSessionId && !live.some(s => String(s.id) === String(selectedSessionId))) {
          if (live.length > 0) setSelectedSessionId(String(live[0].id));
        }
      }
    } catch (err) {
      console.error('Error fetching sessions:', err);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const selectedSession = activeSessions.find(s => String(s.id) === String(selectedSessionId));

  // 2. Fetch history & violations when selected session changes
  const fetchSessionTelemetry = async () => {
    if (!selectedSessionId) return;
    try {
      const [histRes, violRes] = await Promise.all([
        fetch(`/api/workspace/history/${selectedSessionId}`, { headers: { Authorization: `Bearer ${accessToken}` } }),
        fetch(`/api/violations?session_id=${selectedSessionId}`, { headers: { Authorization: `Bearer ${accessToken}` } })
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
  }, [selectedSession]);

  // 4. Execute Query Pipeline
  const handleExecute = async () => {
    if (!selectedSessionId) {
      setError('Please select an active JIT session before executing SQL.');
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
          policyDecision: data.data.policyDecision,
          operation: data.data.operation,
          tables: data.data.tables,
          message: data.data.message
        });
      } else if (!res.ok || !data.success) {
        setError(data.error?.message || 'SQL execution failed');
      } else {
        // Successful execution
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

  return (
    <Box>
      {/* Top Banner */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
            <TerminalIcon color="primary" /> In-App Database Workspace
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Execute SQL queries directly against <code>FinanceCorpDB</code> using your authorized least-privilege JIT session.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button
            startIcon={<RefreshIcon />}
            variant="outlined"
            size="small"
            onClick={() => { fetchSessions(); fetchSessionTelemetry(); }}
          >
            Refresh
          </Button>
          <Button
            startIcon={<AddTaskIcon />}
            variant="contained"
            size="small"
            onClick={() => navigate('/sessions')}
          >
            Request New Session
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>{error}</Alert>}

      {/* Active Session Selector Bar */}
      <Card sx={{ mb: 3, borderLeft: '4px solid #1976d2' }}>
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
                  {activeSessions.length === 0 ? (
                    <MenuItem value="" disabled>No active JIT sessions found</MenuItem>
                  ) : (
                    activeSessions.map((s) => (
                      <MenuItem key={s.id} value={String(s.id)}>
                        #{s.id} — {s.profile_name} ({s.mysql_username})
                      </MenuItem>
                    ))
                  )}
                </Select>
              </FormControl>
            </Grid>

            {selectedSession && (
              <>
                <Grid item xs={12} sm={3}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    PROVISIONED USER & PROFILE
                  </Typography>
                  <Typography variant="body2" sx={{ fontWeight: 600, fontFamily: 'monospace' }}>
                    {selectedSession.mysql_username}
                  </Typography>
                  <Typography variant="caption" color="primary.light">
                    {selectedSession.profile_name}
                  </Typography>
                </Grid>

                <Grid item xs={12} sm={3}>
                  <Typography variant="caption" color="text.secondary" display="block">
                    OPERATIONS & GRANTS
                  </Typography>
                  <Stack direction="row" spacing={0.5} sx={{ mt: 0.5 }}>
                    {(selectedSession.granted_operations || []).map(op => (
                      <Chip key={op} label={op} size="small" color="primary" sx={{ height: 18, fontSize: '0.65rem' }} />
                    ))}
                  </Stack>
                </Grid>

                <Grid item xs={12} sm={2} sx={{ textAlign: 'right' }}>
                  <Box sx={{ display: 'inline-flex', alignItems: 'center', gap: 0.5, bgcolor: 'rgba(255,255,255,0.04)', p: 1, borderRadius: 1 }}>
                    <TimerIcon fontSize="small" color={timeLeft === 'EXPIRED' ? 'error' : 'warning'} />
                    <Box sx={{ textAlign: 'left' }}>
                      <Typography variant="caption" color="text.secondary" display="block" sx={{ lineHeight: 1 }}>
                        TIME REMAINING
                      </Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: timeLeft === 'EXPIRED' ? 'error.main' : 'warning.main' }}>
                        {timeLeft || 'Active'}
                      </Typography>
                    </Box>
                  </Box>
                </Grid>
              </>
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
              startIcon={executing ? <CircularProgress size={16} color="inherit" /> : <PlayArrowIcon />}
              onClick={handleExecute}
              disabled={executing || !selectedSessionId || timeLeft === 'EXPIRED'}
            >
              {executing ? 'Evaluating & Executing...' : 'Execute Query'}
            </Button>
          </Box>
        </CardContent>
      </Card>

      {/* Policy Evaluation Banner */}
      {executionResult && (
        <Box sx={{ mb: 3 }}>
          {executionResult.blocked ? (
            <Alert
              severity="error"
              icon={<BlockIcon fontSize="inherit" />}
              sx={{ fontWeight: 500 }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                Query Pre-Emptively Blocked by OPA Policy
              </Typography>
              <Typography variant="body2" sx={{ mt: 0.5 }}>
                {executionResult.message}
              </Typography>
              <Box sx={{ mt: 1, display: 'flex', gap: 1 }}>
                {(executionResult.policyDecision?.violations || []).map(v => (
                  <Chip key={v} label={v} size="small" color="error" />
                ))}
              </Box>
            </Alert>
          ) : (
            <Alert
              severity={executionResult.policyDecision?.violations?.length > 0 ? 'warning' : 'success'}
              icon={<CheckCircleIcon fontSize="inherit" />}
            >
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Box>
                  <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                    {executionResult.policyDecision?.violations?.length > 0
                      ? 'Executed with Post-Hoc Telemetry Anomaly'
                      : 'OPA Policy Permitted & Executed'}
                  </Typography>
                  <Typography variant="body2">
                    Operation: <b>{executionResult.operation}</b> | Target Tables: <b>{executionResult.tables?.join(', ') || 'N/A'}</b>
                  </Typography>
                </Box>
                <Stack direction="row" spacing={1.5}>
                  <Chip
                    icon={<SpeedIcon />}
                    label={`${executionResult.executionTimeMs} ms`}
                    size="small"
                    color="default"
                    variant="outlined"
                  />
                  <Chip
                    label={`${executionResult.rowCount} rows returned`}
                    size="small"
                    color="primary"
                  />
                </Stack>
              </Box>
              {executionResult.policyDecision?.violations?.length > 0 && (
                <Box sx={{ mt: 1 }}>
                  <Typography variant="caption" color="warning.main" sx={{ fontWeight: 600 }}>
                    Telemetry Flags: {executionResult.policyDecision.violations.join(', ')}
                  </Typography>
                </Box>
              )}
            </Alert>
          )}
        </Box>
      )}

      {/* Bottom Tabs: Query Results, Session Query History, Policy Violations */}
      <Tabs
        value={activeTab}
        onChange={(e, val) => setActiveTab(val)}
        sx={{ mb: 2, borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}
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
                    <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      No queries executed yet in this session.
                    </TableCell>
                  </TableRow>
                ) : (
                  history.map((h) => (
                    <TableRow key={h.id} hover>
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
                    <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      No policy violations recorded for this session.
                    </TableCell>
                  </TableRow>
                ) : (
                  violations.map((v) => (
                    <TableRow key={v.id} hover>
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
