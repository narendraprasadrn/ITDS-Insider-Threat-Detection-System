// frontend/src/pages/PoliciesPage.jsx
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
  TextField,
  Alert,
  CircularProgress,
  Paper,
  Divider,
  Stack
} from '@mui/material';
import RuleIcon from '@mui/icons-material/Rule';
import PlayArrowIcon from '@mui/icons-material/PlayArrow';
import CheckCircleOutlineIcon from '@mui/icons-material/CheckCircleOutline';
import ErrorOutlineIcon from '@mui/icons-material/ErrorOutline';
import HourglassEmptyIcon from '@mui/icons-material/HourglassEmpty';
import { useAuth } from '../context/AuthContext.jsx';

const PRESETS = [
  {
    name: '1. Standard Read (Allow)',
    input: {
      user: { username: 'developer', roles: ['developer'] },
      profile: { name: 'Developer Read Profile', requires_approval: false },
      resources: [{ db_name: 'FinanceCorpDB', table_name: 'Customers', sensitivity: 'low' }],
      operations: ['SELECT'],
      requested_duration: 60,
      time_of_day: '11:00',
      sensitivity: 'low'
    }
  },
  {
    name: '2. Critical Payroll (Require Approval)',
    input: {
      user: { username: 'developer', roles: ['developer'] },
      profile: { name: 'Executive Payroll & Compensation', requires_approval: true },
      resources: [
        { db_name: 'FinanceCorpDB', table_name: 'Employees', sensitivity: 'medium' },
        { db_name: 'FinanceCorpDB', table_name: 'Payroll', sensitivity: 'critical' }
      ],
      operations: ['SELECT'],
      requested_duration: 45,
      time_of_day: '14:30',
      sensitivity: 'critical'
    }
  },
  {
    name: '3. Developer DDL Request (Deny)',
    input: {
      user: { username: 'developer', roles: ['developer'] },
      profile: { name: 'Developer Work Profile', requires_approval: false },
      resources: [{ db_name: 'FinanceCorpDB', table_name: 'Orders', sensitivity: 'low' }],
      operations: ['SELECT', 'DDL'],
      requested_duration: 30,
      time_of_day: '12:00',
      sensitivity: 'low'
    }
  },
  {
    name: '4. Off-Hours Sensitive Read (Deny)',
    input: {
      user: { username: 'developer', roles: ['developer'] },
      profile: { name: 'Financial Audit & Tax Reporting', requires_approval: true },
      resources: [{ db_name: 'FinanceCorpDB', table_name: 'Transactions', sensitivity: 'high' }],
      operations: ['SELECT'],
      requested_duration: 60,
      time_of_day: '23:15',
      sensitivity: 'high'
    }
  }
];

export default function PoliciesPage() {
  const { accessToken } = useAuth();
  const [jsonInput, setJsonInput] = useState(JSON.stringify(PRESETS[0].input, null, 2));
  const [evaluating, setEvaluating] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleEvaluate = async () => {
    setEvaluating(true);
    setError(null);
    setResult(null);

    try {
      const parsedInput = JSON.parse(jsonInput);
      const res = await fetch('/api/policy/evaluate', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${accessToken}`
        },
        body: JSON.stringify({
          policy: 'access_request',
          input: parsedInput
        })
      });

      const data = await res.json();
      if (res.ok && data.success) {
        setResult(data.data.result);
      } else {
        setError(data.error?.message || 'Failed to evaluate policy');
      }
    } catch (err) {
      setError(`Invalid JSON input: ${err.message}`);
    } finally {
      setEvaluating(false);
    }
  };

  const loadPreset = (preset) => {
    setJsonInput(JSON.stringify(preset.input, null, 2));
    setResult(null);
    setError(null);
  };

  return (
    <Box>
      <Box sx={{ mb: 3 }}>
        <Typography variant="h5" sx={{ fontWeight: 700 }}>
          Open Policy Agent (Rego) Policy Engine
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Decoupled authorization governance: <code>access_request.rego</code> and <code>sql_query.rego</code> running in OPA.
        </Typography>
      </Box>

      <Grid container spacing={3}>
        {/* Left: Input Console */}
        <Grid item xs={12} md={7}>
          <Card>
            <CardHeader
              avatar={<RuleIcon color="primary" />}
              title="Interactive Policy Evaluation Sandbox"
              subheader="POST /api/policy/evaluate (access_request.rego)"
            />
            <CardContent>
              <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1, fontWeight: 600 }}>
                TEST SCENARIO PRESETS:
              </Typography>
              <Stack direction="row" spacing={1} flexWrap="wrap" sx={{ mb: 2 }}>
                {PRESETS.map((p, idx) => (
                  <Chip
                    key={idx}
                    label={p.name}
                    size="small"
                    clickable
                    color="primary"
                    variant="outlined"
                    onClick={() => loadPreset(p)}
                  />
                ))}
              </Stack>

              <TextField
                label="Rego Policy Input Document (JSON)"
                multiline
                rows={14}
                fullWidth
                value={jsonInput}
                onChange={(e) => setJsonInput(e.target.value)}
                sx={{
                  fontFamily: 'monospace',
                  backgroundColor: 'rgba(0, 0, 0, 0.2)',
                  borderRadius: 1
                }}
              />

              <Box sx={{ mt: 2, display: 'flex', justifyContent: 'flex-end' }}>
                <Button
                  variant="contained"
                  startIcon={evaluating ? <CircularProgress size={18} color="inherit" /> : <PlayArrowIcon />}
                  onClick={handleEvaluate}
                  disabled={evaluating}
                >
                  {evaluating ? 'Evaluating in OPA...' : 'Evaluate Policy in OPA'}
                </Button>
              </Box>
            </CardContent>
          </Card>
        </Grid>

        {/* Right: Real-time Decision Output */}
        <Grid item xs={12} md={5}>
          <Card sx={{ height: '100%', display: 'flex', flexDirection: 'column' }}>
            <CardHeader
              title="OPA Engine Decision"
              subheader="data.itds.access.decision"
            />
            <CardContent sx={{ flexGrow: 1 }}>
              {error && <Alert severity="error" sx={{ mb: 2 }}>{error}</Alert>}

              {result ? (
                <Box>
                  <Alert
                    severity={
                      result.action === 'allow'
                        ? 'success'
                        : result.action === 'require_approval'
                        ? 'warning'
                        : 'error'
                    }
                    icon={
                      result.action === 'allow' ? (
                        <CheckCircleOutlineIcon fontSize="inherit" />
                      ) : result.action === 'require_approval' ? (
                        <HourglassEmptyIcon fontSize="inherit" />
                      ) : (
                        <ErrorOutlineIcon fontSize="inherit" />
                      )
                    }
                    sx={{ mb: 2 }}
                  >
                    <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
                      DECISION: {result.action.toUpperCase().replace('_', ' ')}
                    </Typography>
                  </Alert>

                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1, fontWeight: 600 }}>
                    REASONS & POLICIES FIRED:
                  </Typography>
                  <Paper variant="outlined" sx={{ p: 1.5, mb: 2, backgroundColor: 'rgba(255, 255, 255, 0.02)' }}>
                    <ul style={{ margin: 0, paddingLeft: 20 }}>
                      {result.reasons?.map((r, i) => (
                        <li key={i}>
                          <Typography variant="body2">{r}</Typography>
                        </li>
                      ))}
                    </ul>
                  </Paper>

                  <Typography variant="caption" color="text.secondary" display="block" sx={{ mb: 1, fontWeight: 600 }}>
                    RAW OPA RESPONSE:
                  </Typography>
                  <Paper
                    variant="outlined"
                    sx={{
                      p: 1.5,
                      backgroundColor: '#050811',
                      fontFamily: 'monospace',
                      fontSize: '0.8rem',
                      overflowX: 'auto',
                      maxHeight: 200
                    }}
                  >
                    <pre style={{ margin: 0 }}>{JSON.stringify(result, null, 2)}</pre>
                  </Paper>
                </Box>
              ) : (
                <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
                  <RuleIcon sx={{ fontSize: 50, opacity: 0.3, mb: 1 }} />
                  <Typography variant="body2">
                    Click "Evaluate Policy in OPA" to execute the Rego policy engine against the input document.
                  </Typography>
                </Box>
              )}
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Live End-to-End Policy Governance Banner */}
      <Card sx={{ mt: 3, borderLeft: '4px solid #ab47bc' }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <Box>
              <Typography variant="subtitle1" sx={{ fontWeight: 700, display: 'flex', alignItems: 'center', gap: 1 }}>
                <RuleIcon color="secondary" /> Live End-to-End Policy Governance in Production
              </Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>
                OPA and Rego policies are executed live in both:
                (1) <b>Access Request Pipeline</b> (<code>/access-requests</code>) to decide between Auto-Approve, Pending Admin Queue, or Deny.
                (2) <b>In-App SQL Workspace</b> (<code>/workspace</code>) to pre-emptively inspect queries and block unauthorized operations before database execution.
              </Typography>
            </Box>
            <Stack direction="row" spacing={1.5}>
              <Button variant="outlined" color="secondary" onClick={() => window.location.href = '/sessions'}>
                View JIT Requests
              </Button>
              <Button variant="contained" color="secondary" onClick={() => window.location.href = '/workspace'}>
                Open SQL Workspace
              </Button>
            </Stack>
          </Box>
        </CardContent>
      </Card>
    </Box>
  );
}
