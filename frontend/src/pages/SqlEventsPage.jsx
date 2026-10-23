// frontend/src/pages/SqlEventsPage.jsx
import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
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
  Grid
} from '@mui/material';
import BootstrapIcon from '../components/common/BootstrapIcon.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function SqlEventsPage() {
  const { accessToken, hasRole } = useAuth();
  const isSecurityOrAdmin = hasRole('admin') || hasRole('dba');

  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Filters
  const [operationFilter, setOperationFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [sessionFilter, setSessionFilter] = useState('');

  // Detail Modal
  const [selectedEvent, setSelectedEvent] = useState(null);
  const [copiedRaw, setCopiedRaw] = useState(false);

  const fetchEvents = async () => {
    try {
      setError(null);
      let queryParams = new URLSearchParams();
      if (operationFilter) queryParams.append('operation', operationFilter);
      if (statusFilter) queryParams.append('status', statusFilter);
      if (sessionFilter) queryParams.append('session_id', sessionFilter);
      queryParams.append('limit', '100');

      const res = await fetch(`/api/sql-events?${queryParams.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      if (data.success) {
        setEvents(data.data.events || []);
      } else {
        setError(data.error?.message || 'Failed to fetch SQL events');
      }
    } catch (err) {
      setError(err.message || 'Error communicating with server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [operationFilter, statusFilter, sessionFilter]);

  // Polling interval
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchEvents();
    }, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, operationFilter, statusFilter, sessionFilter]);

  const handleCopyRaw = (sql) => {
    navigator.clipboard.writeText(sql);
    setCopiedRaw(true);
    setTimeout(() => setCopiedRaw(false), 2000);
  };

  const getOperationColor = (op) => {
    switch (op) {
      case 'SELECT':
        return 'info';
      case 'INSERT':
        return 'success';
      case 'UPDATE':
        return 'warning';
      case 'DELETE':
      case 'DDL':
        return 'error';
      default:
        return 'default';
    }
  };

  // Metrics
  const totalEvents = events.length;
  const jitAttributed = events.filter((e) => e.session_id !== null).length;
  const ddlCount = events.filter((e) => e.operation === 'DDL' || e.flags?.is_ddl).length;
  const unboundedCount = events.filter((e) => e.flags?.is_unbounded_read).length;

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#F5F7F7', display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <BootstrapIcon name="bi-journal-text" size={24} color="#55E6C1" /> SQL Activity Ingestion
          </Typography>
          <Typography variant="body2" sx={{ color: '#AAB8BC', mt: 0.5 }}>
            Real-time server-side query ingestion from <code>mysql.general_log</code> with AST attribution and flag analysis.
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
          >
            Refresh
          </Button>
        </Stack>
      </Box>

      {/* Metrics Row */}
      <Grid container spacing={2} sx={{ mb: 3 }}>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: '#252E30', border: '1px solid #364345' }}>
            <CardContent sx={{ py: 2 }}>
              <Typography variant="caption" sx={{ color: '#AAB8BC', textTransform: 'uppercase', fontWeight: 600 }}>
                Captured Events
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#55E6C1', mt: 0.5 }}>
                {totalEvents}
              </Typography>
              <Typography variant="caption" sx={{ color: '#AAB8BC' }}>
                Within query limit window
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: '#252E30', border: '1px solid #364345' }}>
            <CardContent sx={{ py: 2 }}>
              <Typography variant="caption" sx={{ color: '#AAB8BC', textTransform: 'uppercase', fontWeight: 600 }}>
                JIT Session Attributed
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#10B981', mt: 0.5 }}>
                {jitAttributed}
              </Typography>
              <Typography variant="caption" sx={{ color: '#AAB8BC' }}>
                Mapped to ephemeral session user
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: '#252E30', border: '1px solid #364345' }}>
            <CardContent sx={{ py: 2 }}>
              <Typography variant="caption" sx={{ color: '#AAB8BC', textTransform: 'uppercase', fontWeight: 600 }}>
                DDL / Schema Changes
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, color: ddlCount > 0 ? '#EF4444' : '#AAB8BC', mt: 0.5 }}>
                {ddlCount}
              </Typography>
              <Typography variant="caption" sx={{ color: '#AAB8BC' }}>
                Structural database operations
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: '#252E30', border: '1px solid #364345' }}>
            <CardContent sx={{ py: 2 }}>
              <Typography variant="caption" sx={{ color: '#AAB8BC', textTransform: 'uppercase', fontWeight: 600 }}>
                Unbounded Reads
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, color: unboundedCount > 0 ? '#ffb74d' : 'text.secondary', mt: 0.5 }}>
                {unboundedCount}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                SELECT without WHERE or LIMIT
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filter Controls */}
      <Paper sx={{ p: 2, mb: 3, bgcolor: '#252E30', border: '1px solid #364345' }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={4} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel id="op-filter-label">Operation</InputLabel>
              <Select
                labelId="op-filter-label"
                value={operationFilter}
                label="Operation"
                onChange={(e) => setOperationFilter(e.target.value)}
              >
                <MenuItem value="">All Operations</MenuItem>
                <MenuItem value="SELECT">SELECT</MenuItem>
                <MenuItem value="INSERT">INSERT</MenuItem>
                <MenuItem value="UPDATE">UPDATE</MenuItem>
                <MenuItem value="DELETE">DELETE</MenuItem>
                <MenuItem value="DDL">DDL (ALTER/CREATE/DROP)</MenuItem>
                <MenuItem value="USE">USE</MenuItem>
                <MenuItem value="OTHER">OTHER</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={4} md={3}>
            <FormControl fullWidth size="small">
              <InputLabel id="status-filter-label">Status</InputLabel>
              <Select
                labelId="status-filter-label"
                value={statusFilter}
                label="Status"
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                <MenuItem value="">All Statuses</MenuItem>
                <MenuItem value="executed">Executed</MenuItem>
                <MenuItem value="failed">Failed / Blocked</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={4} md={3}>
            <TextField
              size="small"
              fullWidth
              label="Session ID"
              placeholder="e.g. 7"
              value={sessionFilter}
              onChange={(e) => setSessionFilter(e.target.value)}
            />
          </Grid>
          <Grid item xs={12} sm={12} md={3}>
            <Button
              variant="text"
              color="inherit"
              size="small"
              onClick={() => {
                setOperationFilter('');
                setStatusFilter('');
                setSessionFilter('');
              }}
            >
              Clear Filters
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Events Table */}
      <TableContainer component={Paper} sx={{ bgcolor: 'background.paper', border: '1px solid rgba(255,255,255,0.08)' }}>
        <Table size="small">
          <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Timestamp</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>User / Attribution</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Session</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Op</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Query Preview</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Target Tables</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Flags</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
              <TableCell align="center" sx={{ fontWeight: 600 }}>Detail</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                  <CircularProgress size={32} />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Ingesting database activity log...
                  </Typography>
                </TableCell>
              </TableRow>
            ) : events.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    No SQL events found matching the filter criteria.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              events.map((evt) => {
                const dateStr = new Date(evt.event_time).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                });

                return (
                  <TableRow key={evt.id} hover sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                    <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'text.secondary' }}>
                      {dateStr}
                    </TableCell>
                    <TableCell>
                      {evt.username ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                          <BootstrapIcon name="bi-person-circle" size={15} color="#55E6C1" />
                          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
                            {evt.username}
                          </Typography>
                        </Box>
                      ) : (
                        <Chip
                          label={evt.mysql_username || 'unattributed'}
                          size="small"
                          sx={{ fontSize: '0.7rem', height: 20, bgcolor: 'rgba(255,255,255,0.05)' }}
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      {evt.session_id ? (
                        <Chip
                          label={`Session #${evt.session_id}`}
                          size="small"
                          color="primary"
                          variant="outlined"
                          sx={{ fontSize: '0.7rem', height: 20 }}
                        />
                      ) : (
                        <Typography variant="caption" color="text.disabled">
                          Direct / Daemon
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={evt.operation}
                        size="small"
                        color={getOperationColor(evt.operation)}
                        sx={{ fontSize: '0.7rem', fontWeight: 700, height: 20 }}
                      />
                    </TableCell>
                    <TableCell sx={{ maxWidth: 300 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontFamily: 'monospace',
                          fontSize: '0.8rem',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {evt.raw_sql}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                        {Array.isArray(evt.tables) && evt.tables.length > 0 ? (
                          evt.tables.map((t, idx) => (
                            <Chip
                              key={idx}
                              label={t}
                              size="small"
                              variant="outlined"
                              sx={{ fontSize: '0.65rem', height: 18 }}
                            />
                          ))
                        ) : (
                          <Typography variant="caption" color="text.disabled">-</Typography>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Stack direction="row" spacing={0.5} sx={{ flexWrap: 'wrap', gap: 0.5 }}>
                        {evt.flags?.is_unbounded_read && (
                          <Chip
                            label="UNBOUNDED"
                            size="small"
                            color="warning"
                            sx={{ fontSize: '0.65rem', height: 18, fontWeight: 700 }}
                          />
                        )}
                        {evt.flags?.is_cross_schema && (
                          <Chip
                            label="CROSS-SCHEMA"
                            size="small"
                            color="error"
                            sx={{ fontSize: '0.65rem', height: 18, fontWeight: 700 }}
                          />
                        )}
                        {evt.flags?.is_ddl && (
                          <Chip
                            label="DDL"
                            size="small"
                            color="error"
                            sx={{ fontSize: '0.65rem', height: 18, fontWeight: 700 }}
                          />
                        )}
                        {!evt.flags?.is_unbounded_read && !evt.flags?.is_cross_schema && !evt.flags?.is_ddl && (
                          <Typography variant="caption" color="text.disabled">None</Typography>
                        )}
                      </Stack>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={evt.status}
                        size="small"
                        color={evt.status === 'executed' ? 'success' : 'error'}
                        variant="outlined"
                        sx={{ fontSize: '0.65rem', height: 18 }}
                      />
                    </TableCell>
                    <TableCell align="center">
                      <IconButton size="small" onClick={() => setSelectedEvent(evt)} color="primary" aria-label="Inspect SQL Event Details">
                        <BootstrapIcon name="bi-search" size={14} />
                      </IconButton>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </TableContainer>

      {/* SQL & AST Inspection Modal */}
      <Dialog
        open={Boolean(selectedEvent)}
        onClose={() => setSelectedEvent(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <BootstrapIcon name="bi-database" size={18} color="#55E6C1" />
            <Typography variant="h6">SQL Event #{selectedEvent?.id} Inspection</Typography>
          </Box>
          <Chip
            label={selectedEvent?.operation}
            color={getOperationColor(selectedEvent?.operation)}
            size="small"
            sx={{ fontWeight: 700 }}
          />
        </DialogTitle>
        <DialogContent dividers>
          {selectedEvent && (
            <Stack spacing={2.5}>
              {/* Attribution Meta */}
              <Box sx={{ p: 2, bgcolor: 'background.default', borderRadius: 1.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: 'primary.light' }}>
                  Attribution & Context
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">Authenticated User</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {selectedEvent.username ? `${selectedEvent.full_name} (${selectedEvent.username})` : 'Unattributed'}
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">JIT Session</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {selectedEvent.session_id ? `ID #${selectedEvent.session_id}` : 'None (Direct/Root)'}
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">MySQL Role/Profile</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {selectedEvent.profile_name || 'Standard/Internal'}
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={3}>
                    <Typography variant="caption" color="text.secondary">MySQL Ephemeral User</Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                      {selectedEvent.mysql_username}
                    </Typography>
                  </Grid>
                </Grid>
              </Box>

              {/* Raw SQL */}
              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Raw SQL Statement
                  </Typography>
                  <Button
                    size="small"
                    startIcon={copiedRaw ? <BootstrapIcon name="bi-check-circle-fill" size={14} color="#10B981" /> : <BootstrapIcon name="bi-clipboard" size={14} />}
                    onClick={() => handleCopyRaw(selectedEvent.raw_sql)}
                  >
                    {copiedRaw ? 'Copied' : 'Copy SQL'}
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
                  {selectedEvent.raw_sql}
                </Paper>
              </Box>

              {/* Normalized SQL */}
              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5, color: '#AAB8BC' }}>
                  AST Normalized Pattern
                </Typography>
                <Paper
                  sx={{
                    p: 1.5,
                    bgcolor: '#171B1C',
                    border: '1px solid #364345',
                    fontFamily: 'monospace',
                    fontSize: '0.8rem',
                    color: '#F5F7F7',
                    whiteSpace: 'pre-wrap'
                  }}
                >
                  {selectedEvent.normalized_sql}
                </Paper>
              </Box>

              {/* Extracted Tables & Flags */}
              <Grid container spacing={2}>
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
                    Extracted Tables
                  </Typography>
                  <Paper sx={{ p: 1.5, bgcolor: '#0d1117' }}>
                    {Array.isArray(selectedEvent.tables) && selectedEvent.tables.length > 0 ? (
                      <Stack direction="row" spacing={1} flexWrap="wrap">
                        {selectedEvent.tables.map((t, idx) => (
                          <Chip key={idx} label={t} color="primary" variant="outlined" size="small" />
                        ))}
                      </Stack>
                    ) : (
                      <Typography variant="caption" color="text.secondary">No explicit tables parsed</Typography>
                    )}
                  </Paper>
                </Grid>
                <Grid item xs={12} sm={6}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
                    Semantic & Security Flags
                  </Typography>
                  <Paper sx={{ p: 1.5, bgcolor: '#0d1117' }}>
                    <Stack direction="row" spacing={1} flexWrap="wrap">
                      {selectedEvent.flags && Object.entries(selectedEvent.flags).map(([key, val]) => (
                        <Chip
                          key={key}
                          label={`${key}: ${String(val)}`}
                          size="small"
                          color={val === true ? 'warning' : 'default'}
                        />
                      ))}
                    </Stack>
                  </Paper>
                </Grid>
              </Grid>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedEvent(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
