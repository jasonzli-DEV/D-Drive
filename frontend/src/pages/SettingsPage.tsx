import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Container,
  Paper,
  Typography,
  Button,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  Chip,
} from '@mui/material';
import { Key, Trash2, Copy, Plus } from 'lucide-react';
import { formatDistance } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../lib/api';

interface ApiKey {
  id: string;
  key: string;
  name: string;
  createdAt: string;
  lastUsed?: string;
}

export default function SettingsPage() {
  const queryClient = useQueryClient();
  const [newKeyOpen, setNewKeyOpen] = useState(false);
  const [keyName, setKeyName] = useState('');
  const [newKey, setNewKey] = useState<string | null>(null);

  const { data: apiKeys } = useQuery({
    queryKey: ['apiKeys'],
    queryFn: async () => {
      const response = await api.get('/api-keys');
      return response.data as ApiKey[];
    },
  });

  const createKeyMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await api.post('/api-keys', { name });
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
      setNewKey(data.key);
      toast.success('API key created!');
      setKeyName('');
    },
  });

  const deleteKeyMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/api-keys/${id}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['apiKeys'] });
      toast.success('API key deleted!');
    },
  });

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard!');
  };

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>
        Settings
      </Typography>

      <Paper sx={{ mt: 3, p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h6">API Keys</Typography>
          <Button
            variant="contained"
            startIcon={<Plus />}
            onClick={() => setNewKeyOpen(true)}
          >
            Create API Key
          </Button>
        </Box>

        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          API keys allow you to use the D-Drive CLI and programmatic access to your files.
        </Typography>

        <TableContainer>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Key</TableCell>
                <TableCell>Created</TableCell>
                <TableCell>Last Used</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {apiKeys?.map((key) => (
                <TableRow key={key.id}>
                  <TableCell>{key.name}</TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <code>{key.key.substring(0, 20)}...</code>
                      <IconButton
                        size="small"
                        onClick={() => copyToClipboard(key.key)}
                      >
                        <Copy size={16} />
                      </IconButton>
                    </Box>
                  </TableCell>
                  <TableCell>
                    {formatDistance(new Date(key.createdAt), new Date(), {
                      addSuffix: true,
                    })}
                  </TableCell>
                  <TableCell>
                    {key.lastUsed
                      ? formatDistance(new Date(key.lastUsed), new Date(), {
                          addSuffix: true,
                        })
                      : 'Never'}
                  </TableCell>
                  <TableCell align="right">
                    <IconButton
                      onClick={() => deleteKeyMutation.mutate(key.id)}
                      size="small"
                      color="error"
                    >
                      <Trash2 size={18} />
                    </IconButton>
                  </TableCell>
                </TableRow>
              ))}
              {(!apiKeys || apiKeys.length === 0) && (
                <TableRow>
                  <TableCell colSpan={5} align="center" sx={{ py: 4 }}>
                    <Typography color="text.secondary">
                      No API keys yet. Create one to use the CLI tool.
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      </Paper>

      {/* Create API Key Dialog */}
      <Dialog
        open={newKeyOpen}
        onClose={() => {
          setNewKeyOpen(false);
          setNewKey(null);
          setKeyName('');
        }}
      >
        <DialogTitle>Create API Key</DialogTitle>
        <DialogContent>
          {newKey ? (
            <Box>
              <Typography variant="body2" color="text.secondary" gutterBottom>
                Your API key has been created. Copy it now - you won't be able to see it again!
              </Typography>
              <Paper
                sx={{
                  p: 2,
                  mt: 2,
                  backgroundColor: '#f5f5f5',
                  fontFamily: 'monospace',
                  wordBreak: 'break-all',
                }}
              >
                {newKey}
              </Paper>
              <Button
                fullWidth
                variant="contained"
                startIcon={<Copy />}
                onClick={() => copyToClipboard(newKey)}
                sx={{ mt: 2 }}
              >
                Copy to Clipboard
              </Button>
            </Box>
          ) : (
            <TextField
              autoFocus
              margin="dense"
              label="API Key Name"
              placeholder="e.g., My Server Backups"
              fullWidth
              value={keyName}
              onChange={(e) => setKeyName(e.target.value)}
              onKeyPress={(e) => {
                if (e.key === 'Enter' && keyName) {
                  createKeyMutation.mutate(keyName);
                }
              }}
            />
          )}
        </DialogContent>
        <DialogActions>
          {newKey ? (
            <Button
              onClick={() => {
                setNewKeyOpen(false);
                setNewKey(null);
                setKeyName('');
              }}
            >
              Done
            </Button>
          ) : (
            <>
              <Button onClick={() => setNewKeyOpen(false)}>Cancel</Button>
              <Button
                onClick={() => createKeyMutation.mutate(keyName)}
                variant="contained"
                disabled={!keyName}
              >
                Create
              </Button>
            </>
          )}
        </DialogActions>
      </Dialog>
    </Container>
  );
}
