// frontend/src/context/AuthContext.jsx
import React, { createContext, useContext, useState, useEffect } from 'react';

const AuthContext = createContext(null);

const normalizeUser = (u) => {
  if (!u) return null;
  const primaryRole = (u.roles && u.roles[0]) ? u.roles[0] : (u.role || 'developer');
  return {
    ...u,
    role: primaryRole,
    roles: Array.isArray(u.roles) ? u.roles : [primaryRole]
  };
};

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [accessToken, setAccessToken] = useState(() => localStorage.getItem('itds_access_token') || null);
  const [refreshToken, setRefreshToken] = useState(() => localStorage.getItem('itds_refresh_token') || null);
  const [loading, setLoading] = useState(true);

  // Hydrate user on mount if token exists
  useEffect(() => {
    async function loadUser() {
      const token = localStorage.getItem('itds_access_token');
      if (!token) {
        setLoading(false);
        return;
      }

      try {
        const res = await fetch('/auth/me', {
          headers: {
            Authorization: `Bearer ${token}`
          }
        });
        const data = await res.json();
        if (res.ok && data.success) {
          setUser(normalizeUser(data.data.user));
        } else {
          // Token invalid or expired
          logout();
        }
      } catch {
        logout();
      } finally {
        setLoading(false);
      }
    }

    loadUser();
  }, []);

  const login = async (username, password) => {
    const res = await fetch('/auth/login', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({ username, password })
    });

    const data = await res.json();

    if (!res.ok || !data.success) {
      throw new Error(data.error?.message || 'Authentication failed');
    }

    const { user: authUser, accessToken: newAccess, refreshToken: newRefresh } = data.data;
    const normalizedUser = normalizeUser(authUser);

    setUser(normalizedUser);
    setAccessToken(newAccess);
    setRefreshToken(newRefresh);

    localStorage.setItem('itds_access_token', newAccess);
    localStorage.setItem('itds_refresh_token', newRefresh);

    return normalizedUser;
  };

  const logout = async () => {
    const token = accessToken || localStorage.getItem('itds_access_token');
    const refresh = refreshToken || localStorage.getItem('itds_refresh_token');

    if (token) {
      try {
        await fetch('/auth/logout', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`
          },
          body: JSON.stringify({ refreshToken: refresh })
        });
      } catch {
        // Ignore logout request failure on client
      }
    }

    setUser(null);
    setAccessToken(null);
    setRefreshToken(null);
    localStorage.removeItem('itds_access_token');
    localStorage.removeItem('itds_refresh_token');
  };

  const hasRole = (role) => {
    if (!user || !user.roles) return false;
    return user.roles.includes(role);
  };

  const hasAnyRole = (roles = []) => {
    if (!user || !user.roles) return false;
    return roles.some(r => user.roles.includes(r));
  };

  const hasPermission = (permission) => {
    if (!user || !user.permissions) return false;
    return user.permissions.includes(permission);
  };

  const value = {
    user,
    accessToken,
    refreshToken,
    loading,
    isAuthenticated: !!user,
    login,
    logout,
    hasRole,
    hasAnyRole,
    hasPermission
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
