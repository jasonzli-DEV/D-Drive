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
import FolderSelectDialog from '../components/FolderSelectDialog';

  const defaultForm = {
  id: undefined as string | undefined,
  name: '',
  enabled: true,
  cron: '* * * * *',
  sftpHost: '',
  sftpPort: 22,
  sftpUser: '',
  sftpPath: '/',
  sftpPrivateKey: '',
  sftpPassword: '',
  authPassword: false,
  authPrivateKey: true,
  destinationId: '' as string | null,
  compress: 'NONE',
  maxFiles: 0,
  // encrypt override removed; tasks use user's default encrypt setting
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
  const [destDialogOpen, setDestDialogOpen] = useState(false);

  useEffect(() => { if (!open) setForm(defaultForm); }, [open]);

  function openForEdit(t: any) {
    setForm({
      id: t.id,
      name: t.name || '',
      enabled: !!t.enabled,
      cron: t.cron || '* * * * *',
      sftpHost: t.sftpHost || '',
      sftpPort: t.sftpPort || 22,
      sftpUser: t.sftpUser || '',
      sftpPath: t.sftpPath || '/',
      sftpPrivateKey: t.sftpPrivateKey || '',
      sftpPassword: t.sftpPassword || '',
      authPassword: !!t.authPassword,
      authPrivateKey: t.authPrivateKey === undefined ? true : !!t.authPrivateKey,
      destinationId: t.destinationId || '',
      compress: t.compress || 'NONE',
          // always timestamp filenames for task uploads
          // timestampNames: !!t.timestampNames,
      maxFiles: t.maxFiles || 0,
      
    });
    setOpen(true);
  }

  async function save(runNow = false) {
    const payload = { ...form, timestampNames: true };
    try {
      let resp: any;
      if (form.id) {
        resp = await updateMutation.mutateAsync(payload);
      } else {
        resp = await createMutation.mutateAsync(payload);
      }

      // resp may be axios response or direct data depending on mutationFn; normalize
      const task = resp?.data ? resp.data : resp;

      setOpen(false);

      if (runNow && task?.id) {
        try {
          await runNowMutation.mutateAsync(task.id);
          toast.success('Run started');
        } catch (err: any) {
          toast.error(err?.response?.data?.error || err?.message || 'Failed to start run');
        }
      }
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.response?.data || err?.message || String(err);
      toast.error(`Failed to save task: ${message}`);
    }
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
                  <TableCell>Last Run</TableCell>
                  <TableCell>Compress</TableCell>
                  <TableCell>Max Files</TableCell>
                  <TableCell>Actions</TableCell>
                </TableRow>
              </TableHead>
          <TableBody>
            {tasks && tasks.map((t: any) => (
              <TableRow key={t.id}>
                <TableCell>{t.name}</TableCell>
                <TableCell>{t.enabled ? 'Yes' : 'No'}</TableCell>
                <TableCell>{allFolders?.find((f: any) => f.id === t.destinationId)?.path || '/'}</TableCell>
                <TableCell>{t.lastRun ? new Date(t.lastRun).toLocaleString() : '-'}</TableCell>
                <TableCell>{t.compress}</TableCell>
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
          <TextField label="Cron (cron expression)" fullWidth margin="normal" value={form.cron} onChange={(e) => setForm({ ...form, cron: e.target.value })} helperText="e.g. 0 2 * * * (daily at 02:00)" />
          <FormControlLabel control={<Checkbox checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />} label="Enabled" />

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="SFTP Host" value={form.sftpHost} onChange={(e) => setForm({ ...form, sftpHost: e.target.value })} fullWidth />
            <TextField label="Port" type="number" value={form.sftpPort} onChange={(e) => setForm({ ...form, sftpPort: Number(e.target.value) })} sx={{ width: 120 }} />
          </Box>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="SFTP User" value={form.sftpUser} onChange={(e) => setForm({ ...form, sftpUser: e.target.value })} fullWidth />
            <TextField label="Remote Path" value={form.sftpPath} onChange={(e) => setForm({ ...form, sftpPath: e.target.value })} fullWidth />
          </Box>

          {/* SFTP private key input moved into authentication section below */}

          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" sx={{ mb: 1 }}>Destination Folder</Typography>
            <Button variant="outlined" onClick={() => setDestDialogOpen(true)} sx={{ mb: 1 }}>
              {form.destinationId ? (allFolders?.find((f:any)=>f.id===form.destinationId)?.path || 'Selected folder') : '/'}
            </Button>
          </Box>

          {/* Destination folder selector dialog (reuses Move dialog style) */}
          <FolderSelectDialog open={destDialogOpen} value={form.destinationId || null} onClose={() => setDestDialogOpen(false)} onSelect={(id) => setForm({ ...form, destinationId: id })} title="Select destination folder" />

          <FormControl fullWidth margin="normal">
            <InputLabel id="compress-label">Compress</InputLabel>
            <Select labelId="compress-label" value={form.compress} label="Compress" onChange={(e) => setForm({ ...form, compress: e.target.value as string })}>
              <MenuItem value={'NONE'}>None</MenuItem>
              <MenuItem value={'ZIP'}>ZIP</MenuItem>
              <MenuItem value={'TAR_GZ'}>TAR.GZ</MenuItem>
            </Select>
          </FormControl>

          <Box sx={{ mt: 2 }}>
            <Typography variant="subtitle2">Authentication methods</Typography>
            <FormControlLabel control={<Checkbox checked={form.authPassword} onChange={(e) => setForm({ ...form, authPassword: e.target.checked })} />} label="Attempt password" />
            <FormControlLabel control={<Checkbox checked={form.authPrivateKey} onChange={(e) => setForm({ ...form, authPrivateKey: e.target.checked })} />} label="Attempt private key" />
            {form.authPassword && (
              <TextField label="SFTP Password" type="password" fullWidth margin="normal" value={form.sftpPassword} onChange={(e) => setForm({ ...form, sftpPassword: e.target.value })} />
            )}
            {form.authPrivateKey && (
              <TextField label="SFTP Private Key" multiline minRows={4} fullWidth margin="normal" value={form.sftpPrivateKey} onChange={(e) => setForm({ ...form, sftpPrivateKey: e.target.value })} />
            )}
          </Box>

          <TextField label="Max files (0 = unlimited)" type="number" fullWidth margin="normal" value={form.maxFiles} onChange={(e) => setForm({ ...form, maxFiles: Number(e.target.value) })} />

          {/* Encrypt override removed: tasks will follow user's default encryption setting */}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button color="secondary" onClick={() => save(true)}>Save & Run</Button>
          <Button variant="contained" onClick={() => save(false)}>Save</Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
