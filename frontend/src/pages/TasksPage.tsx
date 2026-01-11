import { useState, useEffect } from 'react';
import {
  Box,
  Button,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  FormControlLabel,
  Checkbox,
  Select,
  MenuItem,
  InputLabel,
  FormControl,
  IconButton,
  Typography,
  Table,
  TableHead,
  TableRow,
  TableCell,
  TableBody,
  CircularProgress,
} from '@mui/material';
import { Plus, Play, Trash, Edit } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import toast from 'react-hot-toast';

const defaultForm = {
  id: undefined as string | undefined,
  name: '',
  enabled: true,
  sftpHost: '',
  sftpPort: 22,
  sftpUser: '',
  sftpPath: '/',
  sftpPrivateKey: '',
  destinationId: '' as string | null,
  compress: 'NONE',
  timestampNames: true,
  maxFiles: 0,
  encrypt: false,
};

export default function TasksPage() {
  const queryClient = useQueryClient();
  const { data: tasks, isLoading } = useQuery<any[]>({
    queryKey: ['tasks'],
    queryFn: async () => {
      const resp = await api.get('/tasks');
      return resp.data as any[];
    },
  });

  const { data: allFolders } = useQuery<any[]>({
    queryKey: ['allFoldersForTasks'],
    queryFn: async () => {
      const resp = await api.get('/files/folders/all');
      return resp.data as any[];
    },
  });

  const createMutation = useMutation({
    mutationFn: (payload: any) => api.post('/tasks', payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tasks'] }); toast.success('Task created'); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to create task'),
  });

  const updateMutation = useMutation({
    mutationFn: (payload: any) => api.patch(`/tasks/${payload.id}`, payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tasks'] }); toast.success('Task updated'); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to update task'),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/tasks/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tasks'] }); toast.success('Task deleted'); },
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to delete task'),
  });

  const runNowMutation = useMutation({
    mutationFn: (id: string) => api.post(`/tasks/${id}/run`),
    onSuccess: () => toast.success('Task run started'),
    onError: (e: any) => toast.error(e?.response?.data?.error || 'Failed to run task'),
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);

  useEffect(() => { if (!open) setForm(defaultForm); }, [open]);

  function openForEdit(t: any) {
    setForm({
      id: t.id,
      name: t.name || '',
      enabled: !!t.enabled,
      sftpHost: t.sftpHost || '',
      sftpPort: t.sftpPort || 22,
      sftpUser: t.sftpUser || '',
      sftpPath: t.sftpPath || '/',
      sftpPrivateKey: t.sftpPrivateKey || '',
      destinationId: t.destinationId || '',
      compress: t.compress || 'NONE',
      timestampNames: !!t.timestampNames,
      maxFiles: t.maxFiles || 0,
      encrypt: !!t.encrypt,
    });
    setOpen(true);
  }

  async function save() {
    const payload = { ...form };
    if (form.id) {
      await updateMutation.mutateAsync(payload);
    } else {
      await createMutation.mutateAsync(payload);
    }
    setOpen(false);
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
        <Typography variant="h5">Tasks</Typography>
        <Button startIcon={<Plus size={16} />} onClick={() => setOpen(true)}>New Task</Button>
      </Box>

      {isLoading ? <CircularProgress /> : (
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>Enabled</TableCell>
              <TableCell>Destination</TableCell>
              <TableCell>Compress</TableCell>
              <TableCell>Encrypt</TableCell>
              <TableCell>Max Files</TableCell>
              <TableCell>Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {tasks && tasks.map((t: any) => (
              <TableRow key={t.id}>
                <TableCell>{t.name}</TableCell>
                <TableCell>{t.enabled ? 'Yes' : 'No'}</TableCell>
                <TableCell>{allFolders?.find((f: any) => f.id === t.destinationId)?.path || '-'}</TableCell>
                <TableCell>{t.compress}</TableCell>
                <TableCell>{t.encrypt ? 'Yes' : 'No'}</TableCell>
                <TableCell>{t.maxFiles || 0}</TableCell>
                <TableCell>
                  <IconButton onClick={() => runNowMutation.mutate(t.id)} title="Run now"><Play size={16} /></IconButton>
                  <IconButton onClick={() => openForEdit(t)} title="Edit"><Edit size={16} /></IconButton>
                  <IconButton onClick={() => deleteMutation.mutate(t.id)} title="Delete"><Trash size={16} /></IconButton>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{form.id ? 'Edit Task' : 'New Task'}</DialogTitle>
        <DialogContent>
          <TextField label="Name" fullWidth margin="normal" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          <FormControlLabel control={<Checkbox checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />} label="Enabled" />

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="SFTP Host" value={form.sftpHost} onChange={(e) => setForm({ ...form, sftpHost: e.target.value })} fullWidth />
            <TextField label="Port" type="number" value={form.sftpPort} onChange={(e) => setForm({ ...form, sftpPort: Number(e.target.value) })} sx={{ width: 120 }} />
          </Box>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="SFTP User" value={form.sftpUser} onChange={(e) => setForm({ ...form, sftpUser: e.target.value })} fullWidth />
            <TextField label="Remote Path" value={form.sftpPath} onChange={(e) => setForm({ ...form, sftpPath: e.target.value })} fullWidth />
          </Box>

          <TextField label="SFTP Private Key" multiline minRows={4} fullWidth margin="normal" value={form.sftpPrivateKey} onChange={(e) => setForm({ ...form, sftpPrivateKey: e.target.value })} />

          <FormControl fullWidth margin="normal">
            <InputLabel id="dest-label">Destination Folder</InputLabel>
            <Select labelId="dest-label" value={form.destinationId || ''} label="Destination Folder" onChange={(e) => setForm({ ...form, destinationId: e.target.value as string })}>
              <MenuItem value="">(root)</MenuItem>
              {allFolders?.map((f: any) => (
                <MenuItem key={f.id} value={f.id}>{f.path}</MenuItem>
              ))}
            </Select>
          </FormControl>

          <FormControl fullWidth margin="normal">
            <InputLabel id="compress-label">Compress</InputLabel>
            <Select labelId="compress-label" value={form.compress} label="Compress" onChange={(e) => setForm({ ...form, compress: e.target.value as string })}>
              <MenuItem value={'NONE'}>None</MenuItem>
              <MenuItem value={'ZIP'}>ZIP</MenuItem>
              <MenuItem value={'TAR_GZ'}>TAR.GZ</MenuItem>
            </Select>
          </FormControl>

          <FormControlLabel control={<Checkbox checked={form.timestampNames} onChange={(e) => setForm({ ...form, timestampNames: e.target.checked })} />} label="Timestamp filenames" />

          <TextField label="Max files (0 = unlimited)" type="number" fullWidth margin="normal" value={form.maxFiles} onChange={(e) => setForm({ ...form, maxFiles: Number(e.target.value) })} />

          <FormControlLabel control={<Checkbox checked={form.encrypt} onChange={(e) => setForm({ ...form, encrypt: e.target.checked })} />} label="Encrypt (override user's default)" />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button variant="contained" onClick={save}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
