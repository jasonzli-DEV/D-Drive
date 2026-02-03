import { useEffect, useState } from 'react';
import {
  Container,
  Paper,
  Typography,
  Box,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Chip,
  CircularProgress,
  Alert,
  ToggleButtonGroup,
  ToggleButton,
} from '@mui/material';
import { CheckCircle, XCircle, Upload, Copy, Trash2, PlayCircle } from 'lucide-react';
import { api } from '../lib/api';

interface Log {
  id: string;
  type: 'TASK' | 'UPLOAD' | 'COPY' | 'DELETE';
  action: string;
  success: boolean;
  message?: string;
  metadata?: string;
  createdAt: string;
}

export default function LogsPage() {
  const [logs, setLogs] = useState<Log[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<string>('all');

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params = filter !== 'all' ? { type: filter } : {};
      const resp = await api.get('/logs', { params });
      setLogs(resp.data.logs);
      setError(null);
    } catch (err) {
      console.error('Error fetching logs:', err);
      setError('Failed to load logs');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchLogs();
  }, [filter]);

  const getTypeIcon = (type: string) => {
    switch (type) {
      case 'TASK':
        return <PlayCircle size={18} />;
      case 'UPLOAD':
        return <Upload size={18} />;
      case 'COPY':
        return <Copy size={18} />;
      case 'DELETE':
        return <Trash2 size={18} />;
      default:
        return null;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case 'TASK':
        return 'primary';
      case 'UPLOAD':
        return 'success';
      case 'COPY':
        return 'info';
      case 'DELETE':
        return 'warning';
      default:
        return 'default';
    }
  };

  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleString();
  };

  const parseMetadata = (metadata?: string) => {
    if (!metadata) return null;
    try {
      return JSON.parse(metadata);
    } catch {
      return null;
    }
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Box sx={{ mb: 4 }}>
        <Typography variant="h4" gutterBottom>
          Activity Logs
        </Typography>
        <Typography variant="body2" color="text.secondary">
          Track all operations including task runs, file uploads, copies, and deletions
        </Typography>
      </Box>

      <Paper sx={{ mb: 3, p: 2 }}>
        <ToggleButtonGroup
          value={filter}
          exclusive
          onChange={(_, newFilter) => {
            if (newFilter !== null) setFilter(newFilter);
          }}
          size="small"
        >
          <ToggleButton value="all">All</ToggleButton>
          <ToggleButton value="task">Tasks</ToggleButton>
          <ToggleButton value="upload">Uploads</ToggleButton>
          <ToggleButton value="copy">Copies</ToggleButton>
          <ToggleButton value="delete">Deletions</ToggleButton>
        </ToggleButtonGroup>
      </Paper>

      {loading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : error ? (
        <Alert severity="error">{error}</Alert>
      ) : logs.length === 0 ? (
        <Paper sx={{ p: 4, textAlign: 'center' }}>
          <Typography color="text.secondary">No logs found</Typography>
        </Paper>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Time</TableCell>
                <TableCell>Type</TableCell>
                <TableCell>Action</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Details</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {logs.map((log) => {
                const metadata = parseMetadata(log.metadata);
                return (
                  <TableRow key={log.id}>
                    <TableCell sx={{ whiteSpace: 'nowrap' }}>
                      {formatDate(log.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Chip
                        icon={getTypeIcon(log.type)}
                        label={log.type}
                        size="small"
                        color={getTypeColor(log.type) as any}
                      />
                    </TableCell>
                    <TableCell>{log.action}</TableCell>
                    <TableCell>
                      {log.success ? (
                        <Chip
                          icon={<CheckCircle size={16} />}
                          label="Success"
                          size="small"
                          color="success"
                        />
                      ) : (
                        <Chip
                          icon={<XCircle size={16} />}
                          label="Failed"
                          size="small"
                          color="error"
                        />
                      )}
                    </TableCell>
                    <TableCell>
                      {log.message && (
                        <Typography variant="body2" color="text.secondary">
                          {log.message}
                        </Typography>
                      )}
                      {metadata && (
                        <Typography variant="caption" color="text.secondary">
                          {Object.entries(metadata)
                            .map(([k, v]) => `${k}: ${v}`)
                            .join(', ')}
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </TableContainer>
      )}
    </Container>
  );
}
