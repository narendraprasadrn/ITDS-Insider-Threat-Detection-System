// frontend/src/pages/SessionsPage.jsx
import React, { useState, useEffect } from 'react';
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
  Slider,
  IconButton,
  Tooltip,
  Divider,
  Stack
} from '@mui/material';
import LockOpenIcon from '@mui/icons-material/LockOpen';
import ContentCopyIcon from '@mui/icons-material/ContentCopy';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import AddTaskIcon from '@mui/icons-material/AddTask';
import CancelIcon from '@mui/icons-material/Cancel';
import CheckCircleIcon from '@mui/icons-material/CheckCircle';
import RefreshIcon from '@mui/icons-material/Refresh';
import TimerIcon from '@mui/icons-material/Timer';
import DeleteForeverIcon from '@mui/icons-material/DeleteForever';
import StorageIcon from '@mui/icons-material/Storage';
import TerminalIcon from '@mui/icons-material/Terminal';
import HistoryIcon from '@mui/icons-material/History';
import RuleIcon from '@mui/icons-material/Rule';
import { useAuth } from '../context/AuthContext.jsx';

export default function SessionsPage() {
  const { user, accessToken, hasRole } = useAuth();
  const navigate = useNavigate();
  const isAdminOrDba = hasRole('admin') || hasRole('dba');

  const [currentTab, setCurrentTab] = useState(0);
  const [availableProfiles, setAvailableProfiles] = useState([]);
  const [mySessions, setMySessions] = useState([]);
  const [allRequests, setAllRequests] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  // Request Access Dialog
  const [openRequestDialog, setOpenRequestDialog] = useState(false);
  const [requestForm, setRequestForm] = useState({
    profile_id: '',
    requested_duration_minutes: 60,
    justification: ''
  });
  const [submitting, setSubmitting] = useState(false);

  // Credentials Modal (Shown Once)
  const [credentialsModal, setCredentialsModal] = useState({
    open: false,
    credentials: null,
    showPass: false
  });

  // Admin Decision Dialog
  const [decisionDialog, setDecisionDialog] = useState({
    open: false,
    requestId: null,
    type: 'approve',
    comments: ''
  });

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch available profiles for user
      const profRes = await fetch('/api/profiles/available', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const profData = await profRes.json();
      if (profRes.ok && profData.success) {
        setAvailableProfiles(profData.data.profiles);
        if (profData.data.profiles.length > 0 && !requestForm.profile_id) {
          setRequestForm(prev => ({ ...prev, profile_id: profData.data.profiles[0].id }));
        }
      }

      // 2. Fetch my sessions
      const mySessRes = await fetch('/api/sessions/my', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const mySessData = await mySessRes.json();
      if (mySessRes.ok && mySessData.success) setMySessions(mySessData.data.sessions || []);

      // 3. Fetch persistent access requests (Developer gets own; Admin/DBA gets all)
      const reqRes = await fetch('/api/access-requests', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const reqData = await reqRes.json();
      if (reqRes.ok && reqData.success) setAllRequests(reqData.data.requests || []);

      // 4. Admin queues
      if (isAdminOrDba) {
        const [pendRes, actRes] = await Promise.all([
          fetch('/api/access-requests/pending', { headers: { Authorization: `Bearer ${accessToken}` } }),
          fetch('/api/sessions/active', { headers: { Authorization: `Bearer ${accessToken}` } })
        ]);
        const pendData = await pendRes.json();
        const actData = await actRes.json();
        if (pendRes.ok && pendData.success) setPendingRequests(pendData.data.requests || []);
        if (actRes.ok && actData.success) {
          setActiveSessions(actData.data.sessions || actData.data.active_sessions || []);
        }
      }
    } catch (err) {
      console.error('Error refreshing sessions data:', err);
      setError(err.message || 'Error refreshing sessions data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000);
    return () => clearInterval(interval);
  }, [isAdminOrDba]);

  const handleRequestSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setActionSuccess(null);

    try {
      const res = await fetch('/api/access-requests', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(requestForm)
      });
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Access request rejected');
      }

      setOpenRequestDialog(false);
      setRequestForm({ profile_id: availableProfiles[0]?.id || '', requested_duration_minutes: 60, justification: '' });

      if (data.data.status === 'active' && data.data.credentials) {
        setCredentialsModal({
          open: true,
          credentials: data.data.credentials,
          showPass: false
        });
        setActionSuccess(`Access request #${data.data.requestId} auto-approved by OPA policy and activated!`);
      } else if (data.data.status === 'pending') {
        setActionSuccess(`Access request #${data.data.requestId} submitted: Awaiting Administrator/DBA approval.`);
      } else if (data.data.status === 'denied') {
        setError(`Access request denied by policy: ${data.data.decision?.reasons?.join(', ')}`);
      }

      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDecisionSubmit = async () => {
    const { requestId, type, comments } = decisionDialog;
    try {
      const res = await fetch(`/api/access-requests/${requestId}/${type}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ comments })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Action failed');
      }

      setDecisionDialog({ open: false, requestId: null, type: 'approve', comments: '' });
      setActionSuccess(`Request #${requestId} successfully ${type === 'approve' ? 'approved and activated' : 'denied'}.`);

      if (type === 'approve' && data.data.credentials) {
        setCredentialsModal({
          open: true,
          credentials: data.data.credentials,
          showPass: false
        });
      }

      fetchData();
    } catch (err) {
      setError(err.message);
    }
  };

  const handleRevokeSession = async (sessionId) => {
    try {
      await fetch(`/api/sessions/${sessionId}/revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      setActionSuccess(`Session #${sessionId} was revoked and MySQL user dropped.`);
      fetchData();
    } catch (err) {
      console.error(err);
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
  };

  const getStatusChipColor = (st) => {
    switch (st) {
      case 'active': return 'success';
      case 'pending': return 'warning';
      case 'approved': return 'info';
      case 'denied': return 'error';
      case 'revoked': return 'error';
      default: return 'default';
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Just-In-Time (JIT) Access Sessions & Requests
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Role-governed ephemeral MySQL accounts (<code>jit_&lt;id&gt;_&lt;rand&gt;</code>) with automated lifecycle, OPA decisions & in-app workspace.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button
            startIcon={<TerminalIcon />}
            variant="outlined"
            size="small"
            onClick={() => navigate('/workspace')}
          >
            Open SQL Workspace
          </Button>
          <Button
            startIcon={<RefreshIcon />}
            variant="outlined"
            size="small"
            onClick={fetchData}
            disabled={loading}
          >
            Refresh
          </Button>
          <Button
            startIcon={<AddTaskIcon />}
            variant="contained"
            size="small"
            onClick={() => setOpenRequestDialog(true)}
          >
            Request Access
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>{error}</Alert>}
      {actionSuccess && <Alert severity="success" sx={{ mb: 3 }} onClose={() => setActionSuccess(null)}>{actionSuccess}</Alert>}

      <Tabs
        value={currentTab}
        onChange={(e, val) => setCurrentTab(val)}
        sx={{ mb: 3, borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}
      >
        <Tab label={`My Sessions (${mySessions.length})`} />
        <Tab
          label={
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <span>Access Request Lifecycle</span>
              <Chip label={allRequests.length} size="small" color="default" sx={{ height: 18 }} />
            </Box>
          }
        />
        {isAdminOrDba && (
          <Tab
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <span>Pending Approval Queue</span>
                {pendingRequests.length > 0 && (
                  <Chip label={pendingRequests.length} size="small" color="warning" sx={{ height: 18 }} />
                )}
              </Box>
            }
          />
        )}
        {isAdminOrDba && (
          <Tab label={`Active Global Sessions (${activeSessions.length})`} />
        )}
      </Tabs>

      {/* TAB 0: My Sessions */}
      {currentTab === 0 && (
        <Grid container spacing={3}>
          {mySessions.length === 0 ? (
            <Grid item xs={12}>
              <Paper variant="outlined" sx={{ p: 6, textAlign: 'center' }}>
                <LockOpenIcon sx={{ fontSize: 50, opacity: 0.3, mb: 1.5 }} />
                <Typography variant="h6" sx={{ fontWeight: 600 }}>No Active or Previous Sessions</Typography>
                <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
                  Click "Request Access" to request a Just-In-Time database profile.
                </Typography>
                <Button variant="contained" onClick={() => setOpenRequestDialog(true)}>
                  Request Access Now
                </Button>
              </Paper>
            </Grid>
          ) : (
            mySessions.map((s) => (
              <Grid item xs={12} md={6} key={s.id}>
                <Card sx={{ borderLeft: s.status === 'active' ? '4px solid #66bb6a' : '4px solid rgba(255,255,255,0.2)' }}>
                  <CardHeader
                    title={s.profile_name}
                    titleTypographyProps={{ fontWeight: 700 }}
                    subheader={`Assigned MySQL User: ${s.mysql_username}`}
                    action={
                      <Chip
                        size="small"
                        label={s.status.toUpperCase()}
                        color={getStatusChipColor(s.status)}
                      />
                    }
                  />
                  <CardContent>
                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5, fontWeight: 600 }}>
                      APPROVED OPERATIONS
                    </Typography>
                    <Stack direction="row" spacing={0.5} sx={{ mb: 1.5 }}>
                      {(s.granted_operations || []).map(op => (
                        <Chip key={op} label={op} size="small" variant="filled" color="primary" />
                      ))}
                    </Stack>

                    <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5, fontWeight: 600 }}>
                      TABLE-LEVEL GRANTS
                    </Typography>
                    <Stack direction="row" spacing={0.5} flexWrap="wrap" sx={{ mb: 2 }}>
                      {(s.granted_resources || []).map(res => (
                        <Chip key={res} label={res} size="small" variant="outlined" />
                      ))}
                    </Stack>

                    <Divider sx={{ my: 1.5 }} />

                    <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                        <TimerIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                        <Typography variant="caption" color="text.secondary">
                          Expires: {new Date(s.end_time).toLocaleTimeString()}
                        </Typography>
                      </Box>
                      <Stack direction="row" spacing={1}>
                        {s.status === 'active' && (
                          <Button
                            size="small"
                            variant="contained"
                            color="primary"
                            startIcon={<TerminalIcon />}
                            onClick={() => navigate(`/workspace?sessionId=${s.id}`)}
                          >
                            Open SQL Workspace
                          </Button>
                        )}
                      </Stack>
                    </Box>
                  </CardContent>
                </Card>
              </Grid>
            ))
          )}
        </Grid>
      )}

      {/* TAB 1: Access Request Lifecycle */}
      {currentTab === 1 && (
        <Card>
          <TableContainer component={Paper} variant="outlined" sx={{ border: 'none' }}>
            <Table size="small">
              <TableHead sx={{ backgroundColor: 'rgba(255, 255, 255, 0.04)' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>ID</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Requester</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Access Profile</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Duration</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Justification</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>OPA Decision</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Session / Approver</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {allRequests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={9} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      No access requests found.
                    </TableCell>
                  </TableRow>
                ) : (
                  allRequests.map((req) => (
                    <TableRow key={req.id} hover>
                      <TableCell sx={{ fontWeight: 700 }}>#{req.id}</TableCell>
                      <TableCell>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>{req.username}</Typography>
                        <Typography variant="caption" color="text.secondary">{req.full_name}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600, fontSize: '0.85rem' }}>{req.profile_name}</Typography>
                        <Chip size="small" label={`Risk: ${req.risk_level}`} color="error" variant="outlined" sx={{ height: 18, fontSize: '0.65rem' }} />
                      </TableCell>
                      <TableCell>{req.requested_duration_minutes}m</TableCell>
                      <TableCell sx={{ maxWidth: 220 }}>
                        <Typography variant="body2" sx={{ fontSize: '0.8rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {req.justification}
                        </Typography>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={req.decision_action ? req.decision_action.toUpperCase() : 'PENDING'}
                          color={req.decision_action === 'allow' ? 'success' : req.decision_action === 'deny' ? 'error' : 'warning'}
                          sx={{ height: 20, fontSize: '0.7rem', fontWeight: 700 }}
                        />
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={req.status.toUpperCase()}
                          color={getStatusChipColor(req.status)}
                          sx={{ height: 22, fontSize: '0.75rem', fontWeight: 700 }}
                        />
                      </TableCell>
                      <TableCell>
                        {req.session_id ? (
                          <Typography variant="caption" sx={{ fontFamily: 'monospace', color: 'primary.light', display: 'block', fontWeight: 600 }}>
                            Session #{req.session_id}
                          </Typography>
                        ) : null}
                        {req.approved_by_username ? (
                          <Typography variant="caption" color="text.secondary" display="block">
                            By: {req.approved_by_username}
                          </Typography>
                        ) : (
                          <Typography variant="caption" color="text.disabled">-</Typography>
                        )}
                      </TableCell>
                      <TableCell align="right">
                        {req.status === 'active' && req.session_id ? (
                          <Button
                            size="small"
                            variant="outlined"
                            color="primary"
                            startIcon={<TerminalIcon />}
                            onClick={() => navigate(`/workspace?sessionId=${req.session_id}`)}
                            sx={{ fontSize: '0.7rem' }}
                          >
                            Workspace
                          </Button>
                        ) : req.status === 'pending' && isAdminOrDba ? (
                          <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                            <Button
                              size="small"
                              variant="contained"
                              color="success"
                              onClick={() => setDecisionDialog({ open: true, requestId: req.id, type: 'approve', comments: '' })}
                              sx={{ fontSize: '0.7rem', py: 0.2 }}
                            >
                              Approve
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              color="error"
                              onClick={() => setDecisionDialog({ open: true, requestId: req.id, type: 'deny', comments: '' })}
                              sx={{ fontSize: '0.7rem', py: 0.2 }}
                            >
                              Deny
                            </Button>
                          </Stack>
                        ) : (
                          <Typography variant="caption" color="text.disabled">—</Typography>
                        )}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {/* TAB 2: Pending Approvals Queue (Admin & DBA) */}
      {isAdminOrDba && currentTab === 2 && (
        <Card>
          <TableContainer component={Paper} variant="outlined" sx={{ border: 'none' }}>
            <Table size="small">
              <TableHead sx={{ backgroundColor: 'rgba(255, 255, 255, 0.04)' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>ID</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Requester</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Profile</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Duration</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Justification</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Submitted</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Action</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {pendingRequests.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      No pending requests in queue.
                    </TableCell>
                  </TableRow>
                ) : (
                  pendingRequests.map((req) => (
                    <TableRow key={req.id} hover>
                      <TableCell>#{req.id}</TableCell>
                      <TableCell>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{req.username}</Typography>
                        <Typography variant="caption" color="text.secondary">{req.full_name}</Typography>
                      </TableCell>
                      <TableCell>
                        <Typography variant="body2" sx={{ fontWeight: 600 }}>{req.profile_name}</Typography>
                        <Chip size="small" label={`Risk: ${req.risk_level}`} color="error" variant="outlined" sx={{ height: 18 }} />
                      </TableCell>
                      <TableCell>{req.requested_duration_minutes} min</TableCell>
                      <TableCell sx={{ maxWidth: 260 }}>
                        <Typography variant="body2">{req.justification}</Typography>
                      </TableCell>
                      <TableCell>{new Date(req.created_at).toLocaleTimeString()}</TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                          <Button
                            size="small"
                            variant="contained"
                            color="success"
                            startIcon={<CheckCircleIcon />}
                            onClick={() => setDecisionDialog({ open: true, requestId: req.id, type: 'approve', comments: '' })}
                          >
                            Approve
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            startIcon={<CancelIcon />}
                            onClick={() => setDecisionDialog({ open: true, requestId: req.id, type: 'deny', comments: '' })}
                          >
                            Deny
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {/* TAB 3: Active Global Sessions (Admin & DBA) */}
      {isAdminOrDba && currentTab === 3 && (
        <Card>
          <TableContainer component={Paper} variant="outlined" sx={{ border: 'none' }}>
            <Table size="small">
              <TableHead sx={{ backgroundColor: 'rgba(255, 255, 255, 0.04)' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Session ID</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Employee</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>MySQL Ephemeral User</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Profile</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Expires At</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Immediate Teardown</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {activeSessions.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      No active JIT sessions currently running.
                    </TableCell>
                  </TableRow>
                ) : (
                  activeSessions.map((s) => (
                    <TableRow key={s.id} hover>
                      <TableCell>#{s.id}</TableCell>
                      <TableCell>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{s.username}</Typography>
                        <Typography variant="caption" color="text.secondary">{s.email}</Typography>
                      </TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', color: 'primary.light', fontWeight: 600 }}>
                        {s.mysql_username}
                      </TableCell>
                      <TableCell>{s.profile_name}</TableCell>
                      <TableCell>{new Date(s.end_time).toLocaleTimeString()}</TableCell>
                      <TableCell align="right">
                        <Stack direction="row" spacing={1} justifyContent="flex-end">
                          <Button
                            size="small"
                            variant="outlined"
                            color="primary"
                            startIcon={<TerminalIcon />}
                            onClick={() => navigate(`/workspace?sessionId=${s.id}`)}
                          >
                            Workspace
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            startIcon={<DeleteForeverIcon />}
                            onClick={() => handleRevokeSession(s.id)}
                          >
                            Revoke User
                          </Button>
                        </Stack>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      )}

      {/* Request Access Dialog */}
      <Dialog open={openRequestDialog} onClose={() => setOpenRequestDialog(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleRequestSubmit}>
          <DialogTitle>Request Just-In-Time Database Access</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 2 }}>
            <FormControl fullWidth>
              <InputLabel id="profile-select-label">Access Profile</InputLabel>
              <Select
                labelId="profile-select-label"
                value={requestForm.profile_id}
                label="Access Profile"
                onChange={(e) => setRequestForm({ ...requestForm, profile_id: e.target.value })}
              >
                {availableProfiles.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    {p.name} ({p.requires_approval ? 'Requires Approval' : 'Auto-Approve'})
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <Box>
              <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                Session Duration: <strong>{requestForm.requested_duration_minutes} Minutes</strong>
              </Typography>
              <Slider
                value={requestForm.requested_duration_minutes}
                min={15}
                max={240}
                step={15}
                marks={[
                  { value: 15, label: '15m' },
                  { value: 60, label: '1h' },
                  { value: 120, label: '2h' },
                  { value: 240, label: '4h' }
                ]}
                onChange={(e, val) => setRequestForm({ ...requestForm, requested_duration_minutes: val })}
              />
            </Box>

            <TextField
              label="Business Justification & Ticket Reference"
              required
              fullWidth
              multiline
              rows={3}
              placeholder="e.g. Investigating transaction reconciliation ticket #TX-4892..."
              value={requestForm.justification}
              onChange={(e) => setRequestForm({ ...requestForm, justification: e.target.value })}
            />
          </DialogContent>
          <DialogActions sx={{ p: 2.5 }}>
            <Button onClick={() => setOpenRequestDialog(false)} disabled={submitting}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={submitting}>
              {submitting ? 'Evaluating with OPA...' : 'Submit Request'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* ONE-TIME CREDENTIALS MODAL */}
      <Dialog
        open={credentialsModal.open}
        onClose={() => setCredentialsModal({ ...credentialsModal, open: false })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ backgroundColor: 'rgba(76, 175, 80, 0.1)', display: 'flex', alignItems: 'center', gap: 1 }}>
          <CheckCircleIcon color="success" />
          <span>JIT Database Credentials Issued</span>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Alert severity="warning" sx={{ mb: 2.5 }}>
            <strong>Ephemeral JIT credentials provisioned.</strong> You can connect externally with DBeaver/Workbench, or execute queries immediately inside the In-App SQL Workspace.
          </Alert>

          {credentialsModal.credentials && (
            <Paper variant="outlined" sx={{ p: 2, backgroundColor: '#050811', fontFamily: 'monospace' }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>Host:</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{credentialsModal.credentials.host}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>Port:</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{credentialsModal.credentials.port}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 1 }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>Database:</Typography>
                <Typography variant="body2" sx={{ fontWeight: 600 }}>{credentialsModal.credentials.database}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>Username:</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: 'primary.light' }}>
                    {credentialsModal.credentials.username}
                  </Typography>
                  <IconButton size="small" onClick={() => copyToClipboard(credentialsModal.credentials.username)}>
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>Password:</Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                  <Typography variant="body2" sx={{ fontWeight: 700, color: 'success.light' }}>
                    {credentialsModal.showPass ? credentialsModal.credentials.password : '••••••••••••••••'}
                  </Typography>
                  <IconButton
                    size="small"
                    onClick={() => setCredentialsModal(prev => ({ ...prev, showPass: !prev.showPass }))}
                  >
                    {credentialsModal.showPass ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                  </IconButton>
                  <IconButton size="small" onClick={() => copyToClipboard(credentialsModal.credentials.password)}>
                    <ContentCopyIcon fontSize="small" />
                  </IconButton>
                </Box>
              </Box>
            </Paper>
          )}
        </DialogContent>
        <DialogActions sx={{ p: 2, justifyContent: 'space-between' }}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<TerminalIcon />}
            onClick={() => {
              setCredentialsModal({ ...credentialsModal, open: false });
              navigate('/workspace');
            }}
          >
            Open in SQL Workspace
          </Button>
          <Button
            variant="outlined"
            onClick={() => setCredentialsModal({ ...credentialsModal, open: false })}
          >
            I Have Saved These Credentials
          </Button>
        </DialogActions>
      </Dialog>

      {/* Admin/DBA Approve / Deny Dialog */}
      <Dialog
        open={decisionDialog.open}
        onClose={() => setDecisionDialog({ ...decisionDialog, open: false })}
        maxWidth="xs"
        fullWidth
      >
        <DialogTitle>
          {decisionDialog.type === 'approve' ? 'Approve Access Request' : 'Deny Access Request'}
        </DialogTitle>
        <DialogContent sx={{ pt: 2 }}>
          <TextField
            label="Administrator/DBA Comments / Notes"
            multiline
            rows={2}
            fullWidth
            value={decisionDialog.comments}
            onChange={(e) => setDecisionDialog({ ...decisionDialog, comments: e.target.value })}
          />
        </DialogContent>
        <DialogActions sx={{ p: 2 }}>
          <Button onClick={() => setDecisionDialog({ ...decisionDialog, open: false })}>Cancel</Button>
          <Button
            variant="contained"
            color={decisionDialog.type === 'approve' ? 'success' : 'error'}
            onClick={handleDecisionSubmit}
          >
            Confirm {decisionDialog.type === 'approve' ? 'Approval' : 'Denial'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
