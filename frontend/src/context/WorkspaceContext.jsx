// frontend/src/context/WorkspaceContext.jsx
import React, { createContext, useContext, useState } from 'react';

const DEFAULT_SAMPLE_SQL = "SELECT customer_code, name, customer_category, credit_limit FROM Customers WHERE customer_category = 'enterprise' LIMIT 5;";

const WorkspaceContext = createContext(null);

export function WorkspaceProvider({ children }) {
  // Session selection & editor state
  const [selectedSessionId, setSelectedSessionId] = useState('');
  const [sqlQuery, setSqlQuery] = useState(DEFAULT_SAMPLE_SQL);
  const [executionResult, setExecutionResult] = useState(null);
  const [activeTab, setActiveTab] = useState(0);

  // Session telemetry cached in memory
  const [history, setHistory] = useState([]);
  const [violations, setViolations] = useState([]);

  const resetWorkspace = () => {
    setSelectedSessionId('');
    setSqlQuery(DEFAULT_SAMPLE_SQL);
    setExecutionResult(null);
    setActiveTab(0);
    setHistory([]);
    setViolations([]);
  };

  const value = {
    selectedSessionId,
    setSelectedSessionId,
    sqlQuery,
    setSqlQuery,
    executionResult,
    setExecutionResult,
    activeTab,
    setActiveTab,
    history,
    setHistory,
    violations,
    setViolations,
    resetWorkspace
  };

  return (
    <WorkspaceContext.Provider value={value}>
      {children}
    </WorkspaceContext.Provider>
  );
}

export function useWorkspace() {
  const context = useContext(WorkspaceContext);
  if (!context) {
    throw new Error('useWorkspace must be used within a WorkspaceProvider');
  }
  return context;
}
