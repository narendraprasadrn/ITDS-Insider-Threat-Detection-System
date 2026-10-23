// frontend/src/pages/ProfilesPage.jsx
import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Card,
  Chip,
  Button,
  Tabs,
  Tab,
  Alert,
  CircularProgress,
  Stack,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  OutlinedInput,
  Tooltip
} from '@mui/material';
import BootstrapIcon from '../components/common/BootstrapIcon.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const ALL_OPERATIONS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DDL'];

export default function ProfilesPage() {
  const { user, accessToken, hasRole } = useAuth();
  const isAdmin = hasRole ? hasRole('admin') : ((user?.roles || []).includes('admin') || user?.role === 'admin');

  const [currentTab, setCurrentTab] = useState(0);
  const [availableProfiles, setAvailableProfiles] = useState([]);
  const [allProfiles, setAllProfiles] = useState([]);
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  // Admin: Create Profile Dialog
  const [openCreateDialog, setOpenCreateDialog] = useState(false);
  const [profileForm, setProfileForm] = useState({
    name: '',
    description: '',
    allowed_operations: ['SELECT'],
    max_duration_minutes: 60,
    max_rows_hint: 1000,
    risk_level: 'low',
    requires_approval: false,
    resource_ids: [],
    role_ids: []
  });
  const [saving, setSaving] = useState(false);

  // Table-Level Access Request Dialog (Developer & DBA)
  const [openTableDialog, setOpenTableDialog] = useState(false);
  const [tableRequestForm, setTableRequestForm] = useState({
    target_table: '',
    operations: ['SELECT'],
    requested_duration_minutes: 60,
    justification: ''
  });
  const [submittingTableReq, setSubmittingTableReq] = useState(false);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      // 1. Fetch available profiles for current user's role (governed by RBAC)
      const availRes = await fetch('/api/profiles/available', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const availData = await availRes.json();
      if (availRes.ok && availData.success) {
        setAvailableProfiles(availData.data.profiles || []);
      } else {
        setError(availData.error?.message || 'Failed to load access profiles');
      }

      // 2. Fetch resources catalog (available to all authenticated users for computing restricted tables)
      const resRes = await fetch('/api/resources', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const resData = await resRes.json();
      if (resRes.ok && resData.success) {
        setResources(resData.data.resources || []);
      }

      // 3. If administrator, also fetch all system profiles
      if (isAdmin) {
        const allProfRes = await fetch('/api/profiles', {
          headers: { Authorization: `Bearer ${accessToken}` }
        });
        const allProfData = await allProfRes.json();
        if (allProfRes.ok && allProfData.success) {
          setAllProfiles(allProfData.data.profiles || []);
        }
      }
    } catch {
      setError('Network error while loading profiles data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [isAdmin, accessToken]);

  const handleCreateProfile = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/profiles', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(profileForm)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setOpenCreateDialog(false);
        setProfileForm({
          name: '',
          description: '',
          allowed_operations: ['SELECT'],
          max_duration_minutes: 60,
          max_rows_hint: 1000,
          risk_level: 'low',
          requires_approval: false,
          resource_ids: [],
          role_ids: []
        });
        setActionSuccess('Access profile created successfully');
        fetchData();
      } else {
        setError(data.error?.message || 'Failed to create profile');
      }
    } catch {
      setError('Network error while saving profile');
    } finally {
      setSaving(false);
    }
  };

  const handleOpenTableRequest = (tableName = '') => {
    setTableRequestForm({
      target_table: tableName || (resources[0]?.table_name || ''),
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

  const displayedProfiles = (isAdmin && currentTab === 1) ? allProfiles : availableProfiles;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#F5F7F7', display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <BootstrapIcon name="bi-database-lock" size={24} color="#55E6C1" /> Access Profiles & Table Governance
          </Typography>
          <Typography variant="body2" sx={{ color: '#AAB8BC', mt: 0.5 }}>
            Least-privilege permissions, accessible table scopes, and dynamic table-level access requests.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button
            startIcon={<BootstrapIcon name="bi-arrow-clockwise" size={15} />}
            variant="outlined"
            size="small"
            onClick={fetchData}
            disabled={loading}
          >
            Refresh
          </Button>
          {!isAdmin && (
            <Button
              startIcon={<BootstrapIcon name="bi-key-fill" size={15} />}
              variant="contained"
              size="small"
              onClick={() => handleOpenTableRequest()}
            >
              Request Table Access
            </Button>
          )}
          {isAdmin && currentTab === 1 && (
            <Button
              startIcon={<BootstrapIcon name="bi-plus-circle" size={15} />}
              variant="contained"
              size="small"
              onClick={() => setOpenCreateDialog(true)}
            >
              New Profile
            </Button>
          )}
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 2 }} onClose={() => setError(null)}>{error}</Alert>}
      {actionSuccess && <Alert severity="success" sx={{ mb: 2 }} onClose={() => setActionSuccess(null)}>{actionSuccess}</Alert>}

      {/* Admin Tab Switching */}
      {isAdmin && (
        <Tabs
          value={currentTab}
          onChange={(e, val) => setCurrentTab(val)}
          sx={{ mb: 2, minHeight: 40, borderBottom: '1px solid #364345' }}
        >
          <Tab label={`Authorized Profiles (${availableProfiles.length})`} sx={{ minHeight: 40, py: 1 }} />
          <Tab label={`All System Profiles (${allProfiles.length})`} sx={{ minHeight: 40, py: 1 }} />
          <Tab label={`Resources Catalog (${resources.length})`} sx={{ minHeight: 40, py: 1 }} />
        </Tabs>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 6 }}>
          <CircularProgress size={32} />
        </Box>
      ) : (currentTab === 2 && isAdmin) ? (
        /* TAB 2: Resources Catalog (Admin only) */
        <Card variant="outlined" sx={{ borderRadius: 1.5, borderColor: '#364345', bgcolor: '#252E30' }}>
          <TableContainer component={Paper} elevation={0} sx={{ maxHeight: 600 }}>
            <Table size="small" stickyHeader>
              <TableHead>
                <TableRow sx={{ '& th': { bgcolor: '#1F292B', fontWeight: 700, fontSize: '0.78rem', borderBottom: '1px solid #364345', color: '#AAB8BC' } }}>
                  <TableCell width="80">ID</TableCell>
                  <TableCell width="180">Database</TableCell>
                  <TableCell width="200">Table Name</TableCell>
                  <TableCell width="140">Sensitivity</TableCell>
                  <TableCell>Description</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {resources.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 4, color: 'text.secondary' }}>
                      No resources registered in the catalog.
                    </TableCell>
                  </TableRow>
                ) : (
                  resources.map((r) => (
                    <TableRow key={r.id} hover>
                      <TableCell sx={{ color: 'text.secondary', fontSize: '0.8rem' }}>#{r.id}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600, color: '#A6ADB4' }}>{r.db_name}</TableCell>
                      <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600, color: '#55E6C1' }}>
                        {r.table_name}
                      </TableCell>
                      <TableCell>
                        <Chip
                          label={r.sensitivity?.toUpperCase()}
                          size="small"
                          color={r.sensitivity === 'critical' ? 'error' : (r.sensitivity === 'high' ? 'warning' : 'default')}
                          sx={{ height: 18, fontSize: '0.65rem', fontWeight: 700 }}
                        />
                      </TableCell>
                      <TableCell sx={{ color: 'text.secondary', fontSize: '0.85rem' }}>
                        {r.description || 'Enterprise business table'}
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </Card>
      ) : (
        /* PROFILES TABLE (Displays Accessible Tables AND Inaccessible/Restricted Tables) */
        <Card variant="outlined" sx={{ borderRadius: 1.5, borderColor: '#343F3D', bgcolor: '#252D30' }}>
          <TableContainer component={Paper} elevation={0} sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 800 }}>
              <TableHead>
                <TableRow sx={{ '& th': { bgcolor: '#1F292B', fontWeight: 700, fontSize: '0.78rem', py: 1.25, borderBottom: '1px solid #364345', color: '#AAB8BC' } }}>
                  <TableCell width="22%">Profile / Role</TableCell>
                  <TableCell width="12%">Database</TableCell>
                  <TableCell width="28%">Accessible Tables</TableCell>
                  <TableCell width="26%">Inaccessible / Restricted Tables</TableCell>
                  <TableCell width="12%" align="right">Operations</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {displayedProfiles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                      <BootstrapIcon name="bi-database-lock" size={32} color="#AAB8BC" sx={{ opacity: 0.35, mb: 1, display: 'block', mx: 'auto' }} />
                      <Typography variant="body2" sx={{ fontWeight: 600, color: '#F5F7F7' }}>
                        No Access Profiles Available
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#AAB8BC' }}>
                        There are currently no access profiles available for your role.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  displayedProfiles.map((p) => {
                    const accessibleTableNames = (p.resources || []).map(r => r.table_name);
                    const restrictedResources = resources.filter(
                      r => !accessibleTableNames.some(at => at.toLowerCase() === r.table_name.toLowerCase())
                    );
                    const targetDb = p.resources?.[0]?.db_name || 'itds_db';

                    return (
                      <TableRow key={p.id} hover sx={{ '& td': { py: 1.5, borderBottom: '1px solid #364345' } }}>
                        {/* 1. Profile / Role */}
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600, color: '#F5F7F7', lineHeight: 1.3 }}>
                            {p.name}
                          </Typography>
                          {p.roles && p.roles.length > 0 && (
                            <Typography variant="caption" sx={{ color: '#AAB8BC', display: 'block', mt: 0.25, fontSize: '0.72rem' }}>
                              Role: {p.roles.map(r => r.name?.toUpperCase()).join(', ')}
                            </Typography>
                          )}
                          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25, fontSize: '0.7rem' }}>
                            Max: {p.max_duration_minutes}m • Limit: {p.max_rows_hint} rows
                          </Typography>
                        </TableCell>

                        {/* 2. Database */}
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.85rem', color: '#A6ADB4' }}>
                            {targetDb}
                          </Typography>
                        </TableCell>

                        {/* 3. Accessible Tables */}
                        <TableCell>
                          {accessibleTableNames.length === 0 ? (
                            <Typography variant="caption" color="text.secondary">None</Typography>
                          ) : (
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                              {p.resources.map(r => (
                                <Tooltip key={r.table_name} title={`Sensitivity: ${r.sensitivity || 'standard'}`}>
                                  <Chip
                                    label={r.table_name}
                                    size="small"
                                    sx={{
                                      height: 22,
                                      fontSize: '0.72rem',
                                      fontWeight: 600,
                                      bgcolor: 'rgba(85, 230, 193, 0.12)',
                                      borderColor: '#55E6C1',
                                      color: '#55E6C1',
                                      border: '1px solid'
                                    }}
                                  />
                                </Tooltip>
                              ))}
                            </Box>
                          )}
                        </TableCell>

                        {/* 4. Inaccessible / Restricted Tables */}
                        <TableCell>
                          {restrictedResources.length === 0 ? (
                            <Typography variant="caption" sx={{ color: '#55E6C1', fontWeight: 600 }}>
                              Full Catalog Scope (All tables granted)
                            </Typography>
                          ) : (
                            <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                              {restrictedResources.map(r => (
                                <Tooltip key={r.table_name} title={`Click to request access to '${r.table_name}' (${r.sensitivity} sensitivity)`}>
                                  <Chip
                                    icon={<BootstrapIcon name="bi-lock-fill" size={11} color="#AAB8BC" />}
                                    label={r.table_name}
                                    size="small"
                                    onClick={() => handleOpenTableRequest(r.table_name)}
                                    clickable
                                    sx={{
                                      height: 22,
                                      fontSize: '0.72rem',
                                      bgcolor: '#1F2527',
                                      borderColor: '#435154',
                                      color: '#AAB8BC',
                                      border: '1px solid',
                                      cursor: 'pointer',
                                      '&:hover': {
                                        borderColor: '#F59E0B',
                                        color: '#FCD34D',
                                        bgcolor: 'rgba(245, 158, 11, 0.1)'
                                      }
                                    }}
                                  />
                                </Tooltip>
                              ))}
                            </Box>
                          )}
                        </TableCell>

                        {/* 5. Allowed Operations & Actions */}
                        <TableCell align="right">
                          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 0.5 }}>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.8rem' }}>
                              {Array.isArray(p.allowed_operations)
                                ? p.allowed_operations.join(', ')
                                : (p.allowed_operations || 'SELECT')}
                            </Typography>
                            {p.requires_approval && (
                              <Chip
                                label="Approval Required"
                                size="small"
                                color="warning"
                                variant="outlined"
                                sx={{ height: 18, fontSize: '0.62rem', fontWeight: 500 }}
                              />
                            )}
                            {!isAdmin && restrictedResources.length > 0 && (
                              <Button
                                size="small"
                                variant="outlined"
                                color="inherit"
                                startIcon={<BootstrapIcon name="bi-plus-circle" size={12} />}
                                onClick={() => handleOpenTableRequest(restrictedResources[0]?.table_name)}
                                sx={{ fontSize: '0.68rem', py: 0.2, px: 1, mt: 0.5, borderColor: '#435154' }}
                              >
                                Request Table
                              </Button>
                            )}
                          </Box>
                        </TableCell>
                      </TableRow>
                    );
                  })
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
              Submit an out-of-scope table access request. Requests for operational tables are routed to DBA/Admin; critical tables require Administrator review.
            </Typography>

            <FormControl fullWidth size="small">
              <InputLabel id="table-select-label">Target Database Table</InputLabel>
              <Select
                labelId="table-select-label"
                value={tableRequestForm.target_table}
                label="Target Database Table"
                onChange={(e) => setTableRequestForm({ ...tableRequestForm, target_table: e.target.value })}
              >
                {resources.map((r) => (
                  <MenuItem key={r.table_name} value={r.table_name}>
                    {r.table_name} ({r.sensitivity?.toUpperCase()} sensitivity)
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth size="small">
              <InputLabel id="ops-label">Requested Operations</InputLabel>
              <Select
                labelId="ops-label"
                multiple
                value={tableRequestForm.operations}
                onChange={(e) => setTableRequestForm({ ...tableRequestForm, operations: e.target.value })}
                input={<OutlinedInput label="Requested Operations" />}
                renderValue={(selected) => selected.join(', ')}
              >
                {['SELECT', 'INSERT', 'UPDATE'].map((op) => (
                  <MenuItem key={op} value={op}>{op}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth size="small">
              <InputLabel id="duration-label">Requested Duration</InputLabel>
              <Select
                labelId="duration-label"
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

      {/* Admin: Create Access Profile Dialog */}
      {isAdmin && (
        <Dialog open={openCreateDialog} onClose={() => setOpenCreateDialog(false)} maxWidth="sm" fullWidth>
          <form onSubmit={handleCreateProfile}>
            <DialogTitle sx={{ pb: 1 }}>Define Access Profile</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 1 }}>
              <TextField
                label="Profile Name"
                required
                fullWidth
                size="small"
                value={profileForm.name}
                onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
              />
              <TextField
                label="Description"
                fullWidth
                size="small"
                value={profileForm.description}
                onChange={(e) => setProfileForm({ ...profileForm, description: e.target.value })}
              />
              <FormControl fullWidth size="small">
                <InputLabel id="operations-label">Allowed SQL Operations</InputLabel>
                <Select
                  labelId="operations-label"
                  multiple
                  value={profileForm.allowed_operations}
                  onChange={(e) => setProfileForm({ ...profileForm, allowed_operations: e.target.value })}
                  input={<OutlinedInput label="Allowed SQL Operations" />}
                  renderValue={(selected) => selected.join(', ')}
                >
                  {ALL_OPERATIONS.map((op) => (
                    <MenuItem key={op} value={op}>{op}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </DialogContent>
            <DialogActions sx={{ p: 2 }}>
              <Button onClick={() => setOpenCreateDialog(false)} disabled={saving} size="small">
                Cancel
              </Button>
              <Button type="submit" variant="contained" disabled={saving} size="small">
                {saving ? 'Saving...' : 'Create Profile'}
              </Button>
            </DialogActions>
          </form>
        </Dialog>
      )}
    </Box>
  );
}
