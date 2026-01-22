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
  Menu,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import { Plus, Play, Trash, Edit } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import toast from 'react-hot-toast';
import FolderSelectDialog from '../components/FolderSelectDialog';
import cronParser from 'cron-parser';
import cronValidate from 'cron-validate';

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
  function describeCron(expr: string) {
    if (!expr) return 'Enter a cron expression (5 fields)';
    try {
      const v = (cronValidate as any)(expr, { preset: 'default' });
      const ok = typeof v.isValid === 'function' ? v.isValid() : v;
      if (!ok) return 'Invalid cron expression';
    } catch (e) {
      return 'Invalid cron expression';
    }

    try {
      const interval = (cronParser as any).parseExpression(expr);
      const next = interval.next().toDate();
      const parts = expr.trim().split(/\s+/);
      const m = parts[0].match(/^\*\/(\d+)$/);
      if (m) return `At every ${m[1]}th minute — next: ${next.toLocaleString()}`;
      if (parts[0] === '0' && /^[0-2]?\d$/.test(parts[1])) return `Daily at ${parts[1].padStart(2, '0')}:00 — next: ${next.toLocaleString()}`;
      return `Next run: ${next.toLocaleString()}`;
    } catch (e) {
      return 'Invalid cron expression';
    }
  }
  const queryClient = useQueryClient();
  const { data: tasks, isLoading } = useQuery<any[]>({
    queryKey: ['tasks'],
    queryFn: async () => {
      const resp = await api.get('/tasks');
      return resp.data as any[];
    },
    staleTime: 2000, // Tasks data fresh for 2s
    gcTime: 5 * 60 * 1000,
    refetchInterval: 3000, // Auto-refresh every 3 seconds to update status
  });

  // Fetch running tasks progress
  const { data: runningProgress } = useQuery<{ tasks: { taskId: string; progress: any }[] }>({
    queryKey: ['runningTasksProgress'],
    queryFn: async () => {
      const resp = await api.get('/tasks/running/progress');
      return resp.data;
    },
    enabled: true,
    staleTime: 1000,
    refetchInterval: 2000, // Update progress every 2 seconds
  });

  // Helper to get progress for a specific task
  const getProgress = (taskId: string) => {
    return runningProgress?.tasks?.find(t => t.taskId === taskId)?.progress;
  };

  // Helper to format bytes
  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
  };

  const { data: allFolders } = useQuery<any[]>({
    queryKey: ['allFoldersForTasks'],
    queryFn: async () => {
      const resp = await api.get('/files/folders/all');
      return resp.data as any[];
    },
    staleTime: 60000,
    gcTime: 10 * 60 * 1000,
  });

  const createMutation = useMutation({
    mutationFn: (payload: any) => api.post('/tasks', payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tasks'] }); toast.success('Task created'); },
  });

  const updateMutation = useMutation({
    mutationFn: (payload: any) => api.patch(`/tasks/${payload.id}`, payload),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tasks'] }); toast.success('Task updated'); },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/tasks/${id}`),
    onSuccess: () => { queryClient.invalidateQueries({ queryKey: ['tasks'] }); toast.success('Task deleted'); },
  });

  const runNowMutation = useMutation({
    mutationFn: (id: string) => api.post(`/tasks/${id}/run`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Task run started');
    },
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [destDialogOpen, setDestDialogOpen] = useState(false);
  const [taskMenuAnchor, setTaskMenuAnchor] = useState<null | HTMLElement>(null);
  const [taskMenuPosition, setTaskMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [selectedTask, setSelectedTask] = useState<any | null>(null);

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

  const handleTaskContextMenu = (e: React.MouseEvent, task: any) => {
    e.preventDefault();
    setSelectedTask(task);
    const clientX = e.clientX;
    const clientY = e.clientY;
    const approxMenuWidth = 180;
    const approxMenuHeight = 150;
    const margin = 8;
    const maxLeft = Math.max(margin, window.innerWidth - approxMenuWidth - margin);
    const maxTop = Math.max(margin, window.innerHeight - approxMenuHeight - margin);
    const left = Math.min(clientX, maxLeft);
    const top = Math.min(clientY, maxTop);
    setTaskMenuAnchor(null);
    setTaskMenuPosition({ top, left });
  };

  const handleCloseTaskMenu = () => {
    setTaskMenuAnchor(null);
    setTaskMenuPosition(null);
    setSelectedTask(null);
  };

  const handleTaskMenuAction = (action: string) => {
    if (!selectedTask && action !== 'new') return;
    switch (action) {
      case 'edit':
        openForEdit(selectedTask);
        break;
      case 'run':
        (async () => {
          try {
            await runNowMutation.mutateAsync(selectedTask.id);
          } catch (e: any) {
            toast.error(e?.response?.data?.error || 'Failed to run task');
          }
        })();
        break;
      case 'delete':
        (async () => {
          if (!window.confirm(`Delete task "${selectedTask.name}"?`)) return;
          try {
            await deleteMutation.mutateAsync(selectedTask.id);
          } catch (e: any) {
            toast.error(e?.response?.data?.error || 'Failed to delete task');
          }
        })();
        break;
      case 'new':
        setOpen(true);
        break;
    }
    handleCloseTaskMenu();
  };

  async function save(runNow = false) {
    const payload = { ...form, timestampNames: true };
    try {
      // client-side validation (sets inline errors); stop if invalid
      const ok = validateForm(payload);
      if (!ok) return;

      let resp: any;
      if (form.id) resp = await updateMutation.mutateAsync(payload);
      else resp = await createMutation.mutateAsync(payload);

      const task = resp?.data ? resp.data : resp;
      setOpen(false);

      if (runNow && task?.id) {
        try {
          await runNowMutation.mutateAsync(task.id);
        } catch (err: any) {
          toast.error(err?.response?.data?.error || err?.message || 'Failed to start run');
        }
      }
    } catch (err: any) {
      const message = err?.response?.data?.error || err?.response?.data || err?.message || String(err);
      toast.error(message || 'Failed to save task');
    }
  }

  function validateForm(p: any) {
    const e: Record<string, string | null> = {};
    if (!p.name || String(p.name).trim().length === 0) e.name = 'Name is required';
    else e.name = null;

    if (!p.cron || String(p.cron).trim().length === 0) e.cron = 'Cron is required';
    else {
      try {
        const v = (cronValidate as any)(p.cron, { preset: 'default' });
        const ok = typeof v.isValid === 'function' ? v.isValid() : v;
        if (!ok) e.cron = 'Invalid cron expression';
        else e.cron = null;
      } catch (err) { e.cron = 'Invalid cron expression'; }
    }

    if (!p.sftpHost || String(p.sftpHost).trim().length === 0) e.sftpHost = 'SFTP host is required';
    else e.sftpHost = null;

    if (!p.sftpUser || String(p.sftpUser).trim().length === 0) e.sftpUser = 'SFTP user is required';
    else e.sftpUser = null;

    if (!p.sftpPath || String(p.sftpPath).trim().length === 0) e.sftpPath = 'Remote path is required';
    else e.sftpPath = null;

    const hasPasswordAuth = !!p.authPassword && !!p.sftpPassword;
    const hasKeyAuth = !!p.authPrivateKey && !!p.sftpPrivateKey;
    if (!hasPasswordAuth && !hasKeyAuth) e.auth = 'At least one authentication method with credentials is required';
    else e.auth = null;

    // maxFiles must be 0 or greater (0 = unlimited)
    if (p.maxFiles === undefined || p.maxFiles === null) e.maxFiles = null;
    else if (Number(p.maxFiles) < 0) e.maxFiles = 'Max files must be 0 or greater';
    else e.maxFiles = null;

    setErrors(e);

    return Object.values(e).every((v) => v === null);
  }

  // Helper to format runtime in minutes/hours
  function formatRuntime(seconds: number | null | undefined): string {
    if (!seconds || seconds < 0) return '-';
    if (seconds < 60) return `${seconds}s`;
    const mins = Math.round(seconds / 60);
    if (mins < 60) return `${mins}m`;
    const hours = Math.floor(mins / 60);
    const remainingMins = mins % 60;
    return `${hours}h ${remainingMins}m`;
  }

  return (
    <Box>
      <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 3 }}>
        <Typography variant="h4" fontWeight={600}>Backup Tasks</Typography>
        <Button 
          variant="contained" 
          startIcon={<Plus size={18} />} 
          onClick={() => setOpen(true)}
          sx={{ 
            px: 3, 
            py: 1,
            borderRadius: 2,
            textTransform: 'none',
            fontWeight: 500
          }}
        >
          New Task
        </Button>
      </Box>

      {isLoading ? <CircularProgress /> : (
        <Table sx={{ '& .MuiTableCell-root': { py: 1.5 } }}>
              <TableHead>
                <TableRow sx={{ bgcolor: 'action.hover' }}>
                  <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Status</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Destination</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Last Started</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Runtime</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Compress</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Max Files</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
          <TableBody>
            {tasks && tasks.map((t: any) => {
              // Task is running if lastStarted is more recent than lastRun
              const isRunning = t.lastStarted && (!t.lastRun || new Date(t.lastStarted) > new Date(t.lastRun));
              
              return (
              <TableRow key={t.id} hover onContextMenu={(e) => handleTaskContextMenu(e, t)}>
                <TableCell>
                  <Typography fontWeight={500}>{t.name}</Typography>
                </TableCell>
                <TableCell>
                  {isRunning ? (
                    <Box>
                      <Box 
                        sx={{ 
                          display: 'inline-flex',
                          alignItems: 'center',
                          px: 1.5,
                          py: 0.5,
                          borderRadius: 1,
                          bgcolor: 'primary.main',
                          color: 'primary.contrastText',
                          opacity: 0.9
                        }}
                      >
                        <Box 
                          sx={{ 
                            width: 8, 
                            height: 8, 
                            borderRadius: '50%', 
                            bgcolor: 'background.paper',
                            mr: 1,
                            animation: 'pulse 2s ease-in-out infinite',
                            '@keyframes pulse': {
                              '0%, 100%': { opacity: 1 },
                              '50%': { opacity: 0.3 },
                            }
                          }} 
                        />
                        Running
                      </Box>
                      {/* Show progress if available */}
                      {(() => {
                        const progress = getProgress(t.id);
                        if (!progress) return null;
                        
                        // Calculate percentage and ETA
                        const elapsedSec = (progress.elapsedMs || 0) / 1000;
                        let percentage = 0;
                        let eta = '';
                        
                        if (progress.totalFiles > 0 && progress.filesProcessed > 0) {
                          percentage = Math.round((progress.filesProcessed / progress.totalFiles) * 100);
                          const filesPerSec = progress.filesProcessed / elapsedSec;
                          if (filesPerSec > 0) {
                            const remainingFiles = progress.totalFiles - progress.filesProcessed;
                            const remainingSec = remainingFiles / filesPerSec;
                            if (remainingSec < 60) {
                              eta = `~${Math.round(remainingSec)}s left`;
                            } else if (remainingSec < 3600) {
                              eta = `~${Math.round(remainingSec / 60)}m left`;
                            } else {
                              eta = `~${Math.round(remainingSec / 3600)}h left`;
                            }
                          }
                        }
                        
                        const phaseText = progress.phase === 'scanning' ? 'Scanning...' 
                          : progress.phase === 'downloading' ? 'Downloading' 
                          : progress.phase === 'archiving' ? 'Creating archive' 
                          : progress.phase === 'uploading' ? 'Uploading to Discord' 
                          : progress.phase === 'complete' ? 'Complete'
                          : progress.phase;
                        
                        return (
                          <Box sx={{ mt: 0.5, fontSize: '0.75rem', color: 'text.secondary' }}>
                            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                              <span>{phaseText}</span>
                              {percentage > 0 && <Box component="span" sx={{ fontWeight: 600, color: 'primary.main' }}>{percentage}%</Box>}
                              {eta && <Box component="span" sx={{ color: 'text.disabled' }}>{eta}</Box>}
                            </Box>
                            {progress.totalFiles > 0 ? (
                              <Box>{progress.filesProcessed?.toLocaleString()} / {progress.totalFiles?.toLocaleString()} files • {formatBytes(progress.totalBytes || 0)}</Box>
                            ) : (
                              <Box>{progress.filesProcessed?.toLocaleString()} files • {formatBytes(progress.totalBytes || 0)}</Box>
                            )}
                            {progress.currentDir && <Box sx={{ maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={progress.currentDir}>{progress.currentDir}</Box>}
                            {progress.reconnects > 0 && <Box sx={{ color: 'warning.main' }}>{progress.reconnects} reconnects</Box>}
                          </Box>
                        );
                      })()}
                    </Box>
                  ) : (
                    <Box 
                      sx={{ 
                        display: 'inline-flex',
                        alignItems: 'center',
                        px: 1.5,
                        py: 0.5,
                        borderRadius: 1,
                        bgcolor: t.enabled ? 'success.light' : 'error.light',
                        color: t.enabled ? 'success.dark' : 'error.dark'
                      }}
                    >
                      <Box 
                        sx={{ 
                          width: 8, 
                          height: 8, 
                          borderRadius: '50%', 
                          bgcolor: t.enabled ? 'success.main' : 'error.main',
                          mr: 1
                        }} 
                      />
                      {t.enabled ? 'Active' : 'Disabled'}
                    </Box>
                  )}
                </TableCell>
                <TableCell>{(t as any).destinationPath || '/'}</TableCell>
                <TableCell>
                  {t.lastStarted ? new Date(t.lastStarted).toLocaleString() : (t.lastRun ? new Date(t.lastRun).toLocaleString() : '-')}
                </TableCell>
                <TableCell>{formatRuntime(t.lastRuntime)}</TableCell>
                <TableCell>
                  <Box 
                    sx={{ 
                      display: 'inline-block',
                      px: 1,
                      py: 0.25,
                      borderRadius: 0.5,
                      bgcolor: t.compress === 'NONE' ? 'action.hover' : 'primary.light',
                      color: t.compress === 'NONE' ? 'text.secondary' : 'primary.dark',
                      fontSize: '0.75rem',
                      fontWeight: 500
                    }}
                  >
                    {t.compress}
                  </Box>
                </TableCell>
                <TableCell>{t.maxFiles || '∞'}</TableCell>
                <TableCell align="right">
                  {isRunning ? (
                    <IconButton 
                      onClick={async () => { 
                        if (!window.confirm(`Stop running task "${t.name}"?`)) return;
                        try { 
                          await api.post(`/tasks/${t.id}/stop`);
                          toast.success('Task stopped');
                          queryClient.invalidateQueries({ queryKey: ['tasks'] });
                        } catch (e:any) { 
                          toast.error(e?.response?.data?.error || 'Failed to stop task'); 
                        } 
                      }} 
                      title="Stop task"
                      color="error"
                      size="small"
                      sx={{ mr: 0.5 }}
                    >
                      <Box component="span" sx={{ fontSize: '1.2rem' }}>⏹</Box>
                    </IconButton>
                  ) : (
                    <IconButton 
                      onClick={async () => { try { await runNowMutation.mutateAsync(t.id); } catch (e:any) { toast.error(e?.response?.data?.error || 'Failed to run task'); } }} 
                      title="Run now"
                      color="primary"
                      size="small"
                      sx={{ mr: 0.5 }}
                    >
                      <Play size={18} />
                    </IconButton>
                  )}
                  <IconButton onClick={() => openForEdit(t)} title="Edit" size="small" sx={{ mr: 0.5 }}>
                    <Edit size={18} />
                  </IconButton>
                  <IconButton 
                    onClick={async () => { 
                      if (!window.confirm(`Delete task "${t.name}"?`)) return;
                      try { await deleteMutation.mutateAsync(t.id); } catch (e:any) { toast.error(e?.response?.data?.error || 'Failed to delete task'); } 
                    }} 
                    title="Delete"
                    color="error"
                    size="small"
                  >
                    <Trash size={18} />
                  </IconButton>
                </TableCell>
              </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{form.id ? 'Edit Task' : 'New Task'}</DialogTitle>
        <DialogContent>
          <TextField label="Name" fullWidth margin="normal" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={!!errors.name} helperText={errors.name || ''} />
          <TextField label="Cron (cron expression)" fullWidth margin="normal" value={form.cron} onChange={(e) => setForm({ ...form, cron: e.target.value })} helperText={errors.cron || describeCron(form.cron)} error={!!errors.cron} />
          <FormControlLabel control={<Checkbox checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />} label="Enabled" />

            <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="SFTP Host" value={form.sftpHost} onChange={(e) => setForm({ ...form, sftpHost: e.target.value })} fullWidth error={!!errors.sftpHost} helperText={errors.sftpHost || ''} />
            <TextField label="Port" type="number" value={form.sftpPort} onChange={(e) => setForm({ ...form, sftpPort: Number(e.target.value) })} sx={{ width: 120 }} />
          </Box>

          <Box sx={{ display: 'flex', gap: 2 }}>
            <TextField label="SFTP User" value={form.sftpUser} onChange={(e) => setForm({ ...form, sftpUser: e.target.value })} fullWidth error={!!errors.sftpUser} helperText={errors.sftpUser || ''} />
            <TextField label="Remote Path" value={form.sftpPath} onChange={(e) => setForm({ ...form, sftpPath: e.target.value })} fullWidth error={!!errors.sftpPath} helperText={errors.sftpPath || ''} />
          </Box>

          {/* SFTP private key input moved into authentication section below */}

          <Box sx={{ mt: 2 }}>
            <Typography variant="body2" sx={{ mb: 1 }}>Destination Folder</Typography>
            <Button variant="outlined" onClick={() => setDestDialogOpen(true)} sx={{ mb: 1 }}>
              {form.destinationId ? (allFolders?.find((f:any)=>f.id===form.destinationId)?.path || (form.id && (tasks as any[])?.find((t:any)=>t.id===form.id)?.destinationPath) || 'Selected folder') : '/'}
            </Button>
          </Box>

          {/* Destination folder selector dialog (reuses Move dialog style) */}
          <FolderSelectDialog open={destDialogOpen} onClose={() => setDestDialogOpen(false)} onSelect={(id) => setForm({ ...form, destinationId: id })} title="Select destination folder" />

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
              <TextField label="SFTP Password" type="password" fullWidth margin="normal" value={form.sftpPassword} onChange={(e) => setForm({ ...form, sftpPassword: e.target.value })} error={!!errors.auth} />
            )}
            {form.authPrivateKey && (
              <TextField label="SFTP Private Key" multiline minRows={4} fullWidth margin="normal" value={form.sftpPrivateKey} onChange={(e) => setForm({ ...form, sftpPrivateKey: e.target.value })} error={!!errors.auth} />
            )}
            {errors.auth && <Typography color="error" variant="body2">{errors.auth}</Typography>}
          </Box>

          <TextField label="Max files (0 = unlimited)" type="number" fullWidth margin="normal" value={form.maxFiles} onChange={(e) => setForm({ ...form, maxFiles: Number(e.target.value) })} error={!!errors.maxFiles} helperText={errors.maxFiles || ''} />

          {/* Encrypt override removed: tasks will follow user's default encryption setting */}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setOpen(false)}>Cancel</Button>
          <Button color="secondary" onClick={() => save(true)}>Save & Run</Button>
          <Button variant="contained" onClick={() => save(false)}>Save</Button>
        </DialogActions>
      </Dialog>

      {/* Context Menu for Tasks */}
      <Menu
        anchorEl={taskMenuAnchor}
        anchorReference={taskMenuPosition ? 'anchorPosition' : 'anchorEl'}
        anchorPosition={taskMenuPosition ? { top: taskMenuPosition.top, left: taskMenuPosition.left } : undefined}
        open={Boolean(taskMenuAnchor) || Boolean(taskMenuPosition)}
        onClose={handleCloseTaskMenu}
        sx={{
          '& .MuiPaper-root': {
            borderRadius: 2,
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            minWidth: 180,
          },
        }}
      >
        {selectedTask ? (
          <>
            <MenuItem onClick={() => handleTaskMenuAction('run')}>
              <ListItemIcon>
                <Play size={18} />
              </ListItemIcon>
              <ListItemText>Run now</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => handleTaskMenuAction('edit')}>
              <ListItemIcon>
                <Edit size={18} />
              </ListItemIcon>
              <ListItemText>Edit</ListItemText>
            </MenuItem>
            <MenuItem onClick={() => handleTaskMenuAction('delete')} sx={{ color: 'error.main' }}>
              <ListItemIcon sx={{ color: 'inherit' }}>
                <Trash size={18} />
              </ListItemIcon>
              <ListItemText>Delete</ListItemText>
            </MenuItem>
          </>
        ) : (
          <MenuItem onClick={() => handleTaskMenuAction('new')}>
            <ListItemIcon>
              <Plus size={18} />
            </ListItemIcon>
            <ListItemText>New task</ListItemText>
          </MenuItem>
        )}
      </Menu>
    </Box>
  );
}
