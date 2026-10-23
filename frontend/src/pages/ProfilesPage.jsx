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
  Tooltip,
  Collapse
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
  const [myRequests, setMyRequests] = useState([]);
  const [myActiveSessions, setMyActiveSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [actionSuccess, setActionSuccess] = useState(null);

  // Independent Collapsible State per profile row
  const [expandedAccessibleProfiles, setExpandedAccessibleProfiles] = useState({});
  const [expandedRestrictedProfiles, setExpandedRestrictedProfiles] = useState({});

  // Search filters inside expanded panels
  const [accessibleSearchFilters, setAccessibleSearchFilters] = useState({});
  const [restrictedSearchFilters, setRestrictedSearchFilters] = useState({});

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

  const toggleExpandAccessible = (profileId) => {
    setExpandedAccessibleProfiles((prev) => ({
      ...prev,
      [profileId]: !prev[profileId]
    }));
  };

  const toggleExpandRestricted = (profileId) => {
    setExpandedRestrictedProfiles((prev) => ({
      ...prev,
      [profileId]: !prev[profileId]
    }));
  };

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const headers = { Authorization: `Bearer ${accessToken}` };

      // 1. Fetch available profiles for current user's role (governed by RBAC)
      const availRes = await fetch('/api/profiles/available', { headers });
      const availData = await availRes.json();
      if (availRes.ok && availData.success) {
        setAvailableProfiles(availData.data.profiles || []);
      } else {
        setError(availData.error?.message || 'Failed to load access profiles');
      }

      // 2. Fetch resources catalog
      const resRes = await fetch('/api/resources', { headers });
      const resData = await resRes.json();
      if (resRes.ok && resData.success) {
        setResources(resData.data.resources || []);
      }

      // 3. Fetch user's access requests (to display pending/approved status dynamically)
      const reqRes = await fetch('/api/access-requests/my', { headers });
      if (reqRes.ok) {
        const reqData = await reqRes.json();
        setMyRequests(reqData.data?.requests || []);
      }

      // 4. Fetch user's active sessions (to display active session grants)
      const sessRes = await fetch('/api/sessions/my', { headers });
      if (sessRes.ok) {
        const sessData = await sessRes.json();
        setMyActiveSessions(sessData.data?.sessions || []);
      }

      // 5. If administrator, also fetch all system profiles
      if (isAdmin) {
        const allProfRes = await fetch('/api/profiles', { headers });
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

  // Dynamic status evaluation for individual restricted tables
  const getTableAccessStatus = (tableName) => {
    if (!tableName) return null;
    const tNameLower = tableName.toLowerCase();

    // 1. Check if user currently has an active session with this table granted
    const hasActiveSessionGrant = myActiveSessions.some((s) => {
      if (s.status !== 'active') return false;
      const grants = Array.isArray(s.granted_resources) ? s.granted_resources : [];
      return grants.some((gr) => gr.toLowerCase().endsWith(tNameLower) || gr.toLowerCase() === tNameLower);
    });

    if (hasActiveSessionGrant) {
      return {
        status: 'active',
        label: 'Approved & Active',
        color: 'success',
        icon: 'bi-check-circle-fill'
      };
    }

    // 2. Check pending / approved requests
    const matchingReq = myRequests.find((r) => {
      const targetLower = (r.target_table || '').toLowerCase();
      return targetLower === tNameLower && ['pending', 'approved', 'active'].includes(r.status);
    });

    if (matchingReq) {
      if (matchingReq.status === 'pending') {
        return {
          status: 'pending',
          label: 'Pending Review',
          color: 'warning',
          icon: 'bi-clock-history'
        };
      }
      return {
        status: 'approved',
        label: 'Approved & Active',
        color: 'success',
        icon: 'bi-check-circle-fill'
      };
    }

    return null;
  };

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
        fetchData();
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
  // Is this the Admin-specific view where restricted & operations columns should be hidden?
  // When Admin views their authorized profile (Tab 0) or any Admin-role profile
  const isAdminView = isAdmin && currentTab === 0;

  return (
    <Box>
      {/* Header */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2.5, flexWrap: 'wrap', gap: 2 }}>
        <Box>
          <Typography variant="h4" sx={{ fontWeight: 700, color: '#F5F7F7', display: 'flex', alignItems: 'center', gap: 1.5 }}>
            <BootstrapIcon name="bi-database-lock" size={24} color="#55E6C1" /> Access Profiles & Table Governance
          </Typography>
          <Typography variant="body2" sx={{ color: '#AAB8BC', mt: 0.5 }}>
            {isAdmin
              ? 'Comprehensive catalog authorization, administrative privileges, and user access governance.'
              : 'Least-privilege permissions, accessible table scopes, and dynamic table-level access requests.'}
          </Typography>
        </Box>
        <Box sx={{ display: 'flex', gap: 1.5 }}>
          <Button
            startIcon={<BootstrapIcon name="bi-arrow-clockwise" size={15} />}
            variant="outlined"
            size="small"
            onClick={fetchData}
            disabled={loading}
            sx={{ borderColor: '#364345', color: '#F5F7F7', '&:hover': { borderColor: '#55E6C1' } }}
          >
            Refresh
          </Button>

          {/* DBA & Developer can submit table requests; Admin has full access and does not need this */}
          {!isAdmin && (
            <Button
              startIcon={<BootstrapIcon name="bi-key-fill" size={15} />}
              variant="contained"
              size="small"
              onClick={() => handleOpenTableRequest()}
              sx={{ bgcolor: '#55E6C1', color: '#171B1C', fontWeight: 600, '&:hover': { bgcolor: '#45D6B1' } }}
            >
              Request Table Access
            </Button>
          )}

          {/* Admin profile creation under All System Profiles tab */}
          {isAdmin && currentTab === 1 && (
            <Button
              startIcon={<BootstrapIcon name="bi-plus-circle" size={15} />}
              variant="contained"
              size="small"
              onClick={() => setOpenCreateDialog(true)}
              sx={{ bgcolor: '#55E6C1', color: '#171B1C', fontWeight: 600, '&:hover': { bgcolor: '#45D6B1' } }}
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
          <CircularProgress size={32} sx={{ color: '#55E6C1' }} />
        </Box>
      ) : (currentTab === 2 && isAdmin) ? (
        /* TAB 2: Resources Catalog (Admin only) */
        <Card variant="outlined" sx={{ borderRadius: 1.5, borderColor: '#364345', bgcolor: '#252E30' }}>
          <TableContainer component={Paper} elevation={0} sx={{ maxHeight: 600, bgcolor: 'transparent' }}>
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
                    <TableRow key={r.id} hover sx={{ '& td': { borderBottom: '1px solid #364345' } }}>
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
        /* PROFILES TABLE */
        <Card variant="outlined" sx={{ borderRadius: 1.5, borderColor: '#343F3D', bgcolor: '#252D30' }}>
          <TableContainer component={Paper} elevation={0} sx={{ overflowX: 'auto', bgcolor: 'transparent' }}>
            <Table size="small" sx={{ minWidth: isAdminView ? 750 : 880 }}>
              <TableHead>
                <TableRow sx={{ '& th': { bgcolor: '#1F292B', fontWeight: 700, fontSize: '0.78rem', py: 1.25, borderBottom: '1px solid #364345', color: '#AAB8BC' } }}>
                  <TableCell width={isAdminView ? '28%' : '20%'}>Profile / Scope</TableCell>
                  <TableCell width={isAdminView ? '16%' : '12%'}>Database</TableCell>
                  <TableCell width={isAdminView ? '36%' : '28%'}>Accessible Tables</TableCell>
                  
                  {/* Hide Restricted Tables and Operations columns completely for Admin view */}
                  {!isAdminView && (
                    <TableCell width="26%">Restricted Tables</TableCell>
                  )}
                  
                  <TableCell width={isAdminView ? '20%' : '14%'} align={isAdminView ? 'center' : 'right'}>
                    {isAdminView ? 'Privilege Status' : 'Operations'}
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {displayedProfiles.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdminView ? 4 : 5} align="center" sx={{ py: 6, color: 'text.secondary' }}>
                      <BootstrapIcon name="bi-database-lock" size={32} color="#AAB8BC" sx={{ opacity: 0.35, mb: 1, display: 'block', mx: 'auto' }} />
                      <Typography variant="body2" sx={{ fontWeight: 600, color: '#F5F7F7' }}>
                        No Access Profiles Available
                      </Typography>
                      <Typography variant="caption" sx={{ color: '#AAB8BC' }}>
                        There are currently no access profiles configured for this role.
                      </Typography>
                    </TableCell>
                  </TableRow>
                ) : (
                  displayedProfiles.map((p) => {
                    // For Admin role: all catalog resources are accessible
                    const isProfileAdmin = (p.roles || []).some(r => r.name === 'admin') || p.name?.toLowerCase().includes('admin');
                    
                    // Effective accessible tables
                    const accessibleResources = isProfileAdmin ? resources : (p.resources || []);
                    const accessibleTableNames = accessibleResources.map((r) => r.table_name);
                    
                    // Restricted resources (empty for admin)
                    const restrictedResources = isProfileAdmin
                      ? []
                      : resources.filter((r) => !accessibleTableNames.some((at) => at.toLowerCase() === r.table_name.toLowerCase()));

                    const targetDb = p.resources?.[0]?.db_name || resources[0]?.db_name || 'itds_db';

                    const isAccessibleExpanded = Boolean(expandedAccessibleProfiles[p.id]);
                    const isRestrictedExpanded = Boolean(expandedRestrictedProfiles[p.id]);

                    const accessibleFilter = accessibleSearchFilters[p.id] || '';
                    const restrictedFilter = restrictedSearchFilters[p.id] || '';

                    const filteredAccessible = accessibleResources.filter((r) =>
                      r.table_name.toLowerCase().includes(accessibleFilter.toLowerCase().trim())
                    );
                    const filteredRestricted = restrictedResources.filter((r) =>
                      r.table_name.toLowerCase().includes(restrictedFilter.toLowerCase().trim())
                    );

                    return (
                      <TableRow key={p.id} hover sx={{ '& td': { py: 1.5, borderBottom: '1px solid #364345', verticalAlign: 'top' } }}>
                        {/* 1. Profile / Scope */}
                        <TableCell>
                          <Typography variant="body2" sx={{ fontWeight: 600, color: '#F5F7F7', lineHeight: 1.3 }}>
                            {p.name}
                          </Typography>
                          {p.roles && p.roles.length > 0 && (
                            <Typography variant="caption" sx={{ color: '#AAB8BC', display: 'block', mt: 0.25, fontSize: '0.72rem' }}>
                              Role: {p.roles.map((r) => r.name?.toUpperCase()).join(', ')}
                            </Typography>
                          )}
                          <Typography variant="caption" sx={{ color: 'text.secondary', display: 'block', mt: 0.25, fontSize: '0.7rem' }}>
                            {isProfileAdmin ? 'Direct Administrative Authority' : `Max: ${p.max_duration_minutes}m • Limit: ${p.max_rows_hint} rows`}
                          </Typography>
                        </TableCell>

                        {/* 2. Database */}
                        <TableCell>
                          <Typography variant="body2" sx={{ fontFamily: 'monospace', fontWeight: 600, fontSize: '0.85rem', color: '#A6ADB4' }}>
                            {targetDb}
                          </Typography>
                        </TableCell>

                        {/* 3. Accessible Tables — Collapsible Dropdown for Every Role */}
                        <TableCell>
                          <Box>
                            {/* Collapsible Trigger */}
                            <Button
                              size="small"
                              variant="outlined"
                              onClick={() => toggleExpandAccessible(p.id)}
                              startIcon={
                                <BootstrapIcon
                                  name={isAccessibleExpanded ? 'bi-chevron-up' : 'bi-chevron-down'}
                                  size={12}
                                  color="#55E6C1"
                                />
                              }
                              sx={{
                                color: '#55E6C1',
                                borderColor: isAccessibleExpanded ? '#55E6C1' : 'rgba(85,230,193,0.35)',
                                bgcolor: isAccessibleExpanded ? 'rgba(85,230,193,0.1)' : 'rgba(85,230,193,0.04)',
                                fontSize: '0.75rem',
                                py: 0.35,
                                px: 1.25,
                                textTransform: 'none',
                                fontWeight: 600,
                                '&:hover': {
                                  borderColor: '#55E6C1',
                                  bgcolor: 'rgba(85,230,193,0.14)'
                                }
                              }}
                            >
                              Accessible Tables ({accessibleResources.length})
                            </Button>

                            {/* Collapsible Panel */}
                            <Collapse in={isAccessibleExpanded} timeout="auto" unmountOnExit>
                              <Box
                                sx={{
                                  mt: 1.25,
                                  p: 1.25,
                                  bgcolor: '#171B1C',
                                  border: '1px solid rgba(85,230,193,0.3)',
                                  borderRadius: 1.5,
                                  maxWidth: 420
                                }}
                              >
                                {/* Search Filter inside expanded accessible tables if > 4 tables */}
                                {accessibleResources.length > 4 && (
                                  <TextField
                                    size="small"
                                    placeholder="Filter accessible tables..."
                                    value={accessibleFilter}
                                    onChange={(e) => setAccessibleSearchFilters({ ...accessibleSearchFilters, [p.id]: e.target.value })}
                                    InputProps={{
                                      startAdornment: (
                                        <BootstrapIcon
                                          name="bi-search"
                                          size={12}
                                          color="#AAB8BC"
                                          style={{ marginRight: 6 }}
                                        />
                                      )
                                    }}
                                    sx={{
                                      mb: 1,
                                      width: '100%',
                                      '& .MuiOutlinedInput-root': {
                                        bgcolor: '#111415',
                                        borderRadius: 1,
                                        height: 28
                                      },
                                      '& .MuiInputBase-input': {
                                        fontSize: '0.72rem',
                                        py: 0.25,
                                        px: 0.75,
                                        color: '#F5F7F7'
                                      }
                                    }}
                                  />
                                )}

                                {/* Compact Mint-Green Chips */}
                                <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 0.6, maxHeight: 180, overflowY: 'auto', p: 0.5 }}>
                                  {filteredAccessible.length === 0 ? (
                                    <Typography variant="caption" sx={{ color: '#AAB8BC', fontStyle: 'italic' }}>
                                      No tables match "{accessibleFilter}"
                                    </Typography>
                                  ) : (
                                    filteredAccessible.map((r) => (
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
                                    ))
                                  )}
                                </Box>
                              </Box>
                            </Collapse>
                          </Box>
                        </TableCell>

                        {/* 4. Restricted Tables — OMITTED completely for Admin view */}
                        {!isAdminView && (
                          <TableCell>
                            {isProfileAdmin || restrictedResources.length === 0 ? (
                              <Typography variant="caption" sx={{ color: '#55E6C1', fontWeight: 600, display: 'flex', alignItems: 'center', gap: 0.5 }}>
                                <BootstrapIcon name="bi-check2-all" size={13} color="#55E6C1" /> Full Catalog Scope (All tables granted)
                              </Typography>
                            ) : (
                              <Box>
                                {/* Collapsible Trigger */}
                                <Button
                                  size="small"
                                  variant="outlined"
                                  onClick={() => toggleExpandRestricted(p.id)}
                                  startIcon={
                                    <BootstrapIcon
                                      name={isRestrictedExpanded ? 'bi-chevron-up' : 'bi-chevron-down'}
                                      size={12}
                                      color="#AAB8BC"
                                    />
                                  }
                                  sx={{
                                    color: '#E2E8F0',
                                    borderColor: isRestrictedExpanded ? '#55E6C1' : '#364345',
                                    bgcolor: isRestrictedExpanded ? 'rgba(85,230,193,0.08)' : 'rgba(255,255,255,0.02)',
                                    fontSize: '0.75rem',
                                    py: 0.35,
                                    px: 1.25,
                                    textTransform: 'none',
                                    fontWeight: 600,
                                    '&:hover': {
                                      borderColor: '#55E6C1',
                                      bgcolor: 'rgba(85,230,193,0.12)'
                                    }
                                  }}
                                >
                                  Restricted tables ({restrictedResources.length})
                                </Button>

                                {/* Expanded Panel */}
                                <Collapse in={isRestrictedExpanded} timeout="auto" unmountOnExit>
                                  <Box
                                    sx={{
                                      mt: 1.25,
                                      p: 1.25,
                                      bgcolor: '#171B1C',
                                      border: '1px solid #364345',
                                      borderRadius: 1.5,
                                      maxWidth: 380
                                    }}
                                  >
                                    {/* Search Filter if more than 2 restricted tables */}
                                    {restrictedResources.length > 2 && (
                                      <TextField
                                        size="small"
                                        placeholder="Filter restricted tables..."
                                        value={restrictedFilter}
                                        onChange={(e) => setRestrictedSearchFilters({ ...restrictedSearchFilters, [p.id]: e.target.value })}
                                        InputProps={{
                                          startAdornment: (
                                            <BootstrapIcon
                                              name="bi-search"
                                              size={12}
                                              color="#AAB8BC"
                                              style={{ marginRight: 6 }}
                                            />
                                          )
                                        }}
                                        sx={{
                                          mb: 1,
                                          width: '100%',
                                          '& .MuiOutlinedInput-root': {
                                            bgcolor: '#111415',
                                            borderRadius: 1,
                                            height: 28
                                          },
                                          '& .MuiInputBase-input': {
                                            fontSize: '0.72rem',
                                            py: 0.25,
                                            px: 0.75,
                                            color: '#F5F7F7'
                                          }
                                        }}
                                      />
                                    )}

                                    {/* Table Items with Dynamic Status or Request Action */}
                                    <Stack spacing={0.75} sx={{ maxHeight: 220, overflowY: 'auto', pr: 0.5 }}>
                                      {filteredRestricted.length === 0 ? (
                                        <Typography variant="caption" sx={{ color: '#AAB8BC', fontStyle: 'italic', py: 0.5 }}>
                                          No restricted tables match "{restrictedFilter}"
                                        </Typography>
                                      ) : (
                                        filteredRestricted.map((r) => {
                                          const tableStatus = getTableAccessStatus(r.table_name);
                                          const isCritical = r.sensitivity === 'critical';
                                          const isHigh = r.sensitivity === 'high';

                                          return (
                                            <Box
                                              key={r.table_name}
                                              sx={{
                                                display: 'flex',
                                                alignItems: 'center',
                                                justifyContent: 'space-between',
                                                p: '4px 8px',
                                                bgcolor: '#1F2527',
                                                border: '1px solid #2B3739',
                                                borderRadius: 1,
                                                gap: 1
                                              }}
                                            >
                                              {/* Table Name with Subtle Lock Icon */}
                                              <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.75, minWidth: 0 }}>
                                                <BootstrapIcon name="bi-lock-fill" size={11} color="#AAB8BC" />
                                                <Typography
                                                  variant="body2"
                                                  sx={{
                                                    fontFamily: 'monospace',
                                                    fontSize: '0.75rem',
                                                    color: '#E2E8F0',
                                                    fontWeight: 600,
                                                    overflow: 'hidden',
                                                    textOverflow: 'ellipsis',
                                                    whiteSpace: 'nowrap'
                                                  }}
                                                >
                                                  {r.table_name}
                                                </Typography>
                                                <Chip
                                                  label={r.sensitivity?.toUpperCase() || 'STANDARD'}
                                                  size="small"
                                                  sx={{
                                                    height: 16,
                                                    fontSize: '0.58rem',
                                                    fontWeight: 700,
                                                    bgcolor: isCritical ? 'rgba(239,68,68,0.15)' : isHigh ? 'rgba(245,158,11,0.15)' : 'rgba(255,255,255,0.06)',
                                                    color: isCritical ? '#F87171' : isHigh ? '#FCD34D' : '#AAB8BC',
                                                    borderColor: isCritical ? '#EF4444' : isHigh ? '#F59E0B' : '#364345',
                                                    border: '1px solid'
                                                  }}
                                                />
                                              </Box>

                                              {/* Dynamic Status or Request Action */}
                                              <Box sx={{ flexShrink: 0 }}>
                                                {tableStatus ? (
                                                  <Chip
                                                    icon={<BootstrapIcon name={tableStatus.icon} size={10} color={tableStatus.color === 'warning' ? '#FCD34D' : '#55E6C1'} />}
                                                    label={tableStatus.label}
                                                    size="small"
                                                    sx={{
                                                      height: 20,
                                                      fontSize: '0.65rem',
                                                      fontWeight: 600,
                                                      bgcolor: tableStatus.color === 'warning' ? 'rgba(245,158,11,0.15)' : 'rgba(85,230,193,0.12)',
                                                      color: tableStatus.color === 'warning' ? '#FCD34D' : '#55E6C1',
                                                      borderColor: tableStatus.color === 'warning' ? '#F59E0B' : '#55E6C1',
                                                      border: '1px solid'
                                                    }}
                                                  />
                                                ) : (
                                                  <Button
                                                    size="small"
                                                    variant="outlined"
                                                    onClick={() => handleOpenTableRequest(r.table_name)}
                                                    startIcon={<BootstrapIcon name="bi-key-fill" size={10} />}
                                                    sx={{
                                                      height: 22,
                                                      fontSize: '0.68rem',
                                                      py: 0,
                                                      px: 0.75,
                                                      textTransform: 'none',
                                                      borderColor: '#435154',
                                                      color: '#55E6C1',
                                                      '&:hover': {
                                                        borderColor: '#55E6C1',
                                                        bgcolor: 'rgba(85,230,193,0.1)'
                                                      }
                                                    }}
                                                  >
                                                    Request access
                                                  </Button>
                                                )}
                                              </Box>
                                            </Box>
                                          );
                                        })
                                      )}
                                    </Stack>
                                  </Box>
                                </Collapse>
                              </Box>
                            )}
                          </TableCell>
                        )}

                        {/* 5. Privilege Status (for Admin) OR Operations (for DBA/Dev) */}
                        <TableCell align={isAdminView ? 'center' : 'right'}>
                          {isAdminView ? (
                            <Chip
                              icon={<BootstrapIcon name="bi-shield-check" size={14} color="#55E6C1" />}
                              label="Full Database Access"
                              sx={{
                                bgcolor: 'rgba(85,230,193,0.12)',
                                color: '#55E6C1',
                                borderColor: '#55E6C1',
                                border: '1px solid',
                                fontWeight: 600,
                                fontSize: '0.75rem',
                                py: 1.5,
                                px: 0.5
                              }}
                            />
                          ) : (
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
                          )}
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

      {/* Table Access Request Dialog (DBA / Developer) */}
      <Dialog
        open={openTableDialog}
        onClose={() => setOpenTableDialog(false)}
        maxWidth="sm"
        fullWidth
        PaperProps={{ sx: { bgcolor: '#1E2527', border: '1px solid #364345', borderRadius: 2 } }}
      >
        <form onSubmit={handleSubmitTableRequest}>
          <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1, borderBottom: '1px solid #364345', pb: 1.5 }}>
            <BootstrapIcon name="bi-database-lock" size={20} color="#55E6C1" />
            <Typography variant="h6" sx={{ fontWeight: 700, fontSize: '1rem' }}>
              Request Table Access Grant
            </Typography>
          </DialogTitle>
          <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2.5 }}>
            <Typography variant="body2" sx={{ color: '#AAB8BC' }}>
              Submit an out-of-scope table access request. Requests for operational tables are routed to DBA/Admin; critical tables require Administrator review.
            </Typography>

            <FormControl fullWidth size="small">
              <InputLabel id="table-select-label" sx={{ color: '#AAB8BC' }}>Target Database Table</InputLabel>
              <Select
                labelId="table-select-label"
                value={tableRequestForm.target_table}
                label="Target Database Table"
                onChange={(e) => setTableRequestForm({ ...tableRequestForm, target_table: e.target.value })}
                sx={{ bgcolor: '#171B1C' }}
              >
                {resources.map((r) => (
                  <MenuItem key={r.table_name} value={r.table_name}>
                    {r.table_name} ({r.sensitivity?.toUpperCase()} sensitivity)
                  </MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth size="small">
              <InputLabel id="ops-label" sx={{ color: '#AAB8BC' }}>Requested Operations</InputLabel>
              <Select
                labelId="ops-label"
                multiple
                value={tableRequestForm.operations}
                onChange={(e) => setTableRequestForm({ ...tableRequestForm, operations: e.target.value })}
                input={<OutlinedInput label="Requested Operations" />}
                renderValue={(selected) => selected.join(', ')}
                sx={{ bgcolor: '#171B1C' }}
              >
                {ALL_OPERATIONS.map((op) => (
                  <MenuItem key={op} value={op}>{op}</MenuItem>
                ))}
              </Select>
            </FormControl>

            <FormControl fullWidth size="small">
              <InputLabel id="duration-label" sx={{ color: '#AAB8BC' }}>Requested Duration</InputLabel>
              <Select
                labelId="duration-label"
                value={tableRequestForm.requested_duration_minutes}
                label="Requested Duration"
                onChange={(e) => setTableRequestForm({ ...tableRequestForm, requested_duration_minutes: Number(e.target.value) })}
                sx={{ bgcolor: '#171B1C' }}
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
              sx={{
                '& .MuiOutlinedInput-root': { bgcolor: '#171B1C' },
                '& .MuiInputLabel-root': { color: '#AAB8BC' }
              }}
            />
          </DialogContent>
          <DialogActions sx={{ p: 2, borderTop: '1px solid #364345' }}>
            <Button onClick={() => setOpenTableDialog(false)} disabled={submittingTableReq} size="small" sx={{ color: '#AAB8BC' }}>
              Cancel
            </Button>
            <Button
              type="submit"
              variant="contained"
              disabled={submittingTableReq || !tableRequestForm.justification.trim()}
              size="small"
              startIcon={submittingTableReq ? <CircularProgress size={14} color="inherit" /> : <BootstrapIcon name="bi-send" size={14} />}
              sx={{ bgcolor: '#55E6C1', color: '#171B1C', fontWeight: 600, '&:hover': { bgcolor: '#45D6B1' } }}
            >
              {submittingTableReq ? 'Submitting...' : 'Submit Request'}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      {/* Admin: Create Access Profile Dialog */}
      {isAdmin && (
        <Dialog
          open={openCreateDialog}
          onClose={() => setOpenCreateDialog(false)}
          maxWidth="sm"
          fullWidth
          PaperProps={{ sx: { bgcolor: '#1E2527', border: '1px solid #364345', borderRadius: 2 } }}
        >
          <form onSubmit={handleCreateProfile}>
            <DialogTitle sx={{ pb: 1, borderBottom: '1px solid #364345' }}>Define Access Profile</DialogTitle>
            <DialogContent sx={{ display: 'flex', flexDirection: 'column', gap: 2, pt: 2.5 }}>
              <TextField
                label="Profile Name"
                required
                fullWidth
                size="small"
                value={profileForm.name}
                onChange={(e) => setProfileForm({ ...profileForm, name: e.target.value })}
                sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#171B1C' } }}
              />
              <TextField
                label="Description"
                fullWidth
                size="small"
                value={profileForm.description}
                onChange={(e) => setProfileForm({ ...profileForm, description: e.target.value })}
                sx={{ '& .MuiOutlinedInput-root': { bgcolor: '#171B1C' } }}
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
                  sx={{ bgcolor: '#171B1C' }}
                >
                  {ALL_OPERATIONS.map((op) => (
                    <MenuItem key={op} value={op}>{op}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </DialogContent>
            <DialogActions sx={{ p: 2, borderTop: '1px solid #364345' }}>
              <Button onClick={() => setOpenCreateDialog(false)} disabled={saving} size="small" sx={{ color: '#AAB8BC' }}>
                Cancel
              </Button>
              <Button
                type="submit"
                variant="contained"
                disabled={saving}
                size="small"
                sx={{ bgcolor: '#55E6C1', color: '#171B1C', fontWeight: 600, '&:hover': { bgcolor: '#45D6B1' } }}
              >
                {saving ? 'Saving...' : 'Create Profile'}
              </Button>
            </DialogActions>
          </form>
        </Dialog>
      )}
    </Box>
  );
}
