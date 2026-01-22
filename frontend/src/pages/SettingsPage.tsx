import { useState, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Container,
  Paper,
  Typography,
  Button,
  FormControlLabel,
  Switch,
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
} from '@mui/material';
import { Trash2, Copy, Plus } from 'lucide-react';
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
    onError: (error: any) => {
      const status = error?.response?.status;
      const msg = error?.response?.data?.error;
      if (status === 409) {
        toast.error(msg || 'An API key with that name already exists');
        return;
      }
      toast.error('Failed to create API key');
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

  const [encryptByDefault, setEncryptByDefault] = useState<boolean>(true);
  const [recycleBinEnabled, setRecycleBinEnabled] = useState<boolean>(true);
  const [allowSharedWithMe, setAllowSharedWithMe] = useState<boolean>(true);

  // Fetch current user preferences
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const resp = await api.get('/me');
        if (!mounted) return;
        if (typeof resp.data?.encryptByDefault === 'boolean') {
          setEncryptByDefault(resp.data.encryptByDefault);
        }
        if (typeof resp.data?.recycleBinEnabled === 'boolean') {
          setRecycleBinEnabled(resp.data.recycleBinEnabled);
        }
        if (typeof resp.data?.allowSharedWithMe === 'boolean') {
          setAllowSharedWithMe(resp.data.allowSharedWithMe);
        }
      } catch (err) {
        // ignore
      }
    })();
    return () => { mounted = false; };
  }, []);

  const updatePref = async (key: string, value: boolean) => {
    try {
      await api.patch('/me', { [key]: value });
      if (key === 'encryptByDefault') setEncryptByDefault(value);
      if (key === 'recycleBinEnabled') setRecycleBinEnabled(value);
      if (key === 'allowSharedWithMe') setAllowSharedWithMe(value);
      toast.success('Preference saved');
    } catch (err) {
      toast.error('Failed to save preference');
    }
  };

  

  // Server returns masked keys in the list; display as-provided

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>
        Settings
      </Typography>

      <Paper sx={{ mt: 3, p: 3 }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
          <Typography variant="h6">Preferences</Typography>
        </Box>
        <Box sx={{ mb: 2 }}>
          <FormControlLabel
            control={
              <Switch
                checked={encryptByDefault}
                onChange={(e) => updatePref('encryptByDefault', e.target.checked)}
              />
            }
            label="Encrypt uploads by default"
          />
        </Box>
        <Box sx={{ mb: 2 }}>
          <FormControlLabel
            control={
              <Switch
                checked={recycleBinEnabled}
                onChange={(e) => updatePref('recycleBinEnabled', e.target.checked)}
              />
            }
            label="Use recycle bin (move deleted files to trash instead of permanent deletion)"
          />
        </Box>
        <Box sx={{ mb: 2 }}>
          <FormControlLabel
            control={
              <Switch
                checked={allowSharedWithMe}
                onChange={(e) => updatePref('allowSharedWithMe', e.target.checked)}
              />
            }
            label="Allow others to share files with me"
          />
        </Box>

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
                        <code>{key.key}</code>
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
        fullWidth
        maxWidth="md"
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
                  {/* show the key in a readonly TextField so we can reliably select+copy */}
                  <TextField
                    value={newKey}
                    inputProps={{ readOnly: true, style: { fontFamily: 'monospace' } }}
                    fullWidth
                    multiline
                    minRows={1}
                    sx={{ mt: 2 }}
                    id="created-api-key-input"
                  />
                  <Button
                    fullWidth
                    variant="contained"
                    startIcon={<Copy />}
                    onClick={async () => {
                      if (!newKey) return;
                      // try Clipboard API first
                      try {
                        if (navigator.clipboard && navigator.clipboard.writeText) {
                          await navigator.clipboard.writeText(newKey);
                          toast.success('Copied to clipboard!');
                          return;
                        }
                      } catch (e) {
                        // fall through to legacy copy
                      }
                      // legacy fallback: select the input's text and execCommand
                      try {
                        const input = document.getElementById('created-api-key-input') as HTMLInputElement | null;
                        if (input) {
                          input.select();
                          document.execCommand('copy');
                          toast.success('Copied to clipboard!');
                          // deselect
                          window.getSelection()?.removeAllRanges();
                          return;
                        }
                      } catch (err) {
                        toast.error('Failed to copy to clipboard');
                      }
                    }}
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
