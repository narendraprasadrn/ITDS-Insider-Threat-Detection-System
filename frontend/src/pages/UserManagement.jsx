// frontend/src/pages/UserManagement.jsx
import React, { useState, useEffect } from 'react';
import {
  Box,
  Typography,
  Card,
  CardContent,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Chip,
  Button,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Alert,
  CircularProgress,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  OutlinedInput
} from '@mui/material';
import BootstrapIcon from '../components/common/BootstrapIcon.jsx';
import { useAuth } from '../context/AuthContext.jsx';

const ALL_ROLES = ['admin', 'dba', 'developer'];

export default function UserManagement() {
  const { accessToken } = useAuth();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Dialog state
  const [openDialog, setOpenDialog] = useState(false);
  const [formData, setFormData] = useState({
    username: '',
    email: '',
    full_name: '',
    password: '',
    roles: ['developer']
  });
  const [saving, setSaving] = useState(false);

  const fetchUsers = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await fetch('/api/users', {
        headers: {
          Authorization: `Bearer ${accessToken}`
        }
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setUsers(data.data.users);
      } else {
        setError(data.error?.message || 'Failed to fetch users');
      }
    } catch {
      setError('Network error while fetching users');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchUsers();
  }, []);

  const handleCreateUser = async (e) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const res = await fetch('/api/users', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify(formData)
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setOpenDialog(false);
        setFormData({ username: '', email: '', full_name: '', password: '', roles: ['developer'] });
        fetchUsers();
      } else {
        setError(data.error?.message || 'Failed to create user');
      }
    } catch {
      setError('Network error while creating user');
    } finally {
      setSaving(false);
    }
  };

  const handleToggleStatus = async (user) => {
    try {
      await fetch(`/api/users/${user.id}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({ is_active: !user.is_active })
      });
      fetchUsers();
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Box>
          <Typography variant="h5" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <BootstrapIcon name="bi-people-fill" size={24} color="#55E6C1" /> User & Role Management (RBAC)
          </Typography>
          <Typography variant="body2" color="text.secondary">
            Admin console for user accounts, role mappings, and account status controls.
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button
            startIcon={<BootstrapIcon name="bi-arrow-clockwise" size={15} />}
            variant="outlined"
            size="small"
            onClick={fetchUsers}
            disabled={loading}
          >
            Refresh
          </Button>
          <Button
            startIcon={<BootstrapIcon name="bi-person-plus-fill" size={15} />}
            variant="contained"
            size="small"
            onClick={() => setOpenDialog(true)}
          >
            Add New User
          </Button>
        </Box>
      </Box>

      {error && <Alert severity="error" sx={{ mb: 3 }}>{error}</Alert>}

      <Card>
        <CardContent sx={{ p: 0 }}>
          <TableContainer component={Paper} variant="outlined" sx={{ border: 'none' }}>
            <Table>
              <TableHead sx={{ backgroundColor: '#1F292B', borderBottom: '1px solid #364345' }}>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>ID</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Username</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Full Name</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Email</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Assigned Roles</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} align="center" sx={{ py: 4 }}>
                      <CircularProgress size={30} />
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((u) => (
                    <TableRow key={u.id} hover>
                      <TableCell>{u.id}</TableCell>
                      <TableCell sx={{ fontWeight: 600 }}>{u.username}</TableCell>
                      <TableCell>{u.full_name}</TableCell>
                      <TableCell sx={{ color: 'text.secondary' }}>{u.email}</TableCell>
                      <TableCell>
                        <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                          {u.roles.map((r) => (
                            <Chip
                              key={r}
                              label={r}
                              size="small"
                              color={
                                r === 'admin'
                                  ? 'error'
                                  : r === 'dba'
                                  ? 'info'
                                  : 'primary'
                              }
                              variant="outlined"
                            />
                          ))}
                        </Box>
                      </TableCell>
                      <TableCell>
                        <Chip
                          size="small"
                          label={u.is_active ? 'Active' : 'Disabled'}
                          color={u.is_active ? 'success' : 'default'}
                          icon={u.is_active ? <BootstrapIcon name="bi-check-circle-fill" size={12} /> : <BootstrapIcon name="bi-slash-circle" size={12} />}
                        />
                      </TableCell>
                      <TableCell align="right">
                        <IconButton
                          size="small"
                          color={u.is_active ? 'warning' : 'success'}
                          onClick={() => handleToggleStatus(u)}
                          title={u.is_active ? 'Deactivate User' : 'Activate User'}
                          aria-label={u.is_active ? 'Deactivate User' : 'Activate User'}
                        >
                          <BootstrapIcon name={u.is_active ? "bi-slash-circle" : "bi-check-circle"} size={15} />
                        </IconButton>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </TableContainer>
        </CardContent>
      </Card>

      {/* Create User Dialog */}
      <Dialog open={openDialog} onClose={() => setOpenDialog(false)} maxWidth="sm" fullWidth>
        <form onSubmit={handleCreateUser}>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <BootstrapIcon name="bi-person-plus-fill" size={20} color="#55E6C1" /> Provision New ITDS User
          </DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2 }}>
            <TextField
              label="Username"
              required
              fullWidth
              value={formData.username}
              onChange={(e) => setFormData({ ...formData, username: e.target.value })}
            />
            <TextField
              label="Full Name"
              required
              fullWidth
              value={formData.full_name}
              onChange={(e) => setFormData({ ...formData, full_name: e.target.value })}
            />
            <TextField
              label="Email"
              type="email"
              required
              fullWidth
              value={formData.email}
              onChange={(e) => setFormData({ ...formData, email: e.target.value })}
            />
            <TextField
              label="Password"
              type="password"
              required
              fullWidth
              value={formData.password}
              onChange={(e) => setFormData({ ...formData, password: e.target.value })}
            />
            <FormControl fullWidth>
              <InputLabel id="roles-label">Roles</InputLabel>
              <Select
                labelId="roles-label"
                multiple
                value={formData.roles}
                onChange={(e) => setFormData({ ...formData, roles: e.target.value })}
                input={<OutlinedInput label="Roles" />}
                renderValue={(selected) => (
                  <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.5 }}>
                    {selected.map((val) => (
                      <Chip key={val} label={val} size="small" />
                    ))}
                  </Box>
                )}
              >
                {ALL_ROLES.map((role) => (
                  <MenuItem key={role} value={role}>
                    {role}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </DialogContent>
          <DialogActions sx={{ p: 2.5 }}>
            <Button onClick={() => setOpenDialog(false)} disabled={saving}>
              Cancel
            </Button>
            <Button type="submit" variant="contained" disabled={saving}>
              {saving ? 'Creating...' : 'Create User'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </Box>
  );
}
