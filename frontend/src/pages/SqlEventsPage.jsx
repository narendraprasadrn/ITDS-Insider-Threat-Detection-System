// frontend/src/pages/SqlEventsPage.jsx
import React, { useState, useEffect, useMemo } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
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
  Grid
} from '@mui/material';
import BootstrapIcon from '../components/common/BootstrapIcon.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function SqlEventsPage() {
  const { accessToken } = useAuth();

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [operationFilter, setOperationFilter] = useState('');
  const [outcomeFilter, setOutcomeFilter] = useState('');
  const [sessionFilter, setSessionFilter] = useState('');

  // Detail Modal
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [copiedRaw, setCopiedRaw] = useState(false);

  const fetchEvents = async () => {
    try {
      setError(null);
      let queryParams = new URLSearchParams();
      if (operationFilter) queryParams.append('operation', operationFilter);
      if (sessionFilter) queryParams.append('session_id', sessionFilter);
      queryParams.append('limit', '200');

      const res = await fetch(`/api/sql-events?${queryParams.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      if (data.success) {
        setEvents(data.data.events || []);
      } else {
        setError(data.error?.message || 'Failed to fetch database activity events');
      }
    } catch (err) {
      setError(err.message || 'Error communicating with telemetry backend');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [operationFilter, sessionFilter]);

  // Live polling (every 3 seconds)
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchEvents();
    }, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, operationFilter, sessionFilter]);

  const handleCopyRaw = (sql) => {
    navigator.clipboard.writeText(sql);
    setCopiedRaw(true);
    setTimeout(() => setCopiedRaw(false), 2000);
  };

  // Determine policy outcome categorization
  const getEventOutcome = (evt) => {
    if (evt.status === 'blocked' || evt.policy_decision?.outcome === 'DENY' || evt.policy_decision?.deny) {
      return {
        key: 'BLOCKED',
        label: 'BLOCKED PRE-EXECUTION',
        color: 'error',
        icon: 'bi-shield-x',
        bg: 'rgba(239, 68, 68, 0.14)',
        border: '#EF4444',
        text: '#F87171'
      };
    }
    if (
      evt.policy_decision?.outcome === 'POST-EXECUTION DETECTED' ||
      evt.policy_decision?.outcome === 'REVIEW' ||
      (evt.flags?.is_unbounded_read && evt.status === 'attributed')
    ) {
      return {
        key: 'REVIEW',
        label: 'POST-HOC DETECTED',
        color: 'warning',
        icon: 'bi-exclamation-triangle-fill',
        bg: 'rgba(245, 158, 11, 0.14)',
        border: '#F59E0B',
        text: '#FCD34D'
      };
    }
    if (evt.status === 'parse_error') {
      return {
        key: 'PARSE_ERROR',
        label: 'PARSE ERROR',
        color: 'default',
        icon: 'bi-bug-fill',
        bg: 'rgba(160, 174, 192, 0.1)',
        border: '#718096',
        text: '#CBD5E0'
      };
    }
    if (evt.status === 'unattributed' || !evt.session_id) {
      return {
        key: 'SYSTEM',
        label: 'INTERNAL / DAEMON',
        color: 'info',
        icon: 'bi-cpu-fill',
        bg: 'rgba(56, 178, 172, 0.1)',
        border: '#319795',
        text: '#4FD1C5'
      };
    }
    return {
      key: 'ALLOWED',
      label: 'ALLOWED / EXECUTED',
      color: 'success',
      icon: 'bi-check2-circle',
      bg: 'rgba(85, 230, 193, 0.12)',
      border: '#55E6C1',
      text: '#55E6C1'
    };
  };

  const getOperationColor = (op) => {
    switch (op) {
      case 'SELECT':
        return '#38BDF8';
      case 'INSERT':
        return '#34D399';
      case 'UPDATE':
        return '#FBBF24';
      case 'DELETE':
        return '#F87171';
      case 'DDL':
        return '#EF4444';
      case 'USE':
        return '#A78BFA';
      default:
        return '#94A3B8';
    }
  };

  // Filter events by search query and outcome
  const filteredEvents = useMemo(() => {
    return events.filter((e) => {
      // 1. Outcome filter
      if (outcomeFilter) {
        const oc = getEventOutcome(e);
        if (oc.key !== outcomeFilter) return false;
      }
      // 2. Text search
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchesSql = (e.raw_sql || '').toLowerCase().includes(q);
        const matchesUser = (e.username || '').toLowerCase().includes(q) || (e.full_name || '').toLowerCase().includes(q);
        const matchesMySqlUser = (e.mysql_username || '').toLowerCase().includes(q);
        const matchesTable = Array.isArray(e.tables) && e.tables.some((t) => t.toLowerCase().includes(q));
        const matchesSession = String(e.session_id || '').includes(q);
        if (!matchesSql && !matchesUser && !matchesMySqlUser && !matchesTable && !matchesSession) {
          return false;
        }
      }
      return true;
    });
  }, [events, outcomeFilter, searchQuery]);

  // Real Metrics computed from actual database events
  const totalEvents = events.length;
  const blockedPreExecution = events.filter(
    (e) => e.status === 'blocked' || e.policy_decision?.outcome === 'DENY' || e.policy_decision?.deny
  ).length;
  const postHocDetections = events.filter(
    (e) => e.policy_decision?.outcome === 'POST-EXECUTION DETECTED' || (e.status === 'attributed' && e.policy_decision?.violations?.length > 0)
  ).length;
  const jitAttributed = events.filter((e) => e.session_id !== null).length;
  const sensitiveTableAccess = events.filter(
    (e) =>
      Array.isArray(e.tables) &&
      e.tables.some((t) =>
        ['payroll', 'taxrecords', 'securityauditlogs', 'audit_logs', 'mysql.user'].some((s) =>
          t.toLowerCase().includes(s)
        )
      )
  ).length;

  // Timeline events: recent chronological events (latest 10)
  const timelineEvents = useMemo(() => {
    return [...events].slice(0, 8);
  }, [events]);

  return (
    <Box>
      {/* Page Header */}
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#F5F7F7', display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <BootstrapIcon name="bi-journal-text" size={26} color="#55E6C1" /> Database Activity Intelligence
          </Typography>
          <Typography variant="body2" sx={{ color: '#AAB8BC', mt: 0.5, maxWidth: 850 }}>
            Database security and insider-threat research telemetry. Ingests raw SQL execution from <code>mysql.general_log</code> with AST attribution, pre-execution OPA blocking, and behavioral anomaly detection.
          </Typography>
        </Box>
        <Stack direction="row" spacing={2} alignItems="center">
          <FormControlLabel
            control={
              <Switch
                checked={autoRefresh}
                onChange={(e) => setAutoRefresh(e.target.checked)}
                color="primary"
                size="small"
              />
            }
            label={<Typography variant="body2" sx={{ color: '#AAB8BC' }}>Live Polling (3s)</Typography>}
          />
          <Button
            variant="outlined"
            startIcon={<BootstrapIcon name="bi-arrow-clockwise" size={15} />}
            onClick={() => {
              setLoading(true);
              fetchEvents();
            }}
            size="small"
            sx={{ borderColor: '#364345', color: '#F5F7F7', '&:hover': { borderColor: '#55E6C1' } }}
          >
            Refresh
          </Button>
        </Stack>
      </Box>

      {/* Metrics Row (Derived from genuine backend records) */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={2.4}>
          <Card sx={{ bgcolor: '#252E30', border: '1px solid #364345', borderRadius: 1.5 }}>
            <CardContent sx={{ py: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" sx={{ color: '#AAB8BC', textTransform: 'uppercase', fontWeight: 600 }}>
                  Captured Events
                </Typography>
                <BootstrapIcon name="bi-database" size={16} color="#55E6C1" />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#55E6C1', mt: 0.5 }}>
                {totalEvents}
              </Typography>
              <Typography variant="caption" sx={{ color: '#AAB8BC' }}>
                Persistent database records
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={2.4}>
          <Card sx={{ bgcolor: '#252E30', border: '1px solid #364345', borderRadius: 1.5 }}>
            <CardContent sx={{ py: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" sx={{ color: '#AAB8BC', textTransform: 'uppercase', fontWeight: 600 }}>
                  Pre-Exec Blocked
                </Typography>
                <BootstrapIcon name="bi-shield-x" size={16} color="#EF4444" />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: blockedPreExecution > 0 ? '#EF4444' : '#AAB8BC', mt: 0.5 }}>
                {blockedPreExecution}
              </Typography>
              <Typography variant="caption" sx={{ color: '#AAB8BC' }}>
                Pre-empted before MySQL
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={2.4}>
          <Card sx={{ bgcolor: '#252E30', border: '1px solid #364345', borderRadius: 1.5 }}>
            <CardContent sx={{ py: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" sx={{ color: '#AAB8BC', textTransform: 'uppercase', fontWeight: 600 }}>
                  Post-Hoc Detections
                </Typography>
                <BootstrapIcon name="bi-exclamation-triangle-fill" size={16} color="#F59E0B" />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: postHocDetections > 0 ? '#F59E0B' : '#AAB8BC', mt: 0.5 }}>
                {postHocDetections}
              </Typography>
              <Typography variant="caption" sx={{ color: '#AAB8BC' }}>
                Behavioral policy flags
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={2.4}>
          <Card sx={{ bgcolor: '#252E30', border: '1px solid #364345', borderRadius: 1.5 }}>
            <CardContent sx={{ py: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" sx={{ color: '#AAB8BC', textTransform: 'uppercase', fontWeight: 600 }}>
                  JIT Attributed
                </Typography>
                <BootstrapIcon name="bi-key-fill" size={16} color="#10B981" />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#10B981', mt: 0.5 }}>
                {jitAttributed}
              </Typography>
              <Typography variant="caption" sx={{ color: '#AAB8BC' }}>
                Ephemeral credential scope
              </Typography>
            </CardContent>
          </Card>
        </Grid>

        <Grid item xs={12} sm={6} md={2.4}>
          <Card sx={{ bgcolor: '#252E30', border: '1px solid #364345', borderRadius: 1.5 }}>
            <CardContent sx={{ py: 2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="caption" sx={{ color: '#AAB8BC', textTransform: 'uppercase', fontWeight: 600 }}>
                  Sensitive Targets
                </Typography>
                <BootstrapIcon name="bi-lock-fill" size={16} color="#EC4899" />
              </Box>
              <Typography variant="h5" sx={{ fontWeight: 700, color: sensitiveTableAccess > 0 ? '#EC4899' : '#AAB8BC', mt: 0.5 }}>
                {sensitiveTableAccess}
              </Typography>
              <Typography variant="caption" sx={{ color: '#AAB8BC' }}>
                Payroll, tax & audit access
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Compact SQL Activity Timeline */}
      <Card sx={{ bgcolor: '#252E30', border: '1px solid #364345', borderRadius: 1.5, mb: 3, p: 2 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <BootstrapIcon name="bi-clock-history" size={16} color="#55E6C1" />
            <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#F5F7F7', textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              Chronological Activity Timeline
            </Typography>
          </Box>
          <Typography variant="caption" sx={{ color: '#AAB8BC' }}>
            {timelineEvents.length > 0 ? `Showing latest ${timelineEvents.length} timestamped events` : 'No events'}
          </Typography>
        </Box>

        {timelineEvents.length === 0 ? (
          <Box sx={{ py: 2.5, textAlign: 'center', bgcolor: '#1D2426', borderRadius: 1 }}>
            <Typography variant="caption" sx={{ color: '#AAB8BC' }}>
              No chronological SQL events captured yet. Executed queries will appear along this timeline in real time.
            </Typography>
          </Box>
        ) : (
          <Box
            sx={{
              display: 'flex',
              gap: 1.5,
              overflowX: 'auto',
              pb: 1,
              pt: 0.5,
              '&::-webkit-scrollbar': { height: 6 },
              '&::-webkit-scrollbar-thumb': { bgcolor: '#364345', borderRadius: 3 }
            }}
          >
            {timelineEvents.map((evt) => {
              const oc = getEventOutcome(evt);
              const timeStr = new Date(evt.event_time).toLocaleTimeString([], {
                hour: '2-digit',
                minute: '2-digit',
                second: '2-digit'
              });

              return (
                <Paper
                  key={evt.id}
                  onClick={() => setSelectedEvent(evt)}
                  sx={{
                    minWidth: 230,
                    maxWidth: 270,
                    p: 1.25,
                    bgcolor: '#1E2527',
                    border: `1px solid ${oc.border}55`,
                    borderRadius: 1.5,
                    cursor: 'pointer',
                    transition: 'all 0.15s ease-in-out',
                    flexShrink: 0,
                    '&:hover': {
                      borderColor: oc.border,
                      bgcolor: '#252F32',
                      transform: 'translateY(-2px)'
                    }
                  }}
                >
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.75 }}>
                    <Typography variant="caption" sx={{ color: '#AAB8BC', fontSize: '0.72rem', fontWeight: 600 }}>
                      {timeStr}
                    </Typography>
                    <Chip
                      size="small"
                      icon={<BootstrapIcon name={oc.icon} size={10} color={oc.text} />}
                      label={oc.key === 'BLOCKED' ? 'BLOCKED' : oc.key === 'REVIEW' ? 'REVIEW' : 'ALLOWED'}
                      sx={{
                        height: 18,
                        fontSize: '0.62rem',
                        fontWeight: 700,
                        bgcolor: oc.bg,
                        color: oc.text,
                        borderColor: oc.border,
                        border: '1px solid'
                      }}
                    />
                  </Box>

                  <Typography
                    variant="body2"
                    sx={{
                      fontFamily: 'monospace',
                      fontSize: '0.75rem',
                      color: '#F5F7F7',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                      mb: 0.75
                    }}
                    title={evt.raw_sql}
                  >
                    {evt.raw_sql}
                  </Typography>

                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                      <BootstrapIcon name={evt.session_id ? 'bi-key-fill' : 'bi-shield-shaded'} size={11} color="#AAB8BC" />
                      <Typography variant="caption" sx={{ fontSize: '0.7rem', color: '#AAB8BC' }}>
                        {evt.username || evt.mysql_username || 'Internal'}
                      </Typography>
                    </Box>
                    <Typography variant="caption" sx={{ fontSize: '0.68rem', color: getOperationColor(evt.operation), fontWeight: 700 }}>
                      {evt.operation}
                    </Typography>
                  </Box>
                </Paper>
              );
            })}
          </Box>
        )}
      </Card>

      {/* Filter & Search Toolbar */}
      <Paper sx={{ p: 2, mb: 3, bgcolor: '#252E30', border: '1px solid #364345', borderRadius: 1.5 }}>
        <Grid container spacing={2} alignItems="center">
          {/* Free Text Search */}
          <Grid item xs={12} sm={4} md={3.5}>
            <TextField
              size="small"
              fullWidth
              placeholder="Search SQL, table, or user..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              InputProps={{
                startAdornment: <BootstrapIcon name="bi-search" size={14} color="#AAB8BC" style={{ marginRight: 8 }} />
              }}
              sx={{
                '& .MuiOutlinedInput-root': { bgcolor: '#1D2426' },
                '& .MuiInputBase-input': { fontSize: '0.85rem' }
              }}
            />
          </Grid>

          {/* Operation Filter */}
          <Grid item xs={6} sm={4} md={2.5}>
            <FormControl fullWidth size="small">
              <InputLabel id="op-filter-label" sx={{ color: '#AAB8BC' }}>Operation</InputLabel>
              <Select
                labelId="op-filter-label"
                value={operationFilter}
                label="Operation"
                onChange={(e) => setOperationFilter(e.target.value)}
                sx={{ bgcolor: '#1D2426' }}
              >
                <MenuItem value="">All Operations</MenuItem>
                <MenuItem value="SELECT">SELECT</MenuItem>
                <MenuItem value="INSERT">INSERT</MenuItem>
                <MenuItem value="UPDATE">UPDATE</MenuItem>
                <MenuItem value="DELETE">DELETE</MenuItem>
                <MenuItem value="DDL">DDL (ALTER/CREATE/DROP)</MenuItem>
                <MenuItem value="USE">USE</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {/* Policy Outcome Filter */}
          <Grid item xs={6} sm={4} md={2.5}>
            <FormControl fullWidth size="small">
              <InputLabel id="outcome-filter-label" sx={{ color: '#AAB8BC' }}>Policy Outcome</InputLabel>
              <Select
                labelId="outcome-filter-label"
                value={outcomeFilter}
                label="Policy Outcome"
                onChange={(e) => setOutcomeFilter(e.target.value)}
                sx={{ bgcolor: '#1D2426' }}
              >
                <MenuItem value="">All Outcomes</MenuItem>
                <MenuItem value="BLOCKED">Blocked Pre-Execution</MenuItem>
                <MenuItem value="ALLOWED">Allowed / Executed</MenuItem>
                <MenuItem value="REVIEW">Post-Hoc Review</MenuItem>
                <MenuItem value="SYSTEM">Internal / Daemon</MenuItem>
                <MenuItem value="PARSE_ERROR">Parse Error</MenuItem>
              </Select>
            </FormControl>
          </Grid>

          {/* Session Filter */}
          <Grid item xs={6} sm={4} md={2}>
            <TextField
              size="small"
              fullWidth
              label="Session ID"
              placeholder="e.g. 1"
              value={sessionFilter}
              onChange={(e) => setSessionFilter(e.target.value)}
              sx={{
                '& .MuiOutlinedInput-root': { bgcolor: '#1D2426' },
                '& .MuiInputLabel-root': { color: '#AAB8BC' }
              }}
            />
          </Grid>

          {/* Clear Filters */}
          <Grid item xs={6} sm={4} md={1.5} sx={{ textAlign: 'right' }}>
            <Button
              variant="text"
              color="inherit"
              size="small"
              onClick={() => {
                setSearchQuery('');
                setOperationFilter('');
                setOutcomeFilter('');
                setSessionFilter('');
              }}
              sx={{ color: '#AAB8BC', fontSize: '0.78rem', textTransform: 'none' }}
            >
              Clear Filters
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>
          {error}
        </Alert>
      )}

      {/* Events Table */}
      <Card sx={{ bgcolor: '#252E30', border: '1px solid #364345', borderRadius: 1.5 }}>
        <TableContainer component={Paper} elevation={0} sx={{ bgcolor: 'transparent' }}>
          <Table size="small">
            <TableHead>
              <TableRow sx={{ '& th': { bgcolor: '#1F292B', fontWeight: 700, fontSize: '0.78rem', color: '#AAB8BC', borderBottom: '1px solid #364345', py: 1.25 } }}>
                <TableCell width="12%">Timestamp</TableCell>
                <TableCell width="18%">Subject / Attribution</TableCell>
                <TableCell width="10%">Session</TableCell>
                <TableCell width="8%">Op</TableCell>
                <TableCell width="24%">Query Preview</TableCell>
                <TableCell width="12%">Target Tables</TableCell>
                <TableCell width="14%">Policy Outcome</TableCell>
                <TableCell width="2%" align="center">Inspect</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && events.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                    <CircularProgress size={30} sx={{ color: '#55E6C1' }} />
                    <Typography variant="body2" sx={{ color: '#AAB8BC', mt: 1.5 }}>
                      Connecting to database telemetry feed...
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : filteredEvents.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 6 }}>
                    <BootstrapIcon name="bi-journal-x" size={34} color="#AAB8BC" style={{ opacity: 0.35, display: 'block', margin: '0 auto 8px' }} />
                    <Typography variant="body2" sx={{ fontWeight: 600, color: '#F5F7F7' }}>
                      No Database Activity Events Recorded
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#AAB8BC' }}>
                      {events.length === 0
                        ? 'Queries executed through JIT sessions or intercepted by OPA will appear here automatically.'
                        : 'No events match the selected filter criteria.'}
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                filteredEvents.map((evt) => {
                  const oc = getEventOutcome(evt);
                  const dateStr = new Date(evt.event_time).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                    second: '2-digit'
                  });

                  return (
                    <TableRow
                      key={evt.id}
                      hover
                      sx={{
                        '&:hover': { bgcolor: 'rgba(255,255,255,0.03)' },
                        '& td': { borderBottom: '1px solid #364345', py: 1.2 }
                      }}
                    >
                      {/* 1. Timestamp */}
                      <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.78rem', color: '#AAB8BC' }}>
                        {dateStr}
                      </TableCell>

                      {/* 2. Attribution */}
                      <TableCell>
                        {evt.username ? (
                          <Box sx={{ display: 'flex', flexDirection: 'column' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                              <BootstrapIcon name="bi-person-circle" size={13} color="#55E6C1" />
                              <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.82rem', color: '#F5F7F7' }}>
                                {evt.username}
                              </Typography>
                            </Box>
                            <Typography variant="caption" sx={{ color: '#AAB8BC', fontSize: '0.7rem' }}>
                              {evt.profile_name || evt.mysql_username}
                            </Typography>
                          </Box>
                        ) : (
                          <Chip
                            label={evt.mysql_username || 'internal_daemon'}
                            size="small"
                            sx={{ fontSize: '0.68rem', height: 20, bgcolor: 'rgba(255,255,255,0.05)', color: '#AAB8BC' }}
                          />
                        )}
                      </TableCell>

                      {/* 3. Session */}
                      <TableCell>
                        {evt.session_id ? (
                          <Chip
                            label={`Session #${evt.session_id}`}
                            size="small"
                            sx={{
                              fontSize: '0.68rem',
                              height: 20,
                              bgcolor: 'rgba(85,230,193,0.1)',
                              color: '#55E6C1',
                              borderColor: '#55E6C1',
                              border: '1px solid'
                            }}
                          />
                        ) : (
                          <Typography variant="caption" sx={{ color: '#AAB8BC', fontSize: '0.72rem' }}>
                            Admin Console
                          </Typography>
                        )}
                      </TableCell>

                      {/* 4. Operation */}
                      <TableCell>
                        <Chip
                          label={evt.operation}
                          size="small"
                          sx={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            height: 20,
                            bgcolor: `${getOperationColor(evt.operation)}22`,
                            color: getOperationColor(evt.operation),
                            borderColor: getOperationColor(evt.operation),
                            border: '1px solid'
                          }}
                        />
                      </TableCell>

                      {/* 5. Query Preview */}
                      <TableCell sx={{ maxWidth: 280 }}>
                        <Typography
                          variant="body2"
                          sx={{
                            fontFamily: 'monospace',
                            fontSize: '0.78rem',
                            overflow: 'hidden',
                            textOverflow: 'ellipsis',
                            whiteSpace: 'nowrap',
                            color: '#E2E8F0'
                          }}
                          title={evt.raw_sql}
                        >
                          {evt.raw_sql}
                        </Typography>
                      </TableCell>

                      {/* 6. Target Tables */}
                      <TableCell>
                        <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                          {Array.isArray(evt.tables) && evt.tables.length > 0 ? (
                            evt.tables.map((t, idx) => {
                              const isSensitive = ['payroll', 'taxrecords', 'securityauditlogs', 'audit_logs', 'mysql.user'].some(s =>
                                t.toLowerCase().includes(s)
                              );
                              return (
                                <Chip
                                  key={idx}
                                  label={t}
                                  size="small"
                                  sx={{
                                    fontSize: '0.65rem',
                                    height: 18,
                                    bgcolor: isSensitive ? 'rgba(236,72,153,0.15)' : 'rgba(255,255,255,0.06)',
                                    color: isSensitive ? '#F472B6' : '#AAB8BC',
                                    borderColor: isSensitive ? '#EC4899' : '#364345',
                                    border: '1px solid'
                                  }}
                                />
                              );
                            })
                          ) : (
                            <Typography variant="caption" sx={{ color: '#718096' }}>-</Typography>
                          )}
                        </Stack>
                      </TableCell>

                      {/* 7. Policy Outcome */}
                      <TableCell>
                        <Chip
                          icon={<BootstrapIcon name={oc.icon} size={11} color={oc.text} />}
                          label={oc.label}
                          size="small"
                          sx={{
                            fontSize: '0.68rem',
                            fontWeight: 700,
                            height: 22,
                            bgcolor: oc.bg,
                            color: oc.text,
                            borderColor: oc.border,
                            border: '1px solid'
                          }}
                        />
                      </TableCell>

                      {/* 8. Inspect Action */}
                      <TableCell align="center">
                        <IconButton
                          size="small"
                          onClick={() => setSelectedEvent(evt)}
                          sx={{ color: '#55E6C1', '&:hover': { bgcolor: 'rgba(85,230,193,0.12)' } }}
                          aria-label="Inspect SQL Event Telemetry"
                        >
                          <BootstrapIcon name="bi-search" size={13} />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>

      {/* SQL & Telemetry Inspection Modal */}
      <Dialog
        open={Boolean(selectedEvent)}
        onClose={() => setSelectedEvent(null)}
        maxWidth="md"
        fullWidth
        PaperProps={{
          sx: { bgcolor: '#1E2527', border: '1px solid #364345', borderRadius: 2 }
        }}
      >
        {selectedEvent && (() => {
          const oc = getEventOutcome(selectedEvent);
          const policyDecision = selectedEvent.policy_decision || {};
          const isBlocked = oc.key === 'BLOCKED';

          return (
            <>
              <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', pb: 1, borderBottom: '1px solid #364345' }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.25 }}>
                  <BootstrapIcon name="bi-shield-check" size={20} color="#55E6C1" />
                  <Typography variant="h6" sx={{ fontWeight: 700, color: '#F5F7F7', fontSize: '1.05rem' }}>
                    SQL Event #{selectedEvent.id} Intelligence & Policy Enforcement
                  </Typography>
                </Box>
                <Chip
                  icon={<BootstrapIcon name={oc.icon} size={12} color={oc.text} />}
                  label={oc.label}
                  size="small"
                  sx={{
                    fontWeight: 700,
                    bgcolor: oc.bg,
                    color: oc.text,
                    borderColor: oc.border,
                    border: '1px solid'
                  }}
                />
              </DialogTitle>

              <DialogContent sx={{ py: 2.5 }}>
                <Stack spacing={2.5}>
                  {/* Policy Decision Banner */}
                  <Paper
                    sx={{
                      p: 2,
                      bgcolor: isBlocked ? 'rgba(239, 68, 68, 0.1)' : 'rgba(85, 230, 193, 0.08)',
                      border: `1px solid ${isBlocked ? '#EF4444' : '#55E6C1'}`,
                      borderRadius: 1.5
                    }}
                  >
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5 }}>
                      <BootstrapIcon
                        name={isBlocked ? 'bi-shield-slash-fill' : 'bi-shield-check'}
                        size={18}
                        color={isBlocked ? '#EF4444' : '#55E6C1'}
                      />
                      <Typography variant="subtitle2" sx={{ fontWeight: 700, color: isBlocked ? '#F87171' : '#55E6C1' }}>
                        {isBlocked
                          ? 'Server-Side Policy Enforcement: Pre-Execution Block Triggered'
                          : 'Query Authorized & Compliant Under Active Policy'}
                      </Typography>
                    </Box>

                    {isBlocked ? (
                      <Typography variant="body2" sx={{ color: '#FCA5A5', fontSize: '0.85rem' }}>
                        This query was evaluated by the ITDS server-side authorization engine and OPA before reaching MySQL. Execution was denied; 0 rows were altered or read.
                      </Typography>
                    ) : (
                      <Typography variant="body2" sx={{ color: '#AAB8BC', fontSize: '0.85rem' }}>
                        The statement was authenticated against valid role credentials, profile resource grants, and row-limit policies.
                      </Typography>
                    )}

                    {/* Specific Violation Reasons */}
                    {Array.isArray(policyDecision.reasons) && policyDecision.reasons.length > 0 && (
                      <Box sx={{ mt: 1.5, pt: 1, borderTop: '1px solid rgba(255,255,255,0.08)' }}>
                        <Typography variant="caption" sx={{ fontWeight: 700, color: '#F5F7F7', textTransform: 'uppercase' }}>
                          Policy Violation Details:
                        </Typography>
                        <Stack spacing={0.5} sx={{ mt: 0.5 }}>
                          {policyDecision.reasons.map((r, i) => (
                            <Typography key={i} variant="caption" sx={{ color: isBlocked ? '#F87171' : '#FCD34D', display: 'flex', alignItems: 'center', gap: 0.75 }}>
                              <BootstrapIcon name="bi-arrow-right-short" size={12} /> {r}
                            </Typography>
                          ))}
                        </Stack>
                      </Box>
                    )}
                  </Paper>

                  {/* Context & Attribution Grid */}
                  <Box sx={{ p: 2, bgcolor: '#171B1C', border: '1px solid #364345', borderRadius: 1.5 }}>
                    <Typography variant="caption" sx={{ color: '#55E6C1', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', display: 'block', mb: 1.5 }}>
                      Attribution & JIT Execution Context
                    </Typography>
                    <Grid container spacing={2}>
                      <Grid item xs={6} sm={3}>
                        <Typography variant="caption" sx={{ color: '#AAB8BC' }}>Authenticated User</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#F5F7F7' }}>
                          {selectedEvent.username ? `${selectedEvent.full_name} (${selectedEvent.username})` : 'Internal / Root'}
                        </Typography>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Typography variant="caption" sx={{ color: '#AAB8BC' }}>JIT Session</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#F5F7F7' }}>
                          {selectedEvent.session_id ? `Session #${selectedEvent.session_id}` : 'Admin Workspace'}
                        </Typography>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Typography variant="caption" sx={{ color: '#AAB8BC' }}>Access Profile</Typography>
                        <Typography variant="body2" sx={{ fontWeight: 600, color: '#F5F7F7' }}>
                          {selectedEvent.profile_name || 'Administrative Console'}
                        </Typography>
                      </Grid>
                      <Grid item xs={6} sm={3}>
                        <Typography variant="caption" sx={{ color: '#AAB8BC' }}>Ephemeral MySQL User</Typography>
                        <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600, color: '#55E6C1' }}>
                          {selectedEvent.mysql_username}
                        </Typography>
                      </Grid>
                    </Grid>
                  </Box>

                  {/* Raw SQL Statement */}
                  <Box>
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.75 }}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#F5F7F7' }}>
                        Intercepted SQL Statement
                      </Typography>
                      <Button
                        size="small"
                        startIcon={copiedRaw ? <BootstrapIcon name="bi-check-circle-fill" size={13} color="#10B981" /> : <BootstrapIcon name="bi-clipboard" size={13} />}
                        onClick={() => handleCopyRaw(selectedEvent.raw_sql)}
                        sx={{ textTransform: 'none', fontSize: '0.75rem', color: '#AAB8BC', '&:hover': { color: '#55E6C1' } }}
                      >
                        {copiedRaw ? 'Copied' : 'Copy Query'}
                      </Button>
                    </Box>
                    <Paper
                      sx={{
                        p: 2,
                        bgcolor: '#141819',
                        border: '1px solid #364345',
                        borderRadius: 1.5,
                        fontFamily: 'monospace',
                        fontSize: '0.85rem',
                        color: isBlocked ? '#F87171' : '#55E6C1',
                        whiteSpace: 'pre-wrap',
                        wordBreak: 'break-all'
                      }}
                    >
                      {selectedEvent.raw_sql}
                    </Paper>
                  </Box>

                  {/* AST Analysis & Flags */}
                  <Grid container spacing={2}>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#F5F7F7', mb: 0.75 }}>
                        Referenced Tables
                      </Typography>
                      <Paper sx={{ p: 1.5, bgcolor: '#171B1C', border: '1px solid #364345', borderRadius: 1.5, minHeight: 70 }}>
                        {Array.isArray(selectedEvent.tables) && selectedEvent.tables.length > 0 ? (
                          <Stack direction="row" spacing={0.75} flexWrap="wrap" gap={0.5}>
                            {selectedEvent.tables.map((t, idx) => (
                              <Chip
                                key={idx}
                                label={t}
                                size="small"
                                sx={{
                                  bgcolor: 'rgba(85,230,193,0.1)',
                                  color: '#55E6C1',
                                  borderColor: '#55E6C1',
                                  border: '1px solid',
                                  fontSize: '0.72rem'
                                }}
                              />
                            ))}
                          </Stack>
                        ) : (
                          <Typography variant="caption" sx={{ color: '#AAB8BC' }}>No explicit tables parsed</Typography>
                        )}
                      </Paper>
                    </Grid>

                    <Grid item xs={12} sm={6}>
                      <Typography variant="subtitle2" sx={{ fontWeight: 600, color: '#F5F7F7', mb: 0.75 }}>
                        AST Behavioral Indicators
                      </Typography>
                      <Paper sx={{ p: 1.5, bgcolor: '#171B1C', border: '1px solid #364345', borderRadius: 1.5, minHeight: 70 }}>
                        <Stack direction="row" spacing={0.75} flexWrap="wrap" gap={0.5}>
                          {selectedEvent.flags && Object.entries(selectedEvent.flags).map(([key, val]) => (
                            <Chip
                              key={key}
                              label={`${key}: ${String(val)}`}
                              size="small"
                              sx={{
                                fontSize: '0.68rem',
                                bgcolor: val === true ? 'rgba(245, 158, 11, 0.12)' : 'rgba(255,255,255,0.04)',
                                color: val === true ? '#FCD34D' : '#AAB8BC',
                                borderColor: val === true ? '#F59E0B' : '#364345',
                                border: '1px solid'
                              }}
                            />
                          ))}
                        </Stack>
                      </Paper>
                    </Grid>
                  </Grid>
                </Stack>
              </DialogContent>

              <DialogActions sx={{ p: 2, borderTop: '1px solid #364345' }}>
                <Button
                  onClick={() => setSelectedEvent(null)}
                  variant="outlined"
                  size="small"
                  sx={{ borderColor: '#364345', color: '#F5F7F7', textTransform: 'none' }}
                >
                  Close
                </Button>
              </DialogActions>
            </>
          );
        })()}
      </Dialog>
    </Box>
  );
}
