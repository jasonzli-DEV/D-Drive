import { Routes, Route, Navigate } from 'react-router-dom';
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

function App() {
  const { isAuthenticated, loading } = useAuth();

  // Show loading spinner while checking authentication
  if (loading) {
    return (
      <Box
        sx={{
          minHeight: '100vh',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        <CircularProgress size={60} />
      </Box>
    );
  }

  return (
    <ErrorBoundary>
      <Routes>
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
      </Routes>
    </ErrorBoundary>
  );
}

export default App;
