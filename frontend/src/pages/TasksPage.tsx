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
  Switch,
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
  Paper,
  Tabs,
  Tab,
} from '@mui/material';
import { Plus, Play, Trash, Edit, GripVertical, Square } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import toast from 'react-hot-toast';
import FolderSelectDialog from '../components/FolderSelectDialog';
import cronParser from 'cron-parser';
import cronValidate from 'cron-validate';
import { useCurrentUser } from '../hooks/useCurrentUser';
import { formatDateWithTimezone, getUserTimezone } from '../utils/timezone';

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
  skipPrescan: false,
  cacheScanSize: false,
  excludePaths: '',
  useSwap: false,
  // encrypt override removed; tasks use user's default encrypt setting
};

export default function TasksPage() {
  const { data: currentUser } = useCurrentUser();
  const userTimezone = getUserTimezone(currentUser);

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
      if (parts.length !== 5) return `Next run: ${formatDateWithTimezone(next, userTimezone)}`;
      
      const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;
      
      // Build human-readable description
      const descriptions: string[] = [];
      
      // Every X minutes
      const minStep = minute.match(/^\*\/(\d+)$/);
      if (minStep) {
        descriptions.push(`Every ${minStep[1]} minute${minStep[1] === '1' ? '' : 's'}`);
      }
      // Every X hours
      const hourStep = hour.match(/^\*\/(\d+)$/);
      if (hourStep) {
        descriptions.push(`every ${hourStep[1]} hour${hourStep[1] === '1' ? '' : 's'}`);
      }
      
      // Specific minute(s)
      if (!minStep && minute !== '*') {
        const mins = minute.split(',');
        if (mins.length === 1 && /^\d+$/.test(mins[0])) {
          // Single minute - handled with hour below
        } else if (minute.includes('-')) {
          const [start, end] = minute.split('-');
          descriptions.push(`Minutes ${start}-${end}`);
        } else if (mins.length > 1) {
          descriptions.push(`At minutes ${mins.join(', ')}`);
        }
      }
      
      // Specific hour(s)
      if (!hourStep && hour !== '*') {
        const hrs = hour.split(',');
        const minVal = /^\d+$/.test(minute) ? minute.padStart(2, '0') : '00';
        if (hrs.length === 1 && /^\d+$/.test(hrs[0])) {
          const h = parseInt(hrs[0]);
          const ampm = h >= 12 ? 'PM' : 'AM';
          const h12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
          descriptions.push(`At ${h12}:${minVal} ${ampm}`);
        } else if (hour.includes('-')) {
          const [start, end] = hour.split('-');
          descriptions.push(`Hours ${start}-${end}`);
        } else if (hrs.length > 1) {
          descriptions.push(`At hours ${hrs.join(', ')}`);
        }
      }
      
      // Day of month
      if (dayOfMonth !== '*') {
        const dayStep = dayOfMonth.match(/^\*\/(\d+)$/);
        if (dayStep) {
          descriptions.push(`every ${dayStep[1]} day${dayStep[1] === '1' ? '' : 's'}`);
        } else if (dayOfMonth.includes('-')) {
          const [start, end] = dayOfMonth.split('-');
          descriptions.push(`on days ${start}-${end}`);
        } else if (dayOfMonth.includes(',')) {
          descriptions.push(`on days ${dayOfMonth}`);
        } else {
          const d = parseInt(dayOfMonth);
          const suffix = d === 1 || d === 21 || d === 31 ? 'st' : d === 2 || d === 22 ? 'nd' : d === 3 || d === 23 ? 'rd' : 'th';
          descriptions.push(`on the ${d}${suffix}`);
        }
      }
      
      // Month
      const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
      if (month !== '*') {
        const monthStep = month.match(/^\*\/(\d+)$/);
        if (monthStep) {
          descriptions.push(`every ${monthStep[1]} month${monthStep[1] === '1' ? '' : 's'}`);
        } else if (month.includes(',')) {
          const mons = month.split(',').map(m => monthNames[parseInt(m) - 1] || m);
          descriptions.push(`in ${mons.join(', ')}`);
        } else if (month.includes('-')) {
          const [start, end] = month.split('-');
          descriptions.push(`${monthNames[parseInt(start) - 1] || start} to ${monthNames[parseInt(end) - 1] || end}`);
        } else {
          descriptions.push(`in ${monthNames[parseInt(month) - 1] || month}`);
        }
      }
      
      // Day of week
      const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      if (dayOfWeek !== '*') {
        if (dayOfWeek === '1-5' || dayOfWeek === 'MON-FRI') {
          descriptions.push('on weekdays');
        } else if (dayOfWeek === '0,6' || dayOfWeek === '6,0' || dayOfWeek === 'SAT,SUN') {
          descriptions.push('on weekends');
        } else if (dayOfWeek.includes(',')) {
          const days = dayOfWeek.split(',').map(d => dayNames[parseInt(d)] || d);
          descriptions.push(`on ${days.join(', ')}`);
        } else if (dayOfWeek.includes('-')) {
          const [start, end] = dayOfWeek.split('-');
          descriptions.push(`${dayNames[parseInt(start)] || start} to ${dayNames[parseInt(end)] || end}`);
        } else {
          descriptions.push(`on ${dayNames[parseInt(dayOfWeek)] || dayOfWeek}`);
        }
      }
      
      // Combine descriptions
      let desc = descriptions.length > 0 ? descriptions.join(' ') : 'Custom schedule';
      
      // Add next run time
      return `${desc} — next: ${formatDateWithTimezone(next, userTimezone)}`;
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

  // Fetch queue status (queued and running tasks)
  const { data: queueStatus } = useQuery<{ queuedTasks: { taskId: string; queuedAt: string; priority: number }[]; runningTasks: string[] }>({
    queryKey: ['queueStatus'],
    queryFn: async () => {
      const resp = await api.get('/tasks/queue/status');
      return resp.data;
    },
    staleTime: 1000,
    refetchInterval: 2000, // Update queue status every 2 seconds
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

  // Helper to check if a task is queued
  const isTaskQueued = (taskId: string) => {
    return queueStatus?.queuedTasks?.some(t => t.taskId === taskId) || false;
  };

  // Helper to get queue position
  const getQueuePosition = (taskId: string) => {
    const index = queueStatus?.queuedTasks?.findIndex(t => t.taskId === taskId);
    return index !== undefined && index >= 0 ? index + 1 : null;
  };

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

  // Helper to truncate file paths
  const truncatePath = (path: string) => {
    if (path.length <= 20) return path;
    return path.substring(0, 17) + '...';
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
      queryClient.invalidateQueries({ queryKey: ['queueStatus'] });
      toast.success('Task queued');
    },
  });

  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(defaultForm);
  const [errors, setErrors] = useState<Record<string, string | null>>({});
  const [destDialogOpen, setDestDialogOpen] = useState(false);
  const [taskMenuAnchor, setTaskMenuAnchor] = useState<null | HTMLElement>(null);
  const [taskMenuPosition, setTaskMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [selectedTask, setSelectedTask] = useState<any | null>(null);
  
  // Confirm dialog state
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmTitle, setConfirmTitle] = useState('');
  const [confirmMessage, setConfirmMessage] = useState('');
  const [confirmAction, setConfirmAction] = useState<(() => void) | null>(null);
  
  // Dialog tab state
  const [dialogTab, setDialogTab] = useState(0);

  useEffect(() => { if (!open) { setForm(defaultForm); setDialogTab(0); } }, [open]);

  // Confirm dialog helper
  const showConfirm = (title: string, message: string, onConfirm: () => void) => {
    setConfirmTitle(title);
    setConfirmMessage(message);
    setConfirmAction(() => onConfirm);
    setConfirmOpen(true);
  };

  const handleConfirm = () => {
    if (confirmAction) confirmAction();
    setConfirmOpen(false);
    setConfirmAction(null);
  };

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
      skipPrescan: !!t.skipPrescan,
      cacheScanSize: !!t.cacheScanSize,
      excludePaths: Array.isArray(t.excludePaths) ? t.excludePaths.join(', ') : '',
      useSwap: !!t.useSwap,
      
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
        showConfirm(
          'Delete Task',
          `Are you sure you want to delete task "${selectedTask.name}"?`,
          async () => {
            try {
              await deleteMutation.mutateAsync(selectedTask.id);
            } catch (e: any) {
              toast.error(e?.response?.data?.error || 'Failed to delete task');
            }
          }
        );
        break;
      case 'new':
        setOpen(true);
        break;
    }
    handleCloseTaskMenu();
  };

  async function save(runNow = false) {
    const excludePathsArray = form.excludePaths
      ? form.excludePaths.split(',').map(p => p.trim()).filter(Boolean)
      : [];
    const payload = { ...form, timestampNames: true, excludePaths: excludePathsArray };
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

  // Drag and drop state for reordering (simple index-based)
  const [draggedIndex, setDraggedIndex] = useState<number | null>(null);
  const [dragOverIndex, setDragOverIndex] = useState<number | null>(null);

  const handleDragStart = (e: React.DragEvent, index: number) => {
    setDraggedIndex(index);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverIndex(index);
  };

  const handleDragEnd = () => {
    setDraggedIndex(null);
    setDragOverIndex(null);
  };

  const handleDrop = async (e: React.DragEvent, dropIndex: number) => {
    e.preventDefault();
    if (draggedIndex === null || draggedIndex === dropIndex || !tasks) {
      handleDragEnd();
      return;
    }
    
    // Reorder
    const newTasks = [...tasks];
    const [draggedTask] = newTasks.splice(draggedIndex, 1);
    newTasks.splice(dropIndex, 0, draggedTask);
    
    const taskIds = newTasks.map(t => t.id);
    
    try {
      await api.post('/tasks/reorder', { taskIds });
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      toast.success('Task order updated');
    } catch (err) {
      toast.error('Failed to reorder tasks');
    }
    
    handleDragEnd();
  };

  // Cancel a queued task
  const cancelQueuedTask = async (taskId: string) => {
    try {
      await api.post(`/tasks/${taskId}/dequeue`);
      toast.success('Task removed from queue');
      queryClient.invalidateQueries({ queryKey: ['queueStatus'] });
    } catch (err: any) {
      toast.error(err?.response?.data?.error || 'Failed to cancel queued task');
    }
  };

  return (
    <Box>
      <Paper sx={{ p: 3, minHeight: 'calc(100vh - 140px)' }}>
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

      <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
        Drag tasks to reorder priority. Top task runs first when multiple tasks are scheduled simultaneously.
      </Typography>

      {isLoading ? <CircularProgress /> : (
        <Box sx={{ 
          width: '100%', 
          overflowX: 'auto',
          bgcolor: 'background.paper',
          borderRadius: 1,
          border: '1px solid',
          borderColor: 'divider',
        }}>
        <Table sx={{ '& .MuiTableCell-root': { py: 1.5 }, minWidth: 900 }}>
              <TableHead>
                <TableRow sx={{ bgcolor: 'action.hover' }}>
                  <TableCell sx={{ fontWeight: 600, width: 40 }}></TableCell>
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
            {tasks && tasks.map((t: any, index: number) => {
              // Task is running if lastStarted is more recent than lastRun
              const isRunning = t.lastStarted && (!t.lastRun || new Date(t.lastStarted) > new Date(t.lastRun));
              const isQueued = isTaskQueued(t.id);
              const queuePosition = getQueuePosition(t.id);
              
              return (
              <TableRow 
                key={t.id} 
                hover 
                onContextMenu={(e) => handleTaskContextMenu(e, t)}
                onDragOver={(e) => handleDragOver(e, index)}
                onDrop={(e) => handleDrop(e, index)}
                sx={{
                  opacity: draggedIndex === index ? 0.5 : 1,
                  bgcolor: dragOverIndex === index && draggedIndex !== index ? 'action.selected' : 'inherit',
                }}
              >
                <TableCell 
                  draggable
                  onDragStart={(e) => handleDragStart(e, index)}
                  onDragEnd={handleDragEnd}
                  sx={{ 
                    cursor: 'grab',
                    width: 40,
                    userSelect: 'none',
                    '&:active': { cursor: 'grabbing' },
                  }}
                >
                  <GripVertical size={18} style={{ opacity: 0.5 }} />
                </TableCell>
                <TableCell>
                  <Typography fontWeight={500}>{t.name}</Typography>
                </TableCell>
                <TableCell>
                  {isQueued ? (
                    <Box>
                      <Box 
                        sx={{ 
                          display: 'inline-flex',
                          alignItems: 'center',
                          px: 1.5,
                          py: 0.5,
                          borderRadius: 1,
                          bgcolor: 'warning.light',
                          color: 'warning.dark',
                        }}
                      >
                        <Box 
                          sx={{ 
                            width: 8, 
                            height: 8, 
                            borderRadius: '50%', 
                            bgcolor: 'warning.main',
                            mr: 1,
                            animation: 'pulse 2s ease-in-out infinite',
                            '@keyframes pulse': {
                              '0%, 100%': { opacity: 1 },
                              '50%': { opacity: 0.3 },
                            }
                          }} 
                        />
                        Queued{queuePosition && queuePosition > 1 ? ` (#${queuePosition})` : ''}
                      </Box>
                    </Box>
                  ) : isRunning ? (
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
                        
                        // Build phase text with chunk info for uploading
                        let phaseText = progress.phase === 'connecting' ? (
                          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}>
                            Connecting
                            <Box component="span" sx={{ 
                              '@keyframes dotPulse': {
                                '0%, 20%': { content: '""' },
                                '40%': { content: '"."' },
                                '60%': { content: '".."' },
                                '80%, 100%': { content: '"..."' },
                              },
                              '&::after': {
                                content: '""',
                                animation: 'dotPulse 1.5s infinite',
                                display: 'inline-block',
                                width: '1.5em',
                              }
                            }} />
                          </Box>
                        ) : progress.phase === 'scanning' ? (
                          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}>
                            Scanning
                            <Box component="span" sx={{ 
                              '@keyframes dotPulse': {
                                '0%, 20%': { content: '""' },
                                '40%': { content: '"."' },
                                '60%': { content: '".."' },
                                '80%, 100%': { content: '"..."' },
                              },
                              '&::after': {
                                content: '""',
                                animation: 'dotPulse 1.5s infinite',
                                display: 'inline-block',
                                width: '1.5em',
                              }
                            }} />
                          </Box>
                        ) 
                          : progress.phase === 'downloading' ? (
                          <Box component="span" sx={{ display: 'inline-flex', alignItems: 'center' }}>
                            Downloading
                            <Box component="span" sx={{ 
                              '@keyframes dotPulse': {
                                '0%, 20%': { content: '""' },
                                '40%': { content: '"."' },
                                '60%': { content: '".."' },
                                '80%, 100%': { content: '"..."' },
                              },
                              '&::after': {
                                content: '""',
                                animation: 'dotPulse 1.5s infinite',
                                display: 'inline-block',
                                width: '1.5em',
                              }
                            }} />
                          </Box>
                        ) 
                          : progress.phase === 'archiving' ? 'Creating archive' 
                          : progress.phase === 'uploading' ? 'Uploading to Discord' 
                          : progress.phase === 'complete' ? 'Complete'
                          : progress.phase;
                        
                        // Add chunk progress for uploading phase
                        if (progress.phase === 'uploading' && progress.uploadTotalChunks > 0) {
                          phaseText = `Uploading chunk ${progress.uploadChunk || 0}/${progress.uploadTotalChunks}`;
                        }
                        
                        return (
                          <Box sx={{ mt: 0.5, fontSize: '0.75rem', color: 'text.secondary' }}>
                            <Box>{phaseText}</Box>
                            {progress.totalFiles > 0 ? (
                              <Box>{progress.filesProcessed?.toLocaleString()} / {progress.totalFiles?.toLocaleString()} files • {formatBytes(progress.totalBytes || 0)}</Box>
                            ) : progress.filesProcessed > 0 ? (
                              <Box>{progress.filesProcessed?.toLocaleString()} files • {formatBytes(progress.totalBytes || 0)}</Box>
                            ) : null}
                            {progress.currentDir && <Box sx={{ maxWidth: '400px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={progress.currentDir}>{truncatePath(progress.currentDir)}</Box>}
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
                  {t.lastStarted 
                    ? formatDateWithTimezone(t.lastStarted, userTimezone) 
                    : (t.lastRun ? formatDateWithTimezone(t.lastRun, userTimezone) : '-')}
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
                  {isQueued ? (
                    <IconButton 
                      onClick={() => cancelQueuedTask(t.id)} 
                      title="Cancel queued task"
                      color="warning"
                      size="small"
                      sx={{ mr: 0.5 }}
                    >
                      <Square size={18} fill="currentColor" />
                    </IconButton>
                  ) : isRunning ? (
                    <IconButton 
                      onClick={() => {
                        showConfirm(
                          'Stop Task',
                          `Are you sure you want to stop running task "${t.name}"?`,
                          async () => {
                            try { 
                              await api.post(`/tasks/${t.id}/stop`);
                              toast.success('Task stopped');
                              queryClient.invalidateQueries({ queryKey: ['tasks'] });
                            } catch (e:any) { 
                              toast.error(e?.response?.data?.error || 'Failed to stop task'); 
                            }
                          }
                        );
                      }} 
                      title="Stop task"
                      color="error"
                      size="small"
                      sx={{ mr: 0.5 }}
                    >
                      <Square size={18} fill="currentColor" />
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
                    onClick={() => {
                      showConfirm(
                        'Delete Task',
                        `Are you sure you want to delete task "${t.name}"?`,
                        async () => {
                          try { await deleteMutation.mutateAsync(t.id); } catch (e:any) { toast.error(e?.response?.data?.error || 'Failed to delete task'); }
                        }
                      );
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
        </Box>
      )}

      <Dialog open={open} onClose={() => setOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle sx={{ pb: 0 }}>{form.id ? `Edit Task: ${form.name}` : 'New Task'}</DialogTitle>
        <Box sx={{ borderBottom: 1, borderColor: 'divider', px: 3 }}>
          <Tabs value={dialogTab} onChange={(_, v) => setDialogTab(v)} variant="scrollable" scrollButtons="auto">
            <Tab label="General" />
            <Tab label="Connection" />
            <Tab label="Authentication" />
            <Tab label="Advanced" />
          </Tabs>
        </Box>
        <DialogContent sx={{ minHeight: 320 }}>
          {/* General Tab */}
          {dialogTab === 0 && (
            <Box>
              <TextField label="Name" fullWidth margin="normal" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} error={!!errors.name} helperText={errors.name || ''} />
              <TextField label="Cron (cron expression)" fullWidth margin="normal" value={form.cron} onChange={(e) => setForm({ ...form, cron: e.target.value })} helperText={errors.cron || describeCron(form.cron)} error={!!errors.cron} />
              <FormControlLabel control={<Switch checked={form.enabled} onChange={(e) => setForm({ ...form, enabled: e.target.checked })} />} label="Enabled" />
              
              <Box sx={{ mt: 2 }}>
                <Typography variant="body2" sx={{ mb: 1 }}>Destination Folder</Typography>
                <Button variant="outlined" onClick={() => setDestDialogOpen(true)} sx={{ mb: 1 }}>
                  {form.destinationId ? (allFolders?.find((f:any)=>f.id===form.destinationId)?.path || (form.id && (tasks as any[])?.find((t:any)=>t.id===form.id)?.destinationPath) || 'Selected folder') : '/'}
                </Button>
              </Box>
              
              <FormControl fullWidth margin="normal">
                <InputLabel id="compress-label">Compress</InputLabel>
                <Select labelId="compress-label" value={form.compress} label="Compress" onChange={(e) => setForm({ ...form, compress: e.target.value as string })}>
                  <MenuItem value={'NONE'}>None</MenuItem>
                  <MenuItem value={'ZIP'}>ZIP</MenuItem>
                  <MenuItem value={'TAR_GZ'}>TAR.GZ</MenuItem>
                </Select>
              </FormControl>
              
              <TextField label="Max files (0 = unlimited)" type="number" fullWidth margin="normal" value={form.maxFiles} onChange={(e) => setForm({ ...form, maxFiles: Number(e.target.value) })} error={!!errors.maxFiles} helperText={errors.maxFiles || ''} />
            </Box>
          )}

          {/* Connection Tab */}
          {dialogTab === 1 && (
            <Box>
              <Box sx={{ display: 'flex', gap: 2, mt: 1 }}>
                <TextField label="SFTP Host" value={form.sftpHost} onChange={(e) => setForm({ ...form, sftpHost: e.target.value })} fullWidth error={!!errors.sftpHost} helperText={errors.sftpHost || ''} />
                <TextField label="Port" type="number" value={form.sftpPort} onChange={(e) => setForm({ ...form, sftpPort: Number(e.target.value) })} sx={{ width: 120 }} />
              </Box>
              
              <Box sx={{ display: 'flex', gap: 2, mt: 2 }}>
                <TextField label="SFTP User" value={form.sftpUser} onChange={(e) => setForm({ ...form, sftpUser: e.target.value })} fullWidth error={!!errors.sftpUser} helperText={errors.sftpUser || ''} />
                <TextField label="Remote Path" value={form.sftpPath} onChange={(e) => setForm({ ...form, sftpPath: e.target.value })} fullWidth error={!!errors.sftpPath} helperText={errors.sftpPath || ''} />
              </Box>
            </Box>
          )}

          {/* Authentication Tab */}
          {dialogTab === 2 && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Select which authentication methods to use when connecting to the SFTP server.
              </Typography>
              <FormControlLabel control={<Switch checked={form.authPassword} onChange={(e) => setForm({ ...form, authPassword: e.target.checked })} />} label="Use password authentication" />
              {form.authPassword && (
                <TextField label="SFTP Password" type="password" fullWidth margin="normal" value={form.sftpPassword} onChange={(e) => setForm({ ...form, sftpPassword: e.target.value })} error={!!errors.auth} />
              )}
              
              <FormControlLabel control={<Switch checked={form.authPrivateKey} onChange={(e) => setForm({ ...form, authPrivateKey: e.target.checked })} />} label="Use private key authentication" sx={{ mt: form.authPassword ? 2 : 0 }} />
              {form.authPrivateKey && (
                <TextField label="SFTP Private Key" multiline minRows={4} fullWidth margin="normal" value={form.sftpPrivateKey} onChange={(e) => setForm({ ...form, sftpPrivateKey: e.target.value })} error={!!errors.auth} placeholder="Paste your private key here..." />
              )}
              {errors.auth && <Typography color="error" variant="body2" sx={{ mt: 1 }}>{errors.auth}</Typography>}
            </Box>
          )}

          {/* Advanced Tab */}
          {dialogTab === 3 && (
            <Box sx={{ mt: 1 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
                Fine-tune backup behavior and performance settings.
              </Typography>
              
              <FormControlLabel 
                control={<Switch checked={form.skipPrescan} onChange={(e) => setForm({ ...form, skipPrescan: e.target.checked })} />} 
                label="Skip file scan (faster start, no progress percentage)" 
              />
              
              <FormControlLabel 
                control={<Switch checked={form.cacheScanSize} onChange={(e) => setForm({ ...form, cacheScanSize: e.target.checked })} disabled={!form.skipPrescan} />} 
                label="Cache scan size (saves last known size when scan is disabled)" 
                sx={{ display: 'block', mt: 1 }}
              />
              
              <TextField 
                label="Exclude paths (comma-separated)" 
                fullWidth 
                margin="normal" 
                value={form.excludePaths} 
                onChange={(e) => setForm({ ...form, excludePaths: e.target.value })}
                helperText="Paths to skip, e.g.: bluemap, dynmap, logs"
                placeholder="bluemap, dynmap, logs"
              />
              
              <FormControlLabel 
                control={<Switch checked={form.useSwap} onChange={(e) => setForm({ ...form, useSwap: e.target.checked })} />} 
                label="Use swap memory (larger batches, slower disk I/O)" 
                sx={{ display: 'block', mt: 1 }}
              />
            </Box>
          )}

          {/* Destination folder selector dialog (reuses Move dialog style) */}
          <FolderSelectDialog open={destDialogOpen} onClose={() => setDestDialogOpen(false)} onSelect={(id) => setForm({ ...form, destinationId: id })} title="Select destination folder" />
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

      {/* Confirmation Dialog */}
      <Dialog open={confirmOpen} onClose={() => setConfirmOpen(false)}>
        <DialogTitle>{confirmTitle}</DialogTitle>
        <DialogContent>
          <Typography>{confirmMessage}</Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirmOpen(false)}>Cancel</Button>
          <Button onClick={handleConfirm} color="error" variant="contained">
            Confirm
          </Button>
        </DialogActions>
      </Dialog>
      </Paper>
    </Box>
  );
}
