// frontend/src/pages/ThreatFeedPage.jsx
import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
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
  Grid,
  LinearProgress
} from '@mui/material';
import BootstrapIcon from '../components/common/BootstrapIcon.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function ThreatFeedPage() {
  const { accessToken } = useAuth();

  const [currentTab, setCurrentTab] = useState(0); // 0: Alerts, 1: Session Risk Scores
  const [alerts, setAlerts] = useState([]);
  const [riskScores, setRiskScores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Filters
  const [statusFilter, setStatusFilter] = useState('');
  const [severityFilter, setSeverityFilter] = useState('');

  // Explainability Modal
  const [selectedBreakdown, setSelectedBreakdown] = useState(null);

  // Action Dialog for Alert Status
  const [actionDialog, setActionDialog] = useState({
    open: false,
    alert: null,
    newStatus: '',
    notes: ''
  });

  const fetchData = async () => {
    try {
      setError(null);
      let alertParams = new URLSearchParams();
      if (statusFilter) alertParams.append('status', statusFilter);
      if (severityFilter) alertParams.append('severity', severityFilter);
      alertParams.append('limit', '100');

      const [alertsRes, scoresRes] = await Promise.all([
        fetch(`/api/alerts?${alertParams.toString()}`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        }),
        fetch(`/api/risk-scores?limit=100`, {
          headers: { Authorization: `Bearer ${accessToken}` }
        })
      ]);

      const alertsData = await alertsRes.json();
      const scoresData = await scoresRes.json();

      if (alertsData.success) setAlerts(alertsData.data.alerts || []);
      if (scoresData.success) setRiskScores(scoresData.data.risk_scores || []);
    } catch (err) {
      setError(err.message || 'Error communicating with server');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [statusFilter, severityFilter]);

  // Live polling
  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(() => {
      fetchData();
    }, 3000);
    return () => clearInterval(interval);
  }, [autoRefresh, statusFilter, severityFilter]);

  const handleUpdateAlertStatus = async () => {
    if (!actionDialog.alert) return;
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
        setActionDialog({ open: false, alert: null, newStatus: '', notes: '' });
        fetchData();
      } else {
        setError(data.error?.message || 'Failed to update alert');
      }
    } catch (err) {
      setError(err.message || 'Failed to update alert');
    }
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

  const getStatusChip = (status) => {
    switch (status) {
      case 'open':
        return <Chip label="OPEN" color="error" variant="outlined" size="small" sx={{ fontWeight: 700, height: 20, fontSize: '0.65rem' }} />;
      case 'investigating':
        return <Chip label="INVESTIGATING" color="warning" variant="outlined" size="small" sx={{ fontWeight: 700, height: 20, fontSize: '0.65rem' }} />;
      case 'closed':
        return <Chip label="RESOLVED" color="success" variant="outlined" size="small" sx={{ fontWeight: 700, height: 20, fontSize: '0.65rem' }} />;
      default:
        return <Chip label={status} size="small" sx={{ height: 20, fontSize: '0.65rem' }} />;
    }
  };

  // Metrics
  const activeAlertsCount = alerts.filter(a => a.status !== 'closed').length;
  const criticalHighRiskCount = riskScores.filter(s => ['critical', 'high'].includes(s.risk_level)).length;
  const totalEvaluatedSessions = riskScores.length;
  const avgRiskScore = totalEvaluatedSessions > 0
    ? Math.round(riskScores.reduce((acc, s) => acc + s.score, 0) / totalEvaluatedSessions)
    : 0;

  return (
    <Box>
      <Box sx={{ mb: 3, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#e0e6ed' }}>
            Threat & Risk Intelligence Feed
          </Typography>
          <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
            Automated behavioural baseline anomaly detection, deterministic explainable risk scores, and alert workflow.
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
              fetchData();
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
                Active Security Alerts
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, color: activeAlertsCount > 0 ? '#ef5350' : '#81c784', mt: 0.5 }}>
                {activeAlertsCount}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Open or investigating triage queue
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: 'background.paper', border: '1px solid rgba(255,255,255,0.08)' }}>
            <CardContent sx={{ py: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                High & Critical Sessions
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, color: criticalHighRiskCount > 0 ? '#ffa726' : '#90caf9', mt: 0.5 }}>
                {criticalHighRiskCount}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Risk score threshold &gt;= 50
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: 'background.paper', border: '1px solid rgba(255,255,255,0.08)' }}>
            <CardContent sx={{ py: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                Monitored JIT Sessions
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, color: '#90caf9', mt: 0.5 }}>
                {totalEvaluatedSessions}
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Baseline-evaluated database sessions
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={6} md={3}>
          <Card sx={{ bgcolor: 'background.paper', border: '1px solid rgba(255,255,255,0.08)' }}>
            <CardContent sx={{ py: 2 }}>
              <Typography variant="caption" color="text.secondary" sx={{ textTransform: 'uppercase', fontWeight: 600 }}>
                Average Risk Score
              </Typography>
              <Typography variant="h5" sx={{ fontWeight: 700, color: avgRiskScore > 40 ? '#ffa726' : '#81c784', mt: 0.5 }}>
                {avgRiskScore} / 100
              </Typography>
              <Typography variant="caption" color="text.secondary">
                Across all active and recent sessions
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {error && (
        <Alert severity="error" sx={{ mb: 2 }}>
          {error}
        </Alert>
      )}

      {/* Navigation Tabs */}
      <Box sx={{ borderBottom: 1, borderColor: 'divider', mb: 2 }}>
        <Tabs value={currentTab} onChange={(e, val) => setCurrentTab(val)}>
          <Tab
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <span>Security Alerts Queue</span>
                {activeAlertsCount > 0 && (
                  <Chip label={activeAlertsCount} size="small" color="error" sx={{ height: 18, fontSize: '0.65rem' }} />
                )}
              </Box>
            }
          />
          <Tab
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <span>Session Risk Scores</span>
                <Chip label={totalEvaluatedSessions} size="small" sx={{ height: 18, fontSize: '0.65rem' }} />
              </Box>
            }
          />
        </Tabs>
      </Box>

      {/* TAB 0: Alerts Queue */}
      {currentTab === 0 && (
        <Box>
          <Paper sx={{ p: 2, mb: 2, bgcolor: 'background.paper', border: '1px solid rgba(255,255,255,0.08)' }}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={4}>
                <FormControl fullWidth size="small">
                  <InputLabel id="status-filter-label">Alert Status</InputLabel>
                  <Select
                    labelId="status-filter-label"
                    value={statusFilter}
                    label="Alert Status"
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <MenuItem value="">All Statuses</MenuItem>
                    <MenuItem value="open">Open</MenuItem>
                    <MenuItem value="investigating">Investigating</MenuItem>
                    <MenuItem value="closed">Closed / Resolved</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid item xs={12} sm={4}>
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
              <Grid item xs={12} sm={4}>
                <Button
                  variant="text"
                  size="small"
                  onClick={() => {
                    setStatusFilter('');
                    setSeverityFilter('');
                  }}
                >
                  Clear Filters
                </Button>
              </Grid>
            </Grid>
          </Paper>

          <TableContainer component={Paper} sx={{ bgcolor: 'background.paper', border: '1px solid rgba(255,255,255,0.08)' }}>
            <Table size="small">
              <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Created</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Severity</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Risk Score</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>User / Profile</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Alert Details</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Evidence</TableCell>
                  <TableCell align="center" sx={{ fontWeight: 600 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading && alerts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                      <CircularProgress size={32} />
                      <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>
                        Loading alert streams...
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : alerts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                      <Typography variant="body2" color="text.secondary">
                        No alerts matching current filters.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  alerts.map((alert) => {
                    const timeStr = new Date(alert.created_at).toLocaleTimeString([], {
                      hour: '2-digit',
                      minute: '2-digit',
                      second: '2-digit'
                    });

                    return (
                      <TableRow key={alert.id} hover sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                        <TableCell sx={{ whiteSpace: 'nowrap', fontSize: '0.8rem', color: 'text.secondary' }}>
                          {timeStr}
                        </TableCell>
                        <TableCell>{getStatusChip(alert.status)}</TableCell>
                        <TableCell>{getSeverityChip(alert.severity)}</TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            <Typography variant="body2" sx={{ fontWeight: 700, color: alert.risk_score >= 75 ? '#ef5350' : '#ffa726' }}>
                              {alert.risk_score}
                            </Typography>
                            <Box sx={{ width: 40 }}>
                              <LinearProgress
                                variant="determinate"
                                value={alert.risk_score}
                                color={alert.risk_score >= 75 ? 'error' : 'warning'}
                                sx={{ height: 6, borderRadius: 3 }}
                              />
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
                            {alert.username}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" display="block">
                            Session #{alert.session_id} • {alert.profile_name}
                          </Typography>
                        </TableCell>
                        <TableCell sx={{ maxWidth: 300 }}>
                          <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.8rem' }}>
                            {alert.title}
                          </Typography>
                          <Typography variant="caption" color="text.secondary" sx={{ display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                            {alert.description}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() => setSelectedBreakdown({ title: alert.title, score: alert.risk_score, breakdown: alert.evidence })}
                            sx={{ fontSize: '0.7rem', py: 0.2 }}
                          >
                            Explain ({Array.isArray(alert.evidence) ? alert.evidence.length : 0})
                          </Button>
                        </TableCell>
                        <TableCell align="center">
                          <Stack direction="row" spacing={0.5} justifyContent="center">
                            {alert.status === 'open' && (
                              <Button
                                size="small"
                                color="warning"
                                variant="outlined"
                                onClick={() => setActionDialog({ open: true, alert, newStatus: 'investigating', notes: '' })}
                                sx={{ fontSize: '0.65rem', py: 0.2 }}
                              >
                                Investigate
                              </Button>
                            )}
                            {alert.status !== 'closed' && (
                              <Button
                                size="small"
                                color="success"
                                variant="outlined"
                                onClick={() => setActionDialog({ open: true, alert, newStatus: 'closed', notes: '' })}
                                sx={{ fontSize: '0.65rem', py: 0.2 }}
                              >
                                Resolve
                              </Button>
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
        </Box>
      )}

      {/* TAB 1: Session Risk Scores */}
      {currentTab === 1 && (
        <TableContainer component={Paper} sx={{ bgcolor: 'background.paper', border: '1px solid rgba(255,255,255,0.08)' }}>
          <Table size="small">
            <TableHead sx={{ bgcolor: 'rgba(255,255,255,0.03)' }}>
              <TableRow>
                <TableCell sx={{ fontWeight: 600 }}>Session</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>User</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Profile</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Risk Level</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Calculated Score</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Triggered Detectors</TableCell>
                <TableCell sx={{ fontWeight: 600 }}>Last Calculated</TableCell>
                <TableCell align="center" sx={{ fontWeight: 600 }}>Audit Explainability</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {loading && riskScores.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    <CircularProgress size={32} />
                  </TableCell>
                </TableRow>
              ) : riskScores.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} align="center" sx={{ py: 4 }}>
                    <Typography variant="body2" color="text.secondary">
                      No session risk scores computed yet.
                    </Typography>
                  </TableCell>
                </TableRow>
              ) : (
                riskScores.map((s) => {
                  const breakdown = Array.isArray(s.breakdown) ? s.breakdown : [];
                  return (
                    <TableRow key={s.session_id} hover sx={{ '&:hover': { bgcolor: 'rgba(255,255,255,0.02)' } }}>
                      <TableCell>
                        <Chip label={`#${s.session_id}`} size="small" color="primary" variant="outlined" sx={{ height: 20 }} />
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>
                          {s.username}
                        </Typography>
                        <Typography variant="caption" color="text.secondary">
                          {s.full_name}
                        </Typography>
                      </TableCell>
                      <TableCell>{s.profile_name}</TableCell>
                      <TableCell>{getSeverityChip(s.risk_level)}</TableCell>
                      <TableCell sx={{ width: 140 }}>
                        <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                          <Typography variant="body2" sx={{ fontWeight: 700 }}>
                            {s.score}/100
                          </Typography>
                          <Box sx={{ width: 60 }}>
                            <LinearProgress
                              variant="determinate"
                              value={s.score}
                              color={s.score >= 75 ? 'error' : s.score >= 50 ? 'warning' : 'primary'}
                              sx={{ height: 6, borderRadius: 3 }}
                            />
                          </Box>
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Stack direction="row" spacing={0.5} flexWrap="wrap" gap={0.5}>
                          {breakdown.length > 0 ? (
                            breakdown.map((b, idx) => (
                              <Chip
                                key={idx}
                                label={`${b.rule_id} (+${b.weight})`}
                                size="small"
                                sx={{ fontSize: '0.65rem', height: 18, bgcolor: 'rgba(255,255,255,0.06)' }}
                              />
                            ))
                          ) : (
                            <Typography variant="caption" color="text.disabled">No anomalous detectors</Typography>
                          )}
                        </Stack>
                      </TableCell>
                      <TableCell sx={{ fontSize: '0.75rem', color: 'text.secondary' }}>
                        {new Date(s.calculated_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </TableCell>
                      <TableCell align="center">
                        <Button
                          size="small"
                          variant="outlined"
                          onClick={() => setSelectedBreakdown({ title: `Session #${s.session_id} Risk Audit`, score: s.score, breakdown })}
                          sx={{ fontSize: '0.7rem', py: 0.2 }}
                        >
                          View Breakdown
                        </Button>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

      {/* Explainable Risk Score Breakdown Dialog */}
      <Dialog
        open={Boolean(selectedBreakdown)}
        onClose={() => setSelectedBreakdown(null)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <BootstrapIcon name="bi-speedometer" size={18} color="#F59E0B" />
            <Typography variant="h6">{selectedBreakdown?.title}</Typography>
          </Box>
          <Chip
            label={`Aggregate Score: ${selectedBreakdown?.score || 0}/100`}
            color={(selectedBreakdown?.score || 0) >= 70 ? 'error' : 'warning'}
            sx={{ fontWeight: 700 }}
          />
        </DialogTitle>
        <DialogContent dividers>
          {selectedBreakdown && (
            <Stack spacing={2}>
              <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>
                Explainability Audit: Triggered Threat Detectors ({selectedBreakdown.breakdown?.length || 0})
              </Typography>
              {Array.isArray(selectedBreakdown.breakdown) && selectedBreakdown.breakdown.length > 0 ? (
                selectedBreakdown.breakdown.map((item, idx) => (
                  <Paper
                    key={idx}
                    sx={{
                      p: 2,
                      bgcolor: 'background.default',
                      border: '1px solid rgba(255,255,255,0.08)',
                      borderRadius: 1.5
                    }}
                  >
                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 1 }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        <BootstrapIcon name="bi-exclamation-triangle-fill" size={14} color="#F59E0B" />
                        <Typography variant="subtitle2" sx={{ fontFamily: 'monospace', fontWeight: 700 }}>
                          {item.rule_id}
                        </Typography>
                      </Box>
                      <Chip
                        label={`Weight: +${item.weight}`}
                        color="error"
                        size="small"
                        sx={{ fontWeight: 700, height: 20, fontSize: '0.65rem' }}
                      />
                    </Box>
                    <Typography variant="body2" sx={{ color: 'text.secondary', mb: 1.5 }}>
                      {item.explanation}
                    </Typography>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Typography variant="caption" sx={{ fontWeight: 600 }}>
                        Evidence Event IDs:
                      </Typography>
                      <Stack direction="row" spacing={0.5}>
                        {Array.isArray(item.evidence_event_ids) && item.evidence_event_ids.length > 0 ? (
                          item.evidence_event_ids.map((id) => (
                            <Chip key={id} label={`Event #${id}`} size="small" variant="outlined" sx={{ height: 18, fontSize: '0.65rem' }} />
                          ))
                        ) : (
                          <Typography variant="caption" color="text.disabled">None logged</Typography>
                        )}
                      </Stack>
                    </Box>
                  </Paper>
                ))
              ) : (
                <Alert severity="info">No anomalous threat rules fired for this session. Score is nominal.</Alert>
              )}
            </Stack>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSelectedBreakdown(null)}>Close</Button>
        </DialogActions>
      </Dialog>

      {/* Alert Status Update Dialog */}
      <Dialog
        open={actionDialog.open}
        onClose={() => setActionDialog({ open: false, alert: null, newStatus: '', notes: '' })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle>Update Security Alert Status</DialogTitle>
        <DialogContent dividers>
          <Stack spacing={2} sx={{ mt: 1 }}>
            <Typography variant="body2">
              Transition alert #{actionDialog.alert?.id} ({actionDialog.alert?.title}) to{' '}
              <strong>{actionDialog.newStatus?.toUpperCase()}</strong>.
            </Typography>
            <TextField
              label="Analyst Triage Notes"
              multiline
              rows={3}
              fullWidth
              value={actionDialog.notes}
              onChange={(e) => setActionDialog({ ...actionDialog, notes: e.target.value })}
              placeholder="e.g. Investigated query pattern with HR manager. Unbounded query was verified as unauthorized bulk export attempt."
            />
          </Stack>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setActionDialog({ open: false, alert: null, newStatus: '', notes: '' })}>
            Cancel
          </Button>
          <Button variant="contained" color="primary" onClick={handleUpdateAlertStatus}>
            Save Transition
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
