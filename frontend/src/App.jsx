// frontend/src/App.jsx
import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { ThemeProvider, CssBaseline } from '@mui/material';
import { theme } from './theme/theme.js';
import { AuthProvider } from './context/AuthContext.jsx';
import ProtectedRoute from './components/auth/ProtectedRoute.jsx';
import Layout from './components/layout/Layout.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import LoginPage from './pages/LoginPage.jsx';
import UserManagement from './pages/UserManagement.jsx';
import ProfilesPage from './pages/ProfilesPage.jsx';
import PoliciesPage from './pages/PoliciesPage.jsx';
import SessionsPage from './pages/SessionsPage.jsx';
import WorkspacePage from './pages/WorkspacePage.jsx';
import SqlEventsPage from './pages/SqlEventsPage.jsx';
import ViolationsPage from './pages/ViolationsPage.jsx';
import ThreatFeedPage from './pages/ThreatFeedPage.jsx';
import NotFound from './pages/NotFound.jsx';

export default function App() {
  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <AuthProvider>
        <BrowserRouter>
          <Routes>
            {/* Public route */}
            <Route path="/login" element={<LoginPage />} />

            {/* Protected application shell */}
            <Route
              path="/"
              element={
                <ProtectedRoute>
                  <Layout />
                </ProtectedRoute>
              }
            >
              <Route index element={<DashboardPage />} />
              <Route path="profiles" element={<ProfilesPage />} />
              <Route path="policies" element={<PoliciesPage />} />
              <Route path="sessions" element={<SessionsPage />} />
              <Route path="workspace" element={<WorkspacePage />} />
              <Route path="sql-events" element={<ProtectedRoute requiredRoles={['admin', 'dba']}><SqlEventsPage /></ProtectedRoute>} />
              <Route path="violations" element={<ProtectedRoute requiredRoles={['admin', 'dba']}><ViolationsPage /></ProtectedRoute>} />
              <Route path="threats" element={<ProtectedRoute requiredRoles={['admin', 'dba']}><ThreatFeedPage /></ProtectedRoute>} />
              <Route
                path="users"
                element={
                  <ProtectedRoute requiredRoles={['admin']}>
                    <UserManagement />
                  </ProtectedRoute>
                }
              />
              <Route path="*" element={<NotFound />} />
            </Route>

            {/* Fallback */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </BrowserRouter>
      </AuthProvider>
    </ThemeProvider>
  );
}
