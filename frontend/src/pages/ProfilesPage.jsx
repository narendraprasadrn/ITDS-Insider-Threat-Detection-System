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
  OutlinedInput
} from '@mui/material';
import BootstrapIcon from '../components/common/BootstrapIcon.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const ALL_OPERATIONS = ['SELECT', 'INSERT', 'UPDATE', 'DELETE', 'DDL'];

export default function ProfilesPage() {
  const { user, accessToken, hasRole } = useAuth();
  const isAdmin = hasRole('admin');

  const [currentTab, setCurrentTab] = useState(0);
  const [availableProfiles, setAvailableProfiles] = useState([]);
  const [allProfiles, setAllProfiles] = useState([]);
  const [resources, setResources] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

      // 2. If administrator, also fetch all system profiles and resources catalog
      if (isAdmin) {
        const [allProfRes, resRes] = await Promise.all([
          fetch('/api/profiles', { headers: { Authorization: `Bearer ${accessToken}` } }),
          fetch('/api/resources', { headers: { Authorization: `Bearer ${accessToken}` } })
        ]);
        const allProfData = await allProfRes.json();
        const resData = await resRes.json();

        if (allProfRes.ok && allProfData.success) setAllProfiles(allProfData.data.profiles || []);
        if (resRes.ok && resData.success) setResources(resData.data.resources || []);
      }
    } catch {
      setError('Network error while loading profiles data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [isAdmin]);

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

  // Helper to group resources by database name
  const groupResourcesByDb = (resList = []) => {
    const map = {};
    for (const r of resList) {
      const db = r.db_name || 'FinanceCorpDB';
      if (!map[db]) map[db] = [];
      map[db].push(r.table_name);
    }
    return map;
  };

  // Determine which list to display based on tab
  const displayedProfiles = (isAdmin && currentTab === 1) ? allProfiles : availableProfiles;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#F5F7F7', display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <BootstrapIcon name="bi-database-lock" size={24} color="#55E6C1" /> Access Profiles
          </Typography>
          <Typography variant="body2" sx={{ color: '#AAB8BC', mt: 0.5 }}>
            Least-privilege database permissions and accessible table scopes by role.
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
                  <TableCell width="200">Database</TableCell>
                  <TableCell width="220">Table Name</TableCell>
                  <TableCell>Description</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {resources.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} align="center" sx={{ py: 4, color: 'text.secondary' }}>
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
        /* PROFILES TABLE (Compact, Responsive, Focused on Database & Tables) */
        <Card variant="outlined" sx={{ borderRadius: 1.5, borderColor: '#343F3D', bgcolor: '#252D30' }}>
          <TableContainer component={Paper} elevation={0} sx={{ overflowX: 'auto' }}>
            <Table size="small" sx={{ minWidth: 650 }}>
              <TableHead>
                <TableRow sx={{ '& th': { bgcolor: '#1F292B', fontWeight: 700, fontSize: '0.78rem', py: 1.25, borderBottom: '1px solid #364345', color: '#AAB8BC' } }}>
                  <TableCell width="28%">Profile / Role</TableCell>
                  <TableCell width="18%">Database</TableCell>
                  <TableCell width="34%">Accessible Tables</TableCell>
                  <TableCell width="20%">Allowed Operations</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {displayedProfiles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} align="center" sx={{ py: 6, color: 'text.secondary' }}>
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
                    const dbGroups = groupResourcesByDb(p.resources);
                    const dbNames = Object.keys(dbGroups);

                    return (
                      <TableRow key={p.id} hover sx={{ '& td': { py: 1.25, borderBottom: '1px solid #364345' } }}>
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
                        </TableCell>

                        {/* 2. Database */}
                        <TableCell>
                          {dbNames.length === 0 ? (
                            <Typography variant="caption" color="text.secondary">None</Typography>
                          ) : (
                            <Stack spacing={0.75}>
                              {dbNames.map(db => (
                                <Typography key={db} variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.85rem', color: '#A6ADB4' }}>
                                  {db}
                                </Typography>
                              ))}
                            </Stack>
                          )}
                        </TableCell>

                        {/* 3. Accessible Tables */}
                        <TableCell>
                          {dbNames.length === 0 ? (
                            <Typography variant="caption" color="text.secondary">None</Typography>
                          ) : (
                            <Stack spacing={1}>
                              {dbNames.map(db => {
                                const tables = dbGroups[db] || [];
                                return (
                                    <Box key={db} sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                                    {tables.map(t => (
                                      <Chip
                                        key={t}
                                        label={t}
                                        size="small"
                                        variant="outlined"
                                        sx={{
                                          height: 20,
                                          fontSize: '0.72rem',
                                          bgcolor: '#151A1D',
                                          borderColor: '#343F3D',
                                          color: '#F5F5F5'
                                        }}
                                      />
                                    ))}
                                  </Box>
                                );
                              })}
                            </Stack>
                          )}
                        </TableCell>

                        {/* 4. Allowed Operations */}
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 0.5 }}>
                            <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.85rem' }}>
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
                                sx={{ height: 18, fontSize: '0.65rem', fontWeight: 500 }}
                              />
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
