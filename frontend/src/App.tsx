import { Routes, Route, Navigate, useLocation } from 'react-router-dom';
import { useAuth } from './hooks/useAuth';
import { Box, CircularProgress } from '@mui/material';
import Layout from './components/Layout';
import LoginPage from './pages/LoginPage';
import DrivePage from './pages/DrivePage';
import SettingsPage from './pages/SettingsPage';
import CallbackPage from './pages/CallbackPage';
import ErrorBoundary from './components/ErrorBoundary';
import TasksPage from './pages/TasksPage';
import LogsPage from './pages/LogsPage';
import RecycleBinPage from './pages/RecycleBinPage';
import SharedPage from './pages/SharedPage';
import StarredPage from './pages/StarredPage';
import SetupPage from './pages/SetupPage';
import MetricsPage from './pages/MetricsPage';
import HelpPage from './pages/HelpPage';
import LinksPage from './pages/LinksPage';
import PublicLinkPage from './pages/PublicLinkPage';
import { useState, useEffect } from 'react';
import api from './lib/api';

function App() {
  const { isAuthenticated, loading: authLoading } = useAuth();
  const location = useLocation();
  const [setupStatus, setSetupStatus] = useState<{ checked: boolean; required: boolean }>({
    checked: false,
    required: false,
  });

  // Check setup status on mount
  useEffect(() => {
    const checkSetup = async () => {
      try {
        const response = await api.get<{ setupRequired: boolean }>('/setup/status');
        setSetupStatus({ checked: true, required: response.data.setupRequired });
      } catch (err) {
        // If setup status check fails, assume setup is complete (server might not be responding)
        setSetupStatus({ checked: true, required: false });
      }
    };
    checkSetup();
  }, []);

  // Show loading spinner while checking setup and auth
  if (!setupStatus.checked || authLoading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          bgcolor: '#0a0e1a',
        }}
      >
        <CircularProgress size={60} />
      </Box>
    );
  }

  // If setup is required, redirect all routes to /setup (except /setup itself)
  if (setupStatus.required && location.pathname !== '/setup') {
    return <Navigate to="/setup" replace />;
  }

  // If setup is complete and user is on /setup, redirect to login
  if (!setupStatus.required && location.pathname === '/setup') {
    return <Navigate to="/login" replace />;
  }

  return (
    <ErrorBoundary>
      <Routes>
      <Route path="/setup" element={<SetupPage />} />
      <Route path="/login" element={<LoginPage />} />
      <Route path="/auth/callback" element={<CallbackPage />} />
      
      <Route
        path="/"
        element={
          isAuthenticated ? (
            <Layout>
              <DrivePage />
            </Layout>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      
      <Route
        path="/drive/:folderId"
        element={
          isAuthenticated ? (
            <Layout>
              <DrivePage />
            </Layout>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      
      <Route
        path="/settings"
        element={
          isAuthenticated ? (
            <Layout>
              <SettingsPage />
            </Layout>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/tasks"
        element={
          isAuthenticated ? (
            <Layout>
              <TasksPage />
            </Layout>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/logs"
        element={
          isAuthenticated ? (
            <Layout>
              <LogsPage />
            </Layout>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/recycle-bin"
        element={
          isAuthenticated ? (
            <Layout>
              <RecycleBinPage />
            </Layout>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/shared"
        element={
          isAuthenticated ? (
            <Layout>
              <SharedPage />
            </Layout>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/starred"
        element={
          isAuthenticated ? (
            <Layout>
              <StarredPage />
            </Layout>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/links"
        element={
          isAuthenticated ? (
            <Layout>
              <LinksPage />
            </Layout>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/metrics"
        element={
          isAuthenticated ? (
            <Layout>
              <MetricsPage />
            </Layout>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      <Route
        path="/help"
        element={
          isAuthenticated ? (
            <Layout>
              <HelpPage />
            </Layout>
          ) : (
            <Navigate to="/login" replace />
          )
        }
      />
      
      <Route path="/link/:slug" element={<PublicLinkPage />} />
      
      <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
