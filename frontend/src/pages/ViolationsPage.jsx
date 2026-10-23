// frontend/src/pages/ViolationsPage.jsx
import React, { useState, useEffect } from 'react';
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
  Divider,
  Stack,
  Switch,
  FormControlLabel,
  Grid
} from '@mui/material';
import BootstrapIcon from '../components/common/BootstrapIcon.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function ViolationsPage() {
  const { accessToken } = useAuth();

  const [violations, setViolations] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Filters
  const [severityFilter, setSeverityFilter] = useState('');
  const [enforcementFilter, setEnforcementFilter] = useState('');
  const [ruleFilter, setRuleFilter] = useState('');
  const [sessionFilter, setSessionFilter] = useState('');

  // Inspection Modal
  const [selectedViolation, setSelectedViolation] = useState(null);
  const [copiedRaw, setCopiedRaw] = useState(false);

  const fetchViolations = async () => {
    try {
      setError(null);
      let queryParams = new URLSearchParams();
      if (severityFilter) queryParams.append('severity', severityFilter);
      if (enforcementFilter) queryParams.append('enforcement_type', enforcementFilter);
      if (ruleFilter) queryParams.append('rule', ruleFilter);
      if (sessionFilter) queryParams.append('session_id', sessionFilter);
      queryParams.append('limit', '100');

      const res = await fetch(`/api/violations?${queryParams.toString()}`, {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      if (data.success) {
        setViolations(data.data.violations || []);
      } else {
        setError(data.error?.message || 'Failed to fetch policy violations');
      }
    } catch (err) {
      setError(err.message || 'Error communicating with server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchViolations();
  }, [severityFilter, enforcementFilter, ruleFilter, sessionFilter]);

  // Polling interval
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchViolations();
    }, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, severityFilter, enforcementFilter, ruleFilter, sessionFilter]);

  const handleCopyRaw = (sql) => {
    navigator.clipboard.writeText(sql);
    setCopiedRaw(true);
    setTimeout(() => setCopiedRaw(false), 2000);
  };

  const getSeverityChip = (sev) => {
    switch (sev) {
      case 'critical':
        return <Chip label="CRITICAL" color="error" size="small" sx={{ fontWeight: 700, height: 20, fontSize: '0.65rem' }} />;
      case 'high':
        return <Chip label="HIGH" color="warning" size="small" sx={{ fontWeight: 700, height: 20, fontSize: '0.65rem' }} />;
      case 'medium':
        return <Chip label="MEDIUM" color="info" size="small" sx={{ fontWeight: 700, height: 20, fontSize: '0.65rem' }} />;
      case 'low':
      default:
        return <Chip label="LOW" size="small" sx={{ height: 20, fontSize: '0.65rem' }} />;
    }
  };

  const getEnforcementChip = (type) => {
    if (type === 'blocked_by_db') {
      return (
        <Chip
          icon={<BootstrapIcon name="bi-shield-x" size={13} />}
          label="BLOCKED PRE-EXEC (DB)"
          color="success"
          variant="outlined"
          size="small"
          sx={{ fontWeight: 700, height: 22, fontSize: '0.65rem' }}
        />
      );
    }
    return (
      <Chip
        icon={<BootstrapIcon name="bi-exclamation-triangle" size={13} />}
        label="DETECTED POST-HOC"
        color="warning"
        variant="outlined"
        size="small"
        sx={{ fontWeight: 700, height: 22, fontSize: '0.65rem' }}
      />
    );
  };

  // Metrics
  const totalCount = violations.length;
  const blockedCount = violations.filter((v) => v.enforcement_type === 'blocked_by_db').length;
  const postHocCount = violations.filter((v) => v.enforcement_type === 'detected_post_hoc').length;
  const criticalHighCount = violations.filter((v) => ['critical', 'high'].includes(v.severity)).length;

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#e0e6ed' }}>
            Policy Violations Stream
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Automated OPA Rego evaluation against observed SQL queries, differentiating pre-execution DB grants from post-hoc telemetry.
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
            label={<Typography variant="body2" color="text.secondary">Live Polling (3s)</Typography>}
          />
          <Button
            variant="outlined"
            startIcon={<BootstrapIcon name="bi-arrow-clockwise" size={15} />}
            onClick={() => {
              setLoading(true);
              fetchViolations();
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
          <Card sx={{ bgcolor: 'background.paper', border: '1px solid rgba(255,255,255,0.08)' }}>
            <CardContent sx={{ py: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                Total Violations
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#f44336', mt: 0.5 }}>
                {totalCount}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Observed policy discrepancies
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: 'background.paper', border: '1px solid rgba(255,255,255,0.08)' }}>
            <CardContent sx={{ py: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                Blocked By MySQL GRANTs
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#66bb6a', mt: 0.5 }}>
                {blockedCount}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Pre-execution preventative rejection
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: 'background.paper', border: '1px solid rgba(255,255,255,0.08)' }}>
            <CardContent sx={{ py: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                Detected Post-Hoc
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#ffa726', mt: 0.5 }}>
                {postHocCount}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Semantic / Contextual audit triggers
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: 'background.paper', border: '1px solid rgba(255,255,255,0.08)' }}>
            <CardContent sx={{ py: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                Critical / High Violations
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#e57373', mt: 0.5 }}>
                {criticalHighCount}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Privilege abuse & data risk
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Filter Controls */}
      <Paper sx={{ p: 2, mb: 3, bgcolor: 'background.paper', border: '1px solid rgba(255,255,255,0.08)' }}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth size="small">
              <InputLabel id="sev-filter-label">Severity</InputLabel>
              <Select
                labelId="sev-filter-label"
                value={severityFilter}
                label="Severity"
                onChange={(e) => setSeverityFilter(e.target.value)}
              >
                <MenuItem value="">All Severities</MenuItem>
                <MenuItem value="critical">Critical</MenuItem>
                <MenuItem value="high">High</MenuItem>
                <MenuItem value="medium">Medium</MenuItem>
                <MenuItem value="low">Low</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth size="small">
              <InputLabel id="enf-filter-label">Enforcement Type</InputLabel>
              <Select
                labelId="enf-filter-label"
                value={enforcementFilter}
                label="Enforcement Type"
                onChange={(e) => setEnforcementFilter(e.target.value)}
              >
                <MenuItem value="">All Types</MenuItem>
                <MenuItem value="blocked_by_db">Blocked by DB (Pre-Execution)</MenuItem>
                <MenuItem value="detected_post_hoc">Detected Post-Hoc (Audit Log)</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth size="small">
              <InputLabel id="rule-filter-label">Policy Rule</InputLabel>
              <Select
                labelId="rule-filter-label"
                value={ruleFilter}
                label="Policy Rule"
                onChange={(e) => setRuleFilter(e.target.value)}
              >
                <MenuItem value="">All Rules</MenuItem>
                <MenuItem value="OPERATION_NOT_GRANTED">OPERATION_NOT_GRANTED</MenuItem>
                <MenuItem value="TABLE_OUT_OF_SCOPE">TABLE_OUT_OF_SCOPE</MenuItem>
                <MenuItem value="UNBOUNDED_BULK_READ">UNBOUNDED_BULK_READ</MenuItem>
                <MenuItem value="UNAUTHORIZED_DDL">UNAUTHORIZED_DDL</MenuItem>
                <MenuItem value="CROSS_SCHEMA_ACCESS">CROSS_SCHEMA_ACCESS</MenuItem>
                <MenuItem value="SESSION_EXPIRED">SESSION_EXPIRED</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={3}>
            <TextField
              size="small"
              fullWidth
              label="Session ID"
              placeholder="e.g. 7"
              value={sessionFilter}
              onChange={(e) => setSessionFilter(e.target.value)}
            />
          </Grid>
        </Grid>
      </Paper>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Violations Table */}
      <TableContainer component={Paper} sx={{ bgcolor: 'background.paper', border: '1px solid rgba(255,255,255,0.08)' }}>
        <Table size="small">
          <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>Event ID</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Timestamp</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Rule Violated</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Severity</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Enforcement</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>User / Session</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Explanation</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Evidence Query</TableCell>
              <TableCell align="center" sx={{ fontWeight: 600 }}>Detail</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && violations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                  <CircularProgress size={32} />
                  <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                    Evaluating policy streams...
                  </Typography>
                </TableCell>
              </TableRow>
            ) : violations.length === 0 ? (
              <TableRow>
                <TableCell colSpan={9} align="center" sx={{ py: 4 }}>
                  <Typography variant="body2" color="text.secondary">
                    No policy violations found matching current criteria.
                  </Typography>
                </TableCell>
              </TableRow>
            ) : (
              violations.map((violation) => {
                const dateStr = new Date(violation.created_at).toLocaleTimeString([], {
                  hour: '2-digit',
                  minute: '2-digit',
                  second: '2-digit'
                });

                return (
                  <TableRow key={violation.id} hover sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                    <TableCell>
                      <Chip
                        label={`#${violation.event_id || violation.id}`}
                        size="small"
                        color="primary"
                        variant="outlined"
                        sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.7rem', height: 20 }}
                      />
                    </TableCell>
                    <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'text.secondary' }}>
                      {dateStr}
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={violation.rule}
                        size="small"
                        color="default"
                        sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.75rem', height: 22 }}
                      />
                    </TableCell>
                    <TableCell>
                      {getSeverityChip(violation.severity)}
                    </TableCell>
                    <TableCell>
                      {getEnforcementChip(violation.enforcement_type)}
                    </TableCell>
                    <TableCell>
                      {violation.username ? (
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                          <BootstrapIcon name="bi-person-circle" size={15} color="#55E6C1" />
                          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                            {violation.username}
                          </Typography>
                          {violation.session_id && (
                            <Chip label={`#${violation.session_id}`} size="small" sx={{ height: 18, fontSize: '0.65rem' }} />
                          )}
                        </Box>
                      ) : (
                        <Typography variant="caption" color="text.disabled">
                          Unattributed
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell sx={{ maxWidth: 280 }}>
                      <Typography variant="body2" sx={{ fontSize: '0.8rem', color: 'text.primary' }}>
                        {violation.reason}
                      </Typography>
                    </TableCell>
                    <TableCell sx={{ maxWidth: 240 }}>
                      <Typography
                        variant="body2"
                        sx={{
                          fontFamily: 'monospace',
                          fontSize: '0.75rem',
                          color: '#55E6C1',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                          whiteSpace: 'nowrap'
                        }}
                      >
                        {violation.raw_sql}
                      </Typography>
                    </TableCell>
                    <TableCell align="center">
                      <IconButton size="small" onClick={() => setSelectedViolation(violation)} color="primary" aria-label="View Violation SQL">
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

      {/* Violation Detail Dialog */}
      <Dialog
        open={Boolean(selectedViolation)}
        onClose={() => setSelectedViolation(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <BootstrapIcon name="bi-shield-x" size={18} color="#EF4444" />
            <Typography variant="h6">Policy Violation #{selectedViolation?.id}</Typography>
          </Box>
          <Stack direction="row" spacing={1}>
            {selectedViolation && getSeverityChip(selectedViolation.severity)}
            {selectedViolation && getEnforcementChip(selectedViolation.enforcement_type)}
          </Stack>
        </DialogTitle>
        <DialogContent dividers>
          {selectedViolation && (
            <Stack spacing={2.5}>
              <Box sx={{ p: 2, bgcolor: '#171B1C', border: '1px solid #364345', borderRadius: 1.5 }}>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 1, color: 'primary.light' }}>
                  Violation Metadata
                </Typography>
                <Grid container spacing={2}>
                  <Grid item xs={6} sm={2.4}>
                    <Typography variant="caption" color="text.secondary">Canonical Event</Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700, color: 'primary.light' }}>
                      Event #{selectedViolation.event_id || selectedViolation.id}
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={2.4}>
                    <Typography variant="caption" color="text.secondary">Rule ID</Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                      {selectedViolation.rule}
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={2.4}>
                    <Typography variant="caption" color="text.secondary">Triggered By</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {selectedViolation.username ? `${selectedViolation.full_name || selectedViolation.username}` : 'Unattributed'}
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={2.4}>
                    <Typography variant="caption" color="text.secondary">Session Context</Typography>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>
                      {selectedViolation.session_id ? `JIT Session #${selectedViolation.session_id}` : 'None'}
                    </Typography>
                  </Grid>
                  <Grid item xs={6} sm={2.4}>
                    <Typography variant="caption" color="text.secondary">MySQL Username</Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600 }}>
                      {selectedViolation.mysql_username}
                    </Typography>
                  </Grid>
                </Grid>
              </Box>

              <Box>
                <Typography variant="subtitle2" sx={{ fontWeight: 600, mb: 0.5 }}>
                  Violation Reason
                </Typography>
                <Alert severity={selectedViolation.severity === 'critical' ? 'error' : 'warning'}>
                  {selectedViolation.reason}
                </Alert>
              </Box>

              <Box>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
                  <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                    Evidence SQL Query
                  </Typography>
                  <Button
                    size="small"
                    startIcon={copiedRaw ? <BootstrapIcon name="bi-check-circle-fill" size={14} color="#10B981" /> : <BootstrapIcon name="bi-clipboard" size={14} />}
                    onClick={() => handleCopyRaw(selectedViolation.raw_sql)}
                  >
                    {copiedRaw ? 'Copied' : 'Copy Query'}
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
                  {selectedViolation.raw_sql}
                </Paper>
              </Box>
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedViolation(null)}>Close</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
