// frontend/src/pages/ProfilesPage.jsx
import React, { useState, useEffect } from 'react';
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
  OutlinedInput,
  Divider,
  Stack
} from '@mui/material';
import StorageIcon from '@mui/icons-material/Storage';
import VerifiedUserIcon from '@mui/icons-material/VerifiedUser';
import AddCircleIcon from '@mui/icons-material/AddCircle';
import RefreshIcon from '@mui/icons-material/Refresh';
import ScheduleIcon from '@mui/icons-material/Schedule';
import SecurityIcon from '@mui/icons-material/Security';
import AssignmentTurnedInIcon from '@mui/icons-material/AssignmentTurnedIn';
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

  // Create Profile Dialog
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
      // 1. Fetch available profiles for current user's role
      const availRes = await fetch('/profiles/available', {
        headers: { Authorization: `Bearer ${accessToken}` }
      });
      const availData = await availRes.json();
      if (availRes.ok && availData.success) {
        setAvailableProfiles(availData.data.profiles);
      }

      // If admin, fetch all profiles and resources catalog
      if (isAdmin) {
        const [allProfRes, resRes] = await Promise.all([
          fetch('/api/profiles', { headers: { Authorization: `Bearer ${accessToken}` } }),
          fetch('/api/resources', { headers: { Authorization: `Bearer ${accessToken}` } })
        ]);
        const allProfData = await allProfRes.json();
        const resData = await resRes.json();

        if (allProfRes.ok && allProfData.success) setAllProfiles(allProfData.data.profiles);
        if (resRes.ok && resData.success) setResources(resData.data.resources);
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

  const getSensitivityColor = (level) => {
    switch (level) {
      case 'critical': return 'error';
      case 'high': return 'warning';
      case 'medium': return 'info';
      default: return 'success';
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700 }}>
            Access Profiles & Resources Catalog
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Role-governed database access profiles with least-privilege operations and sensitivity ratings.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button
            startIcon={<RefreshIcon />}
            variant="outlined"
            size="small"
            onClick={fetchData}
            disabled={loading}
          >
            Refresh
          </Button>
          {isAdmin && currentTab === 1 && (
            <Button
              startIcon={<AddCircleIcon />}
              variant="contained"
              size="small"
              onClick={() => setOpenCreateDialog(true)}
            >
              New Profile
            </Button>
          )}
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      {isAdmin && (
        <Tabs
          value={currentTab}
          onChange={(e, val) => setCurrentTab(val)}
          sx={{ mb: 3, borderBottom: '1px solid rgba(255, 255, 255, 0.08)' }}
        >
          <Tab label={`My Available Profiles (${availableProfiles.length})`} />
          <Tab label={`All System Profiles (${allProfiles.length})`} />
          <Tab label={`Protected Resources Catalog (${resources.length})`} />
        </Tabs>
      )}

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <>
          {/* TAB 0: Available Profiles for Current User */}
          {(currentTab === 0 || !isAdmin) && (
            <Box>
              <Alert severity="info" sx={{ mb: 3, backgroundColor: 'rgba(2, 136, 209, 0.08)' }}>
                You are authenticated as <strong>{user?.username}</strong> with roles: <strong>[{user?.roles?.join(', ')}]</strong>.
                Below are the reusable profiles your role is permitted to request under JIT governance.
              </Alert>

              <Grid container spacing={3}>
                {availableProfiles.map((p) => (
                  <Grid item xs={12} md={6} key={p.id}>
                    <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
                      <CardHeader
                        avatar={<VerifiedUserIcon color="primary" />}
                        title={p.name}
                        titleTypographyProps={{ fontWeight: 700, fontSize: '1.05rem' }}
                        subheader={
                          <Box sx={{ display: 'flex', gap: 1, mt: 0.5 }}>
                            <Chip
                              size="small"
                              label={`Risk: ${p.risk_level.toUpperCase()}`}
                              color={getSensitivityColor(p.risk_level)}
                            />
                            <Chip
                              size="small"
                              label={p.requires_approval ? 'Approval Required' : 'Auto-Approve'}
                              color={p.requires_approval ? 'warning' : 'success'}
                              variant="outlined"
                            />
                          </Box>
                        }
                      />
                      <CardContent sx={{ flexGrow: 1 }}>
                        <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                          {p.description}
                        </Typography>

                        <Divider sx={{ my: 1.5 }} />

                        <Box sx={{ mb: 1.5 }}>
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5, fontWeight: 600 }}>
                            ALLOWED SQL OPERATIONS
                          </Typography>
                          <Stack direction="row" spacing={0.5} flexWrap="wrap">
                            {p.allowed_operations.map((op) => (
                              <Chip
                                key={op}
                                label={op}
                                size="small"
                                sx={{
                                  backgroundColor: op === 'DDL' ? 'error.dark' : op === 'DELETE' ? 'warning.dark' : 'primary.dark',
                                  color: '#fff',
                                  fontWeight: 600
                                }}
                              />
                            ))}
                          </Stack>
                        </Box>

                        <Box sx={{ mb: 1.5 }}>
                          <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 0.5, fontWeight: 600 }}>
                            TARGET DB RESOURCES
                          </Typography>
                          <Stack direction="row" spacing={0.5} flexWrap="wrap">
                            {p.resources.map((r) => (
                              <Chip
                                key={r.id}
                                label={`${r.db_name}.${r.table_name}`}
                                size="small"
                                variant="outlined"
                                color={getSensitivityColor(r.sensitivity)}
                              />
                            ))}
                          </Stack>
                        </Box>

                        <Box sx={{ display: 'flex', gap: 3, mt: 2, pt: 1, borderTop: '1px solid rgba(255,255,255,0.06)' }}>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <ScheduleIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                            <Typography variant="caption" color="text.secondary">
                              Max Duration: <strong>{p.max_duration_minutes} min</strong>
                            </Typography>
                          </Box>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                            <StorageIcon fontSize="small" sx={{ color: 'text.secondary' }} />
                            <Typography variant="caption" color="text.secondary">
                              Max Rows: <strong>{p.max_rows_hint || 'Unlimited'}</strong>
                            </Typography>
                          </Box>
                        </Box>
                      </CardContent>
                    </Card>
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}

          {/* TAB 1: Admin All Profiles */}
          {isAdmin && currentTab === 1 && (
            <Card>
              <TableContainer component={Paper} variant="outlined" sx={{ border: 'none' }}>
                <Table>
                  <TableHead sx={{ backgroundColor: 'rgba(255, 255, 255, 0.04)' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>ID</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Profile Name</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Operations</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Resources</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Permitted Roles</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Duration</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Approval</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {allProfiles.map((p) => (
                      <TableRow key={p.id} hover>
                        <TableCell>{p.id}</TableCell>
                        <TableCell>
                          <Typography variant="subtitle2" sx={{ fontWeight: 600 }}>{p.name}</Typography>
                          <Typography variant="caption" color="text.secondary">{p.description}</Typography>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            {p.allowed_operations.map((op) => (
                              <Chip key={op} label={op} size="small" />
                            ))}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            {p.resources.map((r) => (
                              <Chip
                                key={r.id}
                                label={r.table_name}
                                size="small"
                                color={getSensitivityColor(r.sensitivity)}
                                variant="outlined"
                              />
                            ))}
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                            {p.roles.map((r) => (
                              <Chip key={r.id} label={r.name} size="small" variant="filled" />
                            ))}
                          </Box>
                        </TableCell>
                        <TableCell>{p.max_duration_minutes}m</TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={p.requires_approval ? 'Required' : 'Auto'}
                            color={p.requires_approval ? 'warning' : 'success'}
                          />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Card>
          )}

          {/* TAB 2: Admin Resources Catalog */}
          {isAdmin && currentTab === 2 && (
            <Card>
              <TableContainer component={Paper} variant="outlined" sx={{ border: 'none' }}>
                <Table>
                  <TableHead sx={{ backgroundColor: 'rgba(255, 255, 255, 0.04)' }}>
                    <TableRow>
                      <TableCell sx={{ fontWeight: 600 }}>ID</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Database</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Table Name</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Sensitivity Level</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>Description</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {resources.map((r) => (
                      <TableRow key={r.id} hover>
                        <TableCell>{r.id}</TableCell>
                        <TableCell sx={{ fontWeight: 600 }}>{r.db_name}</TableCell>
                        <TableCell sx={{ fontFamily: 'monospace', fontWeight: 600, color: 'primary.light' }}>
                          {r.table_name}
                        </TableCell>
                        <TableCell>
                          <Chip
                            size="small"
                            label={r.sensitivity.toUpperCase()}
                            color={getSensitivityColor(r.sensitivity)}
                          />
                        </TableCell>
                        <TableCell sx={{ color: 'text.secondary' }}>{r.description || 'No description'}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Card>
          )}
        </>
      )}

      {/* Admin: Create Access Profile Dialog */}
      <Dialog open={openCreateDialog} onClose={() => setOpenCreateDialog(false)} maxWidth="md" fullWidth>
        <form onSubmit={handleCreateProfile}>
          <DialogTitle>Define Reusable Database Access Profile</DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
            <TextField
              label="Profile Name"
              required
              fullWidth
              value={profileForm.name}
              onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
            />
            <TextField
              label="Description & Business Justification"
              required
              fullWidth
              multiline
              rows={2}
              value={profileForm.description}
              onChange={(e) => setProfileForm({ ...profileForm, description: e.target.value })}
            />
            <FormControl fullWidth>
              <InputLabel id="operations-label">Allowed SQL Operations</InputLabel>
              <Select
                labelId="operations-label"
                multiple
                value={profileForm.allowed_operations}
                onChange={(e) => setProfileForm({ ...profileForm, allowed_operations: e.target.value })}
                input={<OutlinedInput label="Allowed SQL Operations" />}
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map((val) => (
                      <Chip key={val} label={val} size="small" />
                    ))}
                  </Box>
                )}
              >
                {ALL_OPERATIONS.map((op) => (
                  <MenuItem key={op} value={op}>{op}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <Grid container spacing={2}>
              <Grid item xs={6}>
                <TextField
                  label="Max Duration (Minutes)"
                  type="number"
                  fullWidth
                  value={profileForm.max_duration_minutes}
                  onChange={(e) => setProfileForm({ ...profileForm, max_duration_minutes: parseInt(e.target.value, 10) })}
                />
              </Grid>
              <Grid item xs={6}>
                <FormControl fullWidth>
                  <InputLabel id="risk-label">Risk Rating</InputLabel>
                  <Select
                    labelId="risk-label"
                    value={profileForm.risk_level}
                    label="Risk Rating"
                    onChange={(e) => setProfileForm({ ...profileForm, risk_level: e.target.value })}
                  >
                    <MenuItem value="low">Low</MenuItem>
                    <MenuItem value="medium">Medium</MenuItem>
                    <MenuItem value="high">High</MenuItem>
                    <MenuItem value="critical">Critical</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </DialogContent>
          <DialogActions sx={{ p: 2.5 }}>
            <Button onClick={() => setOpenCreateDialog(false)} disabled={saving}>Cancel</Button>
            <Button type="submit" variant="contained" disabled={saving}>
              {saving ? 'Saving...' : 'Create Profile'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
}
