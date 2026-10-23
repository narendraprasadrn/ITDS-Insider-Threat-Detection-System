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
import BootstrapIcon from '../components/common/BootstrapIcon.jsx';
import { useAuth } from '../context/AuthContext.jsx';

export default function SessionsPage() {
  const { user, accessToken, hasRole } = useAuth();
  const navigate = useNavigate();

  const userRoles = Array.isArray(user?.roles) ? user.roles : (user?.role ? [user.role] : []);
  const isAdmin = userRoles.includes('admin') || user?.role === 'admin';
  const isDba = userRoles.includes('dba') || user?.role === 'dba';
  const isElevated = isAdmin || isDba;

  // Active tab index
  const [currentTab, setCurrentTab] = useState(0);

  // Authoritative data state
  const [availableProfiles, setAvailableProfiles] = useState([]);
  const [mySessions, setMySessions] = useState([]);
  const [allRequests, setAllRequests] = useState([]);
  const [pendingRequests, setPendingRequests] = useState([]);
  const [activeSessions, setActiveSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  // Administrative Access Provisioning Dialog (Admin Only)
  const [openAdminDialog, setOpenAdminDialog] = useState(false);
  const [adminProvisionForm, setAdminProvisionForm] = useState({
    profile_id: 7,
    duration_minutes: 60
  });
  const [provisioningAdmin, setProvisioningAdmin] = useState(false);

  // Employee Request Access Dialog (Developer & DBA)
  const [openRequestDialog, setOpenRequestDialog] = useState(false);
  const [requestForm, setRequestForm] = useState({
    profile_id: '',
    requested_duration_minutes: 60,
    justification: ''
  });
  const [submitting, setSubmitting] = useState(false);

  // One-Time Credentials Modal
  const [credentialsModal, setCredentialsModal] = useState({
    open: false,
    credentials: null,
    showPass: false
  });

  // Admin/DBA Approval Decision Dialog
  const [decisionDialog, setDecisionDialog] = useState({
    open: false,
    requestId: null,
    type: 'approve',
    comments: ''
  });
  const [isDeciding, setIsDeciding] = useState(false);
  const [revokingId, setRevokingId] = useState(null);

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
        const profs = profData.data.profiles || [];
        setAvailableProfiles(profs);
        if (profs.length > 0 && !requestForm.profile_id) {
          const first = profs[0];
          setRequestForm(prev => ({
            ...prev,
            profile_id: first.id,
            requested_duration_minutes: Math.min(60, first.max_duration_minutes || 60)
          }));
        }
        if (profs.length > 0 && isAdmin) {
          const adminProf = profs.find(p => p.id === 7) || profs[0];
          setAdminProvisionForm(prev => ({
            ...prev,
            profile_id: adminProf.id,
            duration_minutes: Math.min(60, adminProf.max_duration_minutes || 60)
          }));
        }
      }

      // 2. Fetch my sessions (for admin: administrative sessions; for employee: own JIT sessions)
      const mySessRes = await fetch('/api/sessions/my', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const mySessData = await mySessRes.json();
      if (mySessRes.ok && mySessData.success) {
        setMySessions(mySessData.data.sessions || []);
      }

      // 3. Fetch access requests (Developer gets own; Admin/DBA gets all)
      const reqRes = await fetch('/api/access-requests', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const reqData = await reqRes.json();
      if (reqRes.ok && reqData.success) {
        setAllRequests(reqData.data.requests || []);
      }

      // 4. Admin / DBA queues
      if (isElevated) {
        const [pendRes, actRes] = await Promise.all([
          fetch('/api/access-requests/pending', { headers: { Authorization: `Bearer ${accessToken}` } }),
          fetch('/api/sessions/active', { headers: { Authorization: `Bearer ${accessToken}` } })
        ]);
        const pendData = await pendRes.json();
        const actData = await actRes.json();
        if (pendRes.ok && pendData.success) {
          setPendingRequests(pendData.data.requests || []);
        }
        if (actRes.ok && actData.success) {
          setActiveSessions(actData.data.sessions || actData.data.active_sessions || []);
        }
      }
    } catch (err) {
      console.error('Error refreshing sessions data:', err);
      setError(err.message || 'Error communicating with backend service');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      // Background poll only if not actively submitting or reviewing
      if (!submitting && !isDeciding && !provisioningAdmin) {
        fetchData();
      }
    }, 15000);
    return () => clearInterval(interval);
  }, [isElevated, accessToken]);

  const selectedProfile = availableProfiles.find(p => p.id === requestForm.profile_id) || availableProfiles[0];
  const isAutoApprove = Boolean(selectedProfile && !selectedProfile.requires_approval);
  const maxAllowedDuration = selectedProfile?.max_duration_minutes || 60;

  const sliderMarks = [
    { value: 15, label: '15m' },
    ...(maxAllowedDuration >= 30 ? [{ value: 30, label: '30m' }] : []),
    ...(maxAllowedDuration >= 60 ? [{ value: 60, label: '1h' }] : []),
    ...(maxAllowedDuration >= 90 ? [{ value: 90, label: '1.5h' }] : []),
    ...(maxAllowedDuration >= 120 ? [{ value: 120, label: '2h' }] : []),
    ...(maxAllowedDuration > 120 ? [{ value: maxAllowedDuration, label: `${maxAllowedDuration}m` }] : [])
  ];

  // Employee Access Request Submit
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
      const defaultProf = availableProfiles[0];
      setRequestForm({
        profile_id: defaultProf?.id || '',
        requested_duration_minutes: Math.min(60, defaultProf?.max_duration_minutes || 60),
        justification: ''
      });

      if ((data.data.status === 'active' || data.data.status === 'approved') && data.data.credentials) {
        setCredentialsModal({
          open: true,
          credentials: data.data.credentials,
          showPass: false
        });
        setActionSuccess(`JIT Session #${data.data.sessionId} activated immediately! Ephemeral MySQL user provisioned.`);
      } else if (data.data.status === 'pending') {
        const msg = data.data.has_independent_approver === false
          ? `Access request #${data.data.requestId} submitted, but no independent approver is currently configured in the system.`
          : `Access request #${data.data.requestId} submitted: Awaiting independent Administrator/DBA approval.`;
        setActionSuccess(msg);
      } else if (data.data.status === 'denied') {
        setError(`Access request denied by policy: ${data.data.decision?.reasons?.join(', ') || 'Access denied'}`);
      }

      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Administrator Provisioning Action
  const handleAdminProvisionSubmit = async () => {
    setProvisioningAdmin(true);
    setError(null);
    setActionSuccess(null);

    try {
      const targetProf = availableProfiles.find(p => p.id === adminProvisionForm.profile_id);

      // If sensitive profile requiring independent review
      if (targetProf && targetProf.requires_approval) {
        const res = await fetch('/api/access-requests', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${accessToken}`
          },
          body: JSON.stringify({
            profile_id: targetProf.id,
            requested_duration_minutes: adminProvisionForm.duration_minutes,
            justification: 'Elevated administrative maintenance operation requiring independent second-person authorization.'
          })
        });
        const data = await res.json();
        if (!res.ok || !data.success) {
          throw new Error(data.error?.message || 'Access request failed');
        }
        setOpenAdminDialog(false);
        setActionSuccess(`Elevated request #${data.data.requestId} submitted for independent second-person approval. Self-approval is prohibited.`);
        fetchData();
        return;
      }

      // Explicit direct administrative provisioning
      const res = await fetch('/api/sessions/admin-provision', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          profile_id: adminProvisionForm.profile_id,
          duration_minutes: adminProvisionForm.duration_minutes
        })
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Administrative session provisioning failed');
      }

      setOpenAdminDialog(false);
      if (data.data.credentials) {
        setCredentialsModal({
          open: true,
          credentials: data.data.credentials,
          showPass: false
        });
      }
      setActionSuccess(`Administrative JIT Session #${data.data.sessionId} provisioned and active! Ephemeral MySQL user created.`);
      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setProvisioningAdmin(false);
    }
  };

  // Admin/DBA Approval or Denial Action
  const handleDecisionSubmit = async () => {
    const { requestId, type, comments } = decisionDialog;
    setIsDeciding(true);
    setError(null);
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
    } finally {
      setIsDeciding(false);
    }
  };

  // Session Revocation
  const handleRevokeSession = async (sessionId) => {
    setRevokingId(sessionId);
    try {
      const res = await fetch(`/api/sessions/${sessionId}/revoke`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        throw new Error(data.error?.message || 'Failed to revoke session');
      }
      setActionSuccess(`Session #${sessionId} was revoked and MySQL user dropped.`);
      fetchData();
    } catch (err) {
      setError(err.message);
    } finally {
      setRevokingId(null);
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

  // Shared Sub-Views for Tabs
  const renderPendingQueue = () => (
    <Card sx={{ bgcolor: '#252E30', border: '1px solid #364345' }}>
      <TableContainer component={Paper} variant="outlined" sx={{ border: 'none', bgcolor: 'transparent' }}>
        <Table size="small">
          <TableHead sx={{ backgroundColor: 'rgba(255, 255, 255, 0.04)' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>ID</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Requester</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Access Profile</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Duration</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Justification</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Submitted</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {pendingRequests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                    <BootstrapIcon name="bi-shield-check" size={32} color="#55E6C1" />
                    <Typography variant="subtitle1" sx={{ color: '#F5F7F7', fontWeight: 600 }}>
                      No Pending Access Requests
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#AAB8BC' }}>
                      All employee JIT access requests have been reviewed and evaluated.
                    </Typography>
                  </Box>
                </TableCell>
              </TableRow>
            ) : (
              pendingRequests.map((req) => (
                <TableRow key={req.id} hover>
                  <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700 }}>#{req.id}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <BootstrapIcon name="bi-person-circle" size={16} color="#55E6C1" />
                      <Box>
                        <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{req.username}</Typography>
                        <Typography variant="caption" color="text.secondary">{req.full_name || req.email}</Typography>
                      </Box>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{req.profile_name}</Typography>
                    {req.request_type === 'table' ? (
                      <Chip size="small" label={`Table Grant: ${req.target_table}`} color="info" variant="outlined" sx={{ height: 18, fontSize: '0.65rem' }} />
                    ) : (
                      <Chip size="small" label={`Risk: ${req.risk_level}`} color="error" variant="outlined" sx={{ height: 18, fontSize: '0.65rem' }} />
                    )}
                  </TableCell>
                  <TableCell>{req.requested_duration_minutes} min</TableCell>
                  <TableCell sx={{ maxWidth: 260 }}>
                    <Typography variant="body2" sx={{ fontSize: '0.82rem' }}>{req.justification}</Typography>
                  </TableCell>
                  <TableCell>{new Date(req.created_at).toLocaleTimeString()}</TableCell>
                  <TableCell align="right">
                    {req.user_id === user?.id ? (
                      <Tooltip title="Self-approval is prohibited. Another administrator or DBA must review your request.">
                        <Chip
                          icon={<BootstrapIcon name="bi-person-x-fill" size={12} />}
                          label="Self-Approval Prohibited"
                          size="small"
                          variant="outlined"
                          color="warning"
                          sx={{ fontSize: '0.65rem', height: 22, fontWeight: 600 }}
                        />
                      </Tooltip>
                    ) : (!isAdmin && (req.risk_level === 'critical' || ['Payroll', 'TaxRecords', 'SecurityAuditLogs'].includes(req.target_table))) ? (
                      <Tooltip title="This request involves critical sensitivity resources (Payroll, TaxRecords, or SecurityAuditLogs). Only an Administrator can approve.">
                        <Chip
                          icon={<BootstrapIcon name="bi-shield-lock" size={12} />}
                          label="Admin Only (Critical)"
                          size="small"
                          variant="outlined"
                          color="error"
                          sx={{ fontSize: '0.65rem', height: 22, fontWeight: 600 }}
                        />
                      </Tooltip>
                    ) : req.independent_approver_count === 0 ? (
                      <Tooltip title="No other authorized approver exists in the system to review this request.">
                        <Chip
                          icon={<BootstrapIcon name="bi-exclamation-triangle" size={12} />}
                          label="No Approver Available"
                          size="small"
                          variant="outlined"
                          color="error"
                          sx={{ fontSize: '0.65rem', height: 22, fontWeight: 600 }}
                        />
                      </Tooltip>
                    ) : (
                      <Stack direction="row" spacing={1} justifyContent="flex-end">
                        <Button
                          size="small"
                          variant="contained"
                          color="success"
                          disabled={isDeciding}
                          startIcon={<BootstrapIcon name="bi-check-circle" size={15} />}
                          onClick={() => setDecisionDialog({ open: true, requestId: req.id, type: 'approve', comments: '' })}
                        >
                          Approve
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          disabled={isDeciding}
                          startIcon={<BootstrapIcon name="bi-shield-x" size={15} />}
                          onClick={() => setDecisionDialog({ open: true, requestId: req.id, type: 'deny', comments: '' })}
                        >
                          Deny
                        </Button>
                      </Stack>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </TableContainer>
    </Card>
  );

  const renderRequestLifecycle = () => (
    <Card sx={{ bgcolor: '#252E30', border: '1px solid #364345' }}>
      <TableContainer component={Paper} variant="outlined" sx={{ border: 'none', bgcolor: 'transparent' }}>
        <Table size="small">
          <TableHead sx={{ bgcolor: 'rgba(255, 255, 255, 0.04)' }}>
            <TableRow>
              <TableCell sx={{ fontWeight: 600 }}>ID</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Requester</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Access Profile</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Duration</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Decision Flow</TableCell>
              <TableCell sx={{ fontWeight: 600 }}>Approval Metadata</TableCell>
              <TableCell align="right" sx={{ fontWeight: 600 }}>Action</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {allRequests.length === 0 ? (
              <TableRow>
                <TableCell colSpan={8} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                    <BootstrapIcon name="bi-journal-text" size={32} color="#AAB8BC" />
                    <Typography variant="subtitle1" sx={{ color: '#F5F7F7', fontWeight: 600 }}>
                      No Access Requests Recorded
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#AAB8BC' }}>
                      No database access requests have been logged in the system.
                    </Typography>
                  </Box>
                </TableCell>
              </TableRow>
            ) : (
              allRequests.map((req) => (
                <TableRow key={req.id} hover>
                  <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700 }}>#{req.id}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75 }}>
                      <BootstrapIcon name="bi-person-circle" size={15} color="#55E6C1" />
                      <Typography variant="body2" sx={{ fontWeight: 600 }}>{req.username}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Typography variant="body2" sx={{ fontWeight: 600 }}>{req.profile_name}</Typography>
                    {req.request_type === 'table' ? (
                      <Chip
                        size="small"
                        label={`Table Grant: ${req.target_table}`}
                        color="info"
                        variant="outlined"
                        sx={{ height: 16, fontSize: '0.6rem', mt: 0.3 }}
                      />
                    ) : (
                      <Chip
                        size="small"
                        label={req.requires_approval ? 'Approval Required' : 'Auto-Approve'}
                        color={req.requires_approval ? 'warning' : 'success'}
                        variant="outlined"
                        sx={{ height: 16, fontSize: '0.6rem', mt: 0.3 }}
                      />
                    )}
                  </TableCell>
                  <TableCell>{req.requested_duration_minutes} min</TableCell>
                  <TableCell>
                    <Chip
                      label={req.status.toUpperCase()}
                      color={getStatusChipColor(req.status)}
                      size="small"
                      sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700 }}
                    />
                  </TableCell>
                  <TableCell>
                    <Chip
                      label={req.decision_action === 'allow' ? 'AUTO-APPROVED' : req.decision_action === 'require_approval' ? 'INDEPENDENT REVIEW' : 'DENIED'}
                      size="small"
                      color={req.decision_action === 'allow' ? 'success' : req.decision_action === 'require_approval' ? 'warning' : 'error'}
                      variant="outlined"
                      sx={{ height: 20, fontSize: '0.62rem', fontWeight: 600 }}
                    />
                  </TableCell>
                  <TableCell>
                    {req.approved_by_username ? (
                      <Typography variant="caption" sx={{ color: '#55E6C1' }}>
                        By {req.approved_by_username} at {new Date(req.approved_at).toLocaleTimeString()}
                      </Typography>
                    ) : req.status === 'pending' ? (
                      req.user_id === user?.id ? (
                        <Typography variant="caption" sx={{ color: '#FCD34D' }}>
                          Awaiting independent reviewer
                        </Typography>
                      ) : (
                        <Typography variant="caption" sx={{ color: '#FCD34D' }}>
                          Pending administrative action
                        </Typography>
                      )
                    ) : (
                      <Typography variant="caption" color="text.disabled">—</Typography>
                    )}
                  </TableCell>
                  <TableCell align="right">
                    {req.status === 'active' && req.session_id ? (
                      <Button
                        size="small"
                        variant="outlined"
                        color="primary"
                        startIcon={<BootstrapIcon name="bi-terminal" size={14} />}
                        onClick={() => navigate(`/workspace?sessionId=${req.session_id}`)}
                        sx={{ fontSize: '0.7rem' }}
                      >
                        Workspace
                      </Button>
                    ) : req.status === 'pending' ? (
                      req.user_id === user?.id ? (
                        <Tooltip title="Self-approval is strictly prohibited. An independent administrator or DBA must review your request.">
                          <Chip
                            icon={<BootstrapIcon name="bi-person-x-fill" size={12} />}
                            label="Self-Approval Prohibited"
                            size="small"
                            variant="outlined"
                            color="warning"
                            sx={{ fontSize: '0.65rem', height: 22, fontWeight: 600 }}
                          />
                        </Tooltip>
                      ) : (!isAdmin && (req.risk_level === 'critical' || ['Payroll', 'TaxRecords', 'SecurityAuditLogs'].includes(req.target_table))) ? (
                        <Tooltip title="This request involves critical sensitivity resources (Payroll, TaxRecords, or SecurityAuditLogs). Only an Administrator can approve.">
                          <Chip
                            icon={<BootstrapIcon name="bi-shield-lock" size={12} />}
                            label="Admin Only (Critical)"
                            size="small"
                            variant="outlined"
                            color="error"
                            sx={{ fontSize: '0.65rem', height: 22, fontWeight: 600 }}
                          />
                        </Tooltip>
                      ) : isElevated ? (
                        <Stack direction="row" spacing={0.5} justifyContent="flex-end">
                          <Button
                            size="small"
                            variant="contained"
                            color="success"
                            disabled={isDeciding}
                            startIcon={<BootstrapIcon name="bi-check-circle" size={14} />}
                            onClick={() => setDecisionDialog({ open: true, requestId: req.id, type: 'approve', comments: '' })}
                            sx={{ fontSize: '0.7rem', py: 0.2 }}
                          >
                            Approve
                          </Button>
                          <Button
                            size="small"
                            variant="outlined"
                            color="error"
                            disabled={isDeciding}
                            startIcon={<BootstrapIcon name="bi-shield-x" size={14} />}
                            onClick={() => setDecisionDialog({ open: true, requestId: req.id, type: 'deny', comments: '' })}
                            sx={{ fontSize: '0.7rem', py: 0.2 }}
                          >
                            Deny
                          </Button>
                        </Stack>
                      ) : (
                        <Chip label="Pending Review" size="small" variant="outlined" color="warning" sx={{ height: 20, fontSize: '0.65rem' }} />
                      )
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
  );

  const renderActiveGlobalSessions = () => (
    <Card sx={{ bgcolor: '#252E30', border: '1px solid #364345' }}>
      <TableContainer component={Paper} variant="outlined" sx={{ border: 'none', bgcolor: 'transparent' }}>
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
                <TableCell colSpan={6} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                  <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 1 }}>
                    <BootstrapIcon name="bi-database" size={32} color="#AAB8BC" />
                    <Typography variant="subtitle1" sx={{ color: '#F5F7F7', fontWeight: 600 }}>
                      No Active JIT Sessions Found
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#AAB8BC' }}>
                      There are currently no active ephemeral MySQL database connections.
                    </Typography>
                  </Box>
                </TableCell>
              </TableRow>
            ) : (
              activeSessions.map((s) => (
                <TableRow key={s.id} hover>
                  <TableCell sx={{ fontFamily: 'monospace', fontWeight: 700 }}>#{s.id}</TableCell>
                  <TableCell>
                    <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{s.username}</Typography>
                    <Typography variant="caption" color="text.secondary">{s.email}</Typography>
                  </TableCell>
                  <TableCell sx={{ fontFamily: 'monospace', color: '#55E6C1', fontWeight: 600 }}>
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
                        startIcon={<BootstrapIcon name="bi-terminal" size={14} />}
                        onClick={() => navigate(`/workspace?sessionId=${s.id}`)}
                      >
                        Workspace
                      </Button>
                      <Button
                        size="small"
                        variant="outlined"
                        color="error"
                        disabled={revokingId === s.id}
                        startIcon={revokingId === s.id ? <CircularProgress size={12} color="inherit" /> : <BootstrapIcon name="bi-shield-x" size={14} />}
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
  );

  const renderMySessions = () => (
    <Grid container spacing={3}>
      {mySessions.length === 0 ? (
        <Grid item xs={12}>
          <Paper sx={{ p: 5, textAlign: 'center', bgcolor: '#252E30', border: '1px solid #364345' }}>
            <BootstrapIcon name={isAdmin ? "bi-shield-lock" : "bi-key"} size={36} color="#55E6C1" />
            <Typography variant="h6" sx={{ mt: 1.5, color: '#F5F7F7', fontWeight: 600 }}>
              {isAdmin ? "No Active Administrative Database Sessions" : "No Active JIT Ephemeral Credentials"}
            </Typography>
            <Typography variant="body2" sx={{ color: '#AAB8BC', mt: 0.5, mb: 3 }}>
              {isAdmin
                ? "You currently have no active administrative sessions. Launch a time-bounded administrative session under explicit administrative authorization policy."
                : "You currently have no active database sessions. Select an authorized access profile to begin."}
            </Typography>
            {isAdmin ? (
              <Button
                variant="contained"
                startIcon={<BootstrapIcon name="bi-shield-check" size={16} />}
                onClick={() => setOpenAdminDialog(true)}
                sx={{ bgcolor: '#55E6C1', color: '#171B1C', fontWeight: 700, '&:hover': { bgcolor: '#45D1AC' } }}
              >
                Provision Admin Session
              </Button>
            ) : (
              <Button
                variant="contained"
                startIcon={<BootstrapIcon name="bi-key-fill" size={15} />}
                onClick={() => setOpenRequestDialog(true)}
              >
                Request JIT Access
              </Button>
            )}
          </Paper>
        </Grid>
      ) : (
        mySessions.map((sess) => (
          <Grid item xs={12} md={6} key={sess.id}>
            <Card sx={{ bgcolor: '#252E30', border: '1px solid #364345' }}>
              <CardHeader
                avatar={<BootstrapIcon name="bi-shield-lock-fill" size={18} color="#55E6C1" />}
                title={<Typography variant="subtitle1" sx={{ fontWeight: 700, color: '#F5F7F7' }}>Session #{sess.id} — {sess.profile_name}</Typography>}
                subheader={<Typography variant="caption" sx={{ color: '#AAB8BC' }}>Granted: {new Date(sess.start_time).toLocaleString()}</Typography>}
                action={<Chip label={sess.status.toUpperCase()} color={getStatusChipColor(sess.status)} size="small" sx={{ fontWeight: 700 }} />}
              />
              <Divider sx={{ borderColor: '#364345' }} />
              <CardContent sx={{ pt: 2 }}>
                <Stack spacing={1.5}>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption" sx={{ color: '#AAB8BC' }}>Ephemeral MySQL User:</Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 700, color: '#55E6C1' }}>
                      {sess.mysql_username}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption" sx={{ color: '#AAB8BC' }}>Target Database:</Typography>
                    <Typography variant="body2" sx={{ fontFamily: 'monospace', color: '#F5F7F7' }}>
                      {sess.target_db || 'itds_db'}
                    </Typography>
                  </Box>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                    <Typography variant="caption" sx={{ color: '#AAB8BC' }}>Session Expires At:</Typography>
                    <Typography variant="body2" sx={{ color: '#FCD34D', fontWeight: 600 }}>
                      {new Date(sess.end_time).toLocaleTimeString()}
                    </Typography>
                  </Box>
                  <Divider sx={{ borderColor: '#364345' }} />
                  <Box sx={{ display: 'flex', gap: 1, justifyContent: 'flex-end', pt: 0.5 }}>
                    {sess.status === 'active' && (
                      <>
                        <Button
                          size="small"
                          variant="contained"
                          startIcon={<BootstrapIcon name="bi-terminal" size={14} />}
                          onClick={() => navigate(`/workspace?sessionId=${sess.id}`)}
                        >
                          Open in Workspace
                        </Button>
                        <Button
                          size="small"
                          variant="outlined"
                          color="error"
                          disabled={revokingId === sess.id}
                          startIcon={revokingId === sess.id ? <CircularProgress size={12} color="inherit" /> : <BootstrapIcon name="bi-shield-x" size={14} />}
                          onClick={() => handleRevokeSession(sess.id)}
                        >
                          Release Session
                        </Button>
                      </>
                    )}
                  </Box>
                </Stack>
              </CardContent>
            </Card>
          </Grid>
        ))
      )}
    </Grid>
  );

  return (
    <Box>
      {/* Top Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#F5F7F7', display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <BootstrapIcon name="bi-key-fill" size={24} color="#55E6C1" />
            {isAdmin ? 'JIT Access Governance & Approvals' : 'JIT Access Sessions & Requests'}
          </Typography>
          <Typography variant="body2" sx={{ color: '#AAB8BC', mt: 0.5 }}>
            {isAdmin
              ? 'Administrative governance, policy evaluation, second-person approvals & active session oversight.'
              : 'Role-governed ephemeral MySQL accounts with automated lifecycle, OPA decisions & in-app workspace.'}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button
            startIcon={<BootstrapIcon name="bi-terminal" size={15} />}
            variant="outlined"
            size="small"
            onClick={() => navigate('/workspace')}
          >
            Open SQL Workspace
          </Button>
          <Button
            startIcon={<BootstrapIcon name="bi-arrow-clockwise" size={15} />}
            variant="outlined"
            size="small"
            onClick={fetchData}
            disabled={loading}
          >
            Refresh
          </Button>
          {isAdmin ? (
            <Button
              startIcon={<BootstrapIcon name="bi-shield-check" size={15} />}
              variant="contained"
              size="small"
              onClick={() => {
                const adminProf = availableProfiles.find(p => p.id === 7) || availableProfiles[0];
                setAdminProvisionForm({
                  profile_id: adminProf ? adminProf.id : 7,
                  duration_minutes: 60
                });
                setOpenAdminDialog(true);
              }}
              sx={{ bgcolor: '#55E6C1', color: '#171B1C', fontWeight: 700, '&:hover': { bgcolor: '#45D1AC' } }}
            >
              Provision Admin Session
            </Button>
          ) : (
            <Button
              startIcon={<BootstrapIcon name="bi-key-fill" size={15} />}
              variant="contained"
              size="small"
              onClick={() => {
                if (availableProfiles.length > 0 && !requestForm.profile_id) {
                  const first = availableProfiles[0];
                  setRequestForm({
                    profile_id: first.id,
                    requested_duration_minutes: Math.min(60, first.max_duration_minutes || 60),
                    justification: ''
                  });
                }
                setOpenRequestDialog(true);
              }}
            >
              Request JIT Access
            </Button>
          )}
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }} onClose={() => setError(null)}>{error}</Alert>}
      {actionSuccess && <Alert severity="success" sx={{ mb: 3 }} onClose={() => setActionSuccess(null)}>{actionSuccess}</Alert>}

      {/* Role-governed tabs */}
      <Tabs
        value={currentTab}
        onChange={(e, val) => setCurrentTab(val)}
        sx={{ mb: 3, borderBottom: '1px solid #364345' }}
      >
        {isElevated ? [
          <Tab
            key="pending"
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <BootstrapIcon name="bi-hourglass-split" size={14} color={pendingRequests.length > 0 ? '#F59E0B' : '#AAB8BC'} />
                <span>Pending Approvals Queue</span>
                {pendingRequests.length > 0 && (
                  <Chip label={pendingRequests.length} size="small" color="warning" sx={{ height: 18, fontWeight: 700 }} />
                )}
              </Box>
            }
          />,
          <Tab
            key="lifecycle"
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <BootstrapIcon name="bi-journal-text" size={14} />
                <span>Access Request Lifecycle</span>
                <Chip label={allRequests.length} size="small" color="default" sx={{ height: 18 }} />
              </Box>
            }
          />,
          <Tab
            key="global"
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <BootstrapIcon name="bi-activity" size={14} color="#55E6C1" />
                <span>Active Global Sessions</span>
                <Chip label={activeSessions.length} size="small" color="success" sx={{ height: 18 }} />
              </Box>
            }
          />,
          <Tab
            key="mysessions"
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <BootstrapIcon name="bi-key-fill" size={14} />
                <span>{isAdmin ? 'My Admin Sessions' : 'My Sessions'}</span>
                <Chip label={mySessions.length} size="small" color="default" sx={{ height: 18 }} />
              </Box>
            }
          />
        ] : [
          <Tab
            key="dev-sessions"
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <BootstrapIcon name="bi-key-fill" size={14} color="#55E6C1" />
                <span>My Sessions</span>
                <Chip label={mySessions.length} size="small" color="default" sx={{ height: 18 }} />
              </Box>
            }
          />,
          <Tab
            key="dev-requests"
            label={
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <BootstrapIcon name="bi-journal-text" size={14} />
                <span>My Access Requests</span>
                <Chip label={allRequests.length} size="small" color="default" sx={{ height: 18 }} />
              </Box>
            }
          />
        ]}
      </Tabs>

      {/* TAB CONTENT */}
      {isElevated ? (
        <>
          {currentTab === 0 && renderPendingQueue()}
          {currentTab === 1 && renderRequestLifecycle()}
          {currentTab === 2 && renderActiveGlobalSessions()}
          {currentTab === 3 && renderMySessions()}
        </>
      ) : (
        <>
          {currentTab === 0 && renderMySessions()}
          {currentTab === 1 && renderRequestLifecycle()}
        </>
      )}

      {/* ADMINISTRATIVE ACCESS DIALOG (Admin Only) */}
      {isAdmin && (
        <Dialog
          open={openAdminDialog}
          onClose={() => !provisioningAdmin && setOpenAdminDialog(false)}
          maxWidth="sm"
          fullWidth
        >
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1.5, pb: 1 }}>
            <BootstrapIcon name="bi-shield-check" size={22} color="#55E6C1" />
            <Typography variant="h6" sx={{ fontWeight: 700, color: '#F5F7F7' }}>
              Provision Administrative Database Session
            </Typography>
          </DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2.5, pt: 1.5 }}>
            <Alert
              severity="info"
              icon={<BootstrapIcon name="bi-shield-lock-fill" size={18} color="#55E6C1" />}
              sx={{
                bgcolor: 'rgba(85, 230, 193, 0.08)',
                border: '1px solid rgba(85, 230, 193, 0.25)',
                color: '#F5F7F7'
              }}
            >
              <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#55E6C1' }}>
                Explicit Administrative Authorization Policy
              </Typography>
              <Typography variant="caption" sx={{ color: '#AAB8BC' }}>
                Directly provisions an ephemeral MySQL administrator account with automated session expiration (up to 60 minutes) and continuous SQL telemetry auditing. This administrative session bypasses employee approval queues under administrative authorization policy.
              </Typography>
            </Alert>

            <FormControl fullWidth size="small">
              <InputLabel id="admin-profile-select-label">Administrative Access Profile</InputLabel>
              <Select
                labelId="admin-profile-select-label"
                value={adminProvisionForm.profile_id}
                label="Administrative Access Profile"
                onChange={(e) => {
                  const newId = e.target.value;
                  const p = availableProfiles.find(item => item.id === newId);
                  setAdminProvisionForm(prev => ({
                    ...prev,
                    profile_id: newId,
                    duration_minutes: Math.min(prev.duration_minutes, p?.max_duration_minutes || 60)
                  }));
                }}
              >
                {availableProfiles.map((p) => (
                  <MenuItem key={p.id} value={p.id}>
                    <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 1 }}>
                      <span>{p.name}</span>
                      <Chip
                        label={p.requires_approval ? 'Independent Review Required' : 'Direct Administrative Policy'}
                        size="small"
                        color={p.requires_approval ? 'warning' : 'success'}
                        variant="outlined"
                        sx={{ height: 18, fontSize: '0.62rem', fontWeight: 700 }}
                      />
                    </Box>
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            {/* Admin profile grant specs */}
            {(() => {
              const adminSelectedProfile = availableProfiles.find(p => p.id === adminProvisionForm.profile_id) || availableProfiles[0];
              if (!adminSelectedProfile) return null;
              return (
                <Paper sx={{ p: 2, bgcolor: '#171B1C', border: '1px solid #364345', borderRadius: 1.5 }}>
                  <Typography variant="caption" sx={{ color: '#55E6C1', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 1 }}>
                    Administrative Grant Specification
                  </Typography>
                  <Grid container spacing={1.5}>
                    <Grid item xs={6}>
                      <Typography variant="caption" sx={{ color: '#AAB8BC', display: 'block' }}>Permitted Operations:</Typography>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.5 }}>
                        {(adminSelectedProfile.allowed_operations || ['SELECT']).map(op => (
                          <Chip key={op} label={op} size="small" sx={{ height: 20, fontSize: '0.68rem', fontWeight: 700 }} />
                        ))}
                      </Box>
                    </Grid>
                    <Grid item xs={6}>
                      <Typography variant="caption" sx={{ color: '#AAB8BC', display: 'block' }}>Max Session Lifetime:</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 700, color: '#FCD34D', mt: 0.5 }}>
                        {adminSelectedProfile.max_duration_minutes || 60} Minutes
                      </Typography>
                    </Grid>
                    <Grid item xs={12}>
                      <Typography variant="caption" sx={{ color: '#AAB8BC', display: 'block', mb: 0.5 }}>Scoped Target Tables:</Typography>
                      <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                        {(adminSelectedProfile.resources || []).map((r, idx) => (
                          <Chip
                            key={idx}
                            label={`${r.db_name}.${r.table_name}`}
                            size="small"
                            variant="outlined"
                            sx={{ height: 20, fontSize: '0.68rem', fontFamily: 'monospace' }}
                          />
                        ))}
                      </Box>
                    </Grid>
                  </Grid>
                </Paper>
              );
            })()}

            <Box>
              <Typography variant="body2" sx={{ mb: 1, color: '#F5F7F7', fontWeight: 600 }}>
                Session Duration: {adminProvisionForm.duration_minutes} minutes
              </Typography>
              <Slider
                value={adminProvisionForm.duration_minutes}
                onChange={(e, val) => setAdminProvisionForm(prev => ({ ...prev, duration_minutes: val }))}
                min={15}
                max={(() => {
                  const p = availableProfiles.find(item => item.id === adminProvisionForm.profile_id);
                  return p?.max_duration_minutes || 60;
                })()}
                step={15}
                marks={[
                  { value: 15, label: '15m' },
                  { value: 30, label: '30m' },
                  { value: 45, label: '45m' },
                  { value: 60, label: '60m' }
                ]}
                valueLabelDisplay="auto"
                sx={{ color: '#55E6C1' }}
              />
            </Box>
          </DialogContent>
          <DialogActions sx={{ px: 3, pb: 2.5 }}>
            <Button onClick={() => setOpenAdminDialog(false)} color="inherit" disabled={provisioningAdmin}>
              Cancel
            </Button>
            <Button
              variant="contained"
              disabled={provisioningAdmin}
              onClick={handleAdminProvisionSubmit}
              startIcon={provisioningAdmin ? <CircularProgress size={16} color="inherit" /> : <BootstrapIcon name="bi-shield-check" size={16} />}
              sx={{ bgcolor: '#55E6C1', color: '#171B1C', fontWeight: 700, '&:hover': { bgcolor: '#45D1AC' } }}
            >
              {provisioningAdmin ? 'Provisioning...' : 'Provision Admin Session'}
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* EMPLOYEE REQUEST ACCESS DIALOG (Developer & DBA Only) */}
      {!isAdmin && (
        <Dialog open={openRequestDialog} onClose={() => setOpenRequestDialog(false)} maxWidth="sm" fullWidth>
          <form onSubmit={handleRequestSubmit}>
            <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
              <BootstrapIcon
                name={isAutoApprove ? 'bi-lightning-charge-fill' : 'bi-shield-lock'}
                size={20}
                color={isAutoApprove ? '#55E6C1' : '#F59E0B'}
              />
              <span>
                {isAutoApprove ? 'Activate JIT Database Access' : 'Request Elevated Database Access'}
              </span>
            </DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              {isAutoApprove ? (
                <Alert
                  severity="info"
                  icon={<BootstrapIcon name="bi-lightning-charge-fill" size={18} color="#55E6C1" />}
                  sx={{
                    bgcolor: 'rgba(85, 230, 193, 0.08)',
                    border: '1px solid rgba(85, 230, 193, 0.25)',
                    color: '#F5F7F7'
                  }}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#55E6C1' }}>
                    Instant Activation Profile (Auto-Approved)
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#AAB8BC' }}>
                    This routine profile qualifies for immediate session activation. Ephemeral MySQL database credentials will be provisioned instantly without entering an approval queue.
                  </Typography>
                </Alert>
              ) : (
                <Alert
                  severity="warning"
                  icon={<BootstrapIcon name="bi-shield-exclamation" size={18} color="#F59E0B" />}
                  sx={{
                    bgcolor: 'rgba(245, 158, 11, 0.08)',
                    border: '1px solid rgba(245, 158, 11, 0.25)',
                    color: '#F5F7F7'
                  }}
                >
                  <Typography variant="subtitle2" sx={{ fontWeight: 700, color: '#FCD34D' }}>
                    Independent Review & Approval Required
                  </Typography>
                  <Typography variant="caption" sx={{ color: '#AAB8BC' }}>
                    Access to sensitive data or elevated operations requires review by an authorized administrator or DBA. Self-approval is strictly prohibited.
                  </Typography>
                </Alert>
              )}

              <FormControl fullWidth size="small">
                <InputLabel id="profile-select-label">Access Profile</InputLabel>
                <Select
                  labelId="profile-select-label"
                  value={requestForm.profile_id}
                  label="Access Profile"
                  onChange={(e) => {
                    const newProfId = e.target.value;
                    const newProf = availableProfiles.find(p => p.id === newProfId);
                    const maxMin = newProf?.max_duration_minutes || 60;
                    setRequestForm(prev => ({
                      ...prev,
                      profile_id: newProfId,
                      requested_duration_minutes: Math.min(prev.requested_duration_minutes, maxMin)
                    }));
                  }}
                >
                  {availableProfiles.map((p) => (
                    <MenuItem key={p.id} value={p.id}>
                      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', gap: 1 }}>
                        <span>{p.name}</span>
                        <Chip
                          label={p.requires_approval ? 'Approval Required' : 'Auto-Approve'}
                          size="small"
                          color={p.requires_approval ? 'warning' : 'success'}
                          variant="outlined"
                          sx={{ height: 18, fontSize: '0.62rem', fontWeight: 700 }}
                        />
                      </Box>
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {/* Profile Grant Specifications */}
              {selectedProfile && (
                <Paper sx={{ p: 2, bgcolor: '#171B1C', border: '1px solid #364345', borderRadius: 1.5 }}>
                  <Typography variant="caption" sx={{ color: '#55E6C1', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, display: 'block', mb: 1 }}>
                    Authorized Profile Grant Specification
                  </Typography>
                  <Grid container spacing={1.5}>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="caption" sx={{ color: '#AAB8BC', display: 'block' }}>Permitted SQL Operations</Typography>
                      <Stack direction="row" spacing={0.5} sx={{ mt: 0.5, flexWrap: 'wrap', gap: 0.5 }}>
                        {(selectedProfile.allowed_operations || []).map((op) => (
                          <Chip key={op} label={op} size="small" sx={{ height: 20, fontSize: '0.65rem', fontWeight: 700, bgcolor: '#252E30', color: '#55E6C1', border: '1px solid #364345' }} />
                        ))}
                      </Stack>
                    </Grid>
                    <Grid item xs={12} sm={6}>
                      <Typography variant="caption" sx={{ color: '#AAB8BC', display: 'block' }}>Max Session Lifetime</Typography>
                      <Typography variant="body2" sx={{ fontWeight: 600, color: '#F5F7F7', mt: 0.5 }}>
                        {selectedProfile.max_duration_minutes || 60} Minutes (Policy Enforced)
                      </Typography>
                    </Grid>
                    <Grid item xs={12}>
                      <Typography variant="caption" sx={{ color: '#AAB8BC', display: 'block', mb: 0.5 }}>
                        Scoped Target Tables ({selectedProfile.resources?.length || 0} tables)
                      </Typography>
                      <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5, maxHeight: 75, overflowY: 'auto' }}>
                        {(selectedProfile.resources || []).map((r, idx) => (
                          <Chip
                            key={idx}
                            label={`${r.db_name}.${r.table_name}`}
                            size="small"
                            variant="outlined"
                            sx={{ height: 20, fontSize: '0.65rem', fontFamily: 'monospace', borderColor: '#364345', color: '#AAB8BC' }}
                          />
                        ))}
                      </Box>
                    </Grid>
                  </Grid>
                </Paper>
              )}

              {/* Duration Selector constrained to profile max */}
              <Box>
                <Typography variant="caption" color="text.secondary" gutterBottom display="block">
                  Session Duration: <strong>{requestForm.requested_duration_minutes} Minutes</strong> (Max: {selectedProfile?.max_duration_minutes || 60}m)
                </Typography>
                <Slider
                  value={requestForm.requested_duration_minutes}
                  min={15}
                  max={selectedProfile?.max_duration_minutes || 60}
                  step={15}
                  marks={sliderMarks}
                  onChange={(e, val) => setRequestForm({ ...requestForm, requested_duration_minutes: val })}
                />
              </Box>

              {/* Business Justification */}
              <TextField
                label={isAutoApprove ? "Business Justification & Ticket Reference (Optional)" : "Business Justification & Change Ticket Reference *"}
                required={!isAutoApprove}
                fullWidth
                multiline
                rows={2.5}
                placeholder={isAutoApprove
                  ? "Optional operational notes for audit telemetry (e.g. routine developer read)..."
                  : "Mandatory: Enter the business necessity and change ticket number (e.g. INC-4921)..."
                }
                helperText={isAutoApprove
                  ? "Routine operational access is auto-approved without mandatory justification."
                  : "Mandatory: Independent approver requires detailed justification."
                }
                value={requestForm.justification}
                onChange={(e) => setRequestForm({ ...requestForm, justification: e.target.value })}
              />
            </DialogContent>
            <DialogActions sx={{ p: 2.5 }}>
              <Button onClick={() => setOpenRequestDialog(false)} disabled={submitting}>Cancel</Button>
              <Button
                type="submit"
                variant="contained"
                color="primary"
                disabled={submitting || (!isAutoApprove && !requestForm.justification.trim())}
                startIcon={
                  isAutoApprove
                    ? <BootstrapIcon name="bi-lightning-charge-fill" size={15} color="#171B1C" />
                    : <BootstrapIcon name="bi-send" size={15} color="#171B1C" />
                }
              >
                {submitting
                  ? (isAutoApprove ? 'Activating JIT Session...' : 'Submitting Request...')
                  : (isAutoApprove ? 'Activate Access' : 'Submit Request for Approval')}
              </Button>
            </DialogActions>
          </form>
        </Dialog>
      )}

      {/* ONE-TIME CREDENTIALS MODAL */}
      <Dialog
        open={credentialsModal.open}
        onClose={() => setCredentialsModal({ ...credentialsModal, open: false })}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle sx={{ backgroundColor: 'rgba(85, 230, 193, 0.08)', borderBottom: '1px solid #343F3D', display: 'flex', alignItems: 'center', gap: 1 }}>
          <BootstrapIcon name="bi-check-circle-fill" size={22} color="#55E6C1" />
          <span style={{ color: '#F5F5F5', fontWeight: 700 }}>JIT Database Credentials Issued</span>
        </DialogTitle>
        <DialogContent sx={{ pt: 3 }}>
          <Alert severity="warning" sx={{ mb: 2.5 }}>
            <strong>Ephemeral JIT credentials provisioned.</strong> You can connect externally with DBeaver/Workbench, or execute queries immediately inside the In-App SQL Workspace.
          </Alert>

          {credentialsModal.credentials && (
            <Paper variant="outlined" sx={{ p: 2, backgroundColor: '#151A1D', borderColor: '#343F3D', fontFamily: 'monospace' }}>
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
                  <Typography variant="body2" sx={{ fontWeight: 700, color: '#55E6C1' }}>
                    {credentialsModal.credentials.username}
                  </Typography>
                  <IconButton size="small" onClick={() => copyToClipboard(credentialsModal.credentials.username)}>
                    <BootstrapIcon name="bi-clipboard" size={15} />
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
                    <BootstrapIcon name={credentialsModal.showPass ? 'bi-eye-slash' : 'bi-eye'} size={15} />
                  </IconButton>
                  <IconButton size="small" onClick={() => copyToClipboard(credentialsModal.credentials.password)}>
                    <BootstrapIcon name="bi-clipboard" size={15} />
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
            startIcon={<BootstrapIcon name="bi-terminal" size={15} />}
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
        onClose={() => !isDeciding && setDecisionDialog({ ...decisionDialog, open: false })}
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
          <Button onClick={() => setDecisionDialog({ ...decisionDialog, open: false })} disabled={isDeciding}>
            Cancel
          </Button>
          <Button
            variant="contained"
            color={decisionDialog.type === 'approve' ? 'success' : 'error'}
            disabled={isDeciding}
            startIcon={isDeciding ? <CircularProgress size={14} color="inherit" /> : null}
            onClick={handleDecisionSubmit}
          >
            {isDeciding ? 'Processing...' : `Confirm ${decisionDialog.type === 'approve' ? 'Approval' : 'Denial'}`}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
