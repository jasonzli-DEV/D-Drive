import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Button,
  IconButton,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Paper,
  Typography,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  CircularProgress,
  Chip,
  useTheme,
  InputAdornment,
  Tooltip,
} from '@mui/material';
import {
  Link as LinkIcon,
  Trash2,
  Copy,
  Edit,
  Calendar,
  Folder,
  File,
  FileText,
  Play,
  Image as ImageIcon,
  ExternalLink,
} from 'lucide-react';
import { formatDistance } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../lib/api';

interface PublicLink {
  id: string;
  slug: string;
  fileId: string;
  userId: string;
  expiresAt: string | null;
  createdAt: string;
  updatedAt: string;
  file: {
    id: string;
    name: string;
    type: 'FILE' | 'DIRECTORY';
    size: string;
    mimeType?: string;
    path: string;
    createdAt: string;
    updatedAt: string;
  };
}

function formatBytes(bytes: string | number): string {
  const b = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  if (b === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(k));
  return `${(b / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export default function LinksPage() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  
  const [editDialog, setEditDialog] = useState<PublicLink | null>(null);
  const [deleteDialog, setDeleteDialog] = useState<PublicLink | null>(null);
  const [newSlug, setNewSlug] = useState('');
  const [newExpiresAt, setNewExpiresAt] = useState('');

  const { data: links, isLoading } = useQuery({
    queryKey: ['public-links'],
    queryFn: async () => {
      const response = await api.get('/public-links');
      return response.data as PublicLink[];
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, slug, expiresAt }: { id: string; slug?: string; expiresAt?: string | null }) => {
      const data: any = {};
      if (slug !== undefined) data.slug = slug;
      if (expiresAt !== undefined) data.expiresAt = expiresAt;
      
      const response = await api.patch(`/public-links/${id}`, data);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-links'] });
      toast.success('Link updated successfully');
      setEditDialog(null);
      setNewSlug('');
      setNewExpiresAt('');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update link');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const response = await api.delete(`/public-links/${id}`);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['public-links'] });
      toast.success('Link deactivated successfully');
      setDeleteDialog(null);
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to deactivate link');
    },
  });

  const handleCopyLink = async (slug: string) => {
    const fullUrl = `${window.location.origin}/link/${slug}`;
    try {
      await navigator.clipboard.writeText(fullUrl);
      toast.success('Link copied to clipboard');
    } catch (err) {
      const textArea = document.createElement('textarea');
      textArea.value = fullUrl;
      textArea.style.position = 'fixed';
      textArea.style.left = '-999999px';
      document.body.appendChild(textArea);
      textArea.select();
      try {
        document.execCommand('copy');
        toast.success('Link copied to clipboard');
      } catch (e) {
        toast.error('Failed to copy link');
      }
      document.body.removeChild(textArea);
    }
  };

  const handleOpenLink = (slug: string) => {
    window.open(`/link/${slug}`, '_blank');
  };

  const handleEditOpen = (link: PublicLink) => {
    setEditDialog(link);
    setNewSlug(link.slug);
    setNewExpiresAt(link.expiresAt ? new Date(link.expiresAt).toISOString().slice(0, 16) : '');
  };

  const handleEditSave = () => {
    if (!editDialog) return;

    const updates: any = {};
    
    if (newSlug !== editDialog.slug) {
      if (!newSlug.trim()) {
        toast.error('Slug cannot be empty');
        return;
      }
      if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(newSlug) || newSlug.length < 3 || newSlug.length > 50) {
        toast.error('Slug must be 3-50 characters with lowercase letters, numbers, and hyphens only');
        return;
      }
      updates.slug = newSlug;
    }

    if (newExpiresAt !== (editDialog.expiresAt ? new Date(editDialog.expiresAt).toISOString().slice(0, 16) : '')) {
      if (newExpiresAt === '') {
        updates.expiresAt = null;
      } else {
        const expiration = new Date(newExpiresAt);
        if (expiration < new Date()) {
          toast.error('Expiration date must be in the future');
          return;
        }
        updates.expiresAt = expiration.toISOString();
      }
    }

    if (Object.keys(updates).length === 0) {
      setEditDialog(null);
      return;
    }

    updateMutation.mutate({ id: editDialog.id, ...updates });
  };

  const getBaseUrl = () => {
    const url = new URL(window.location.href);
    return `${url.protocol}//${url.host}`;
  };

  const isImageFile = (file: PublicLink['file']) => {
    if (file.mimeType?.startsWith('image/')) return true;
    const ext = file.name.split('.').pop()?.toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext || '');
  };

  const isVideoFile = (file: PublicLink['file']) => {
    if (file.mimeType?.startsWith('video/')) return true;
    const ext = file.name.split('.').pop()?.toLowerCase();
    return ['mp4', 'webm', 'ogg', 'mov'].includes(ext || '');
  };

  const isPdfFile = (file: PublicLink['file']) => {
    return file.mimeType === 'application/pdf' || file.name.endsWith('.pdf');
  };

  return (
    <Box sx={{ maxWidth: 1800, mx: 'auto', width: '100%' }}>
      <Paper sx={{ p: { xs: 2, sm: 3 }, minHeight: 'calc(100vh - 140px)' }}>
        <Typography variant="h4" gutterBottom>
          Public Links
        </Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 3 }}>
          Manage public share links for your files and folders
        </Typography>

        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : !links || links.length === 0 ? (
          <Box
            sx={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              minHeight: '50vh',
              color: 'text.secondary',
            }}
          >
            <LinkIcon size={48} style={{ opacity: 0.5, marginBottom: 16 }} />
            <Typography variant="h6" gutterBottom>
              No public links yet
            </Typography>
            <Typography variant="body2">
              Create public links from the file browser to share files with anyone
            </Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>File</TableCell>
                  <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Link</TableCell>
                  <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Expires</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {links.map((link) => (
                  <TableRow key={link.id} hover>
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {link.file.type === 'DIRECTORY' ? (
                          <Folder size={20} style={{ color: theme.palette.warning.main }} />
                        ) : isImageFile(link.file) ? (
                          <ImageIcon size={20} style={{ color: theme.palette.info.main }} />
                        ) : isVideoFile(link.file) ? (
                          <Play size={20} style={{ color: theme.palette.error.main }} />
                        ) : isPdfFile(link.file) ? (
                          <FileText size={20} style={{ color: theme.palette.warning.dark }} />
                        ) : (
                          <File size={20} style={{ color: theme.palette.primary.main }} />
                        )}
                        <Box>
                          <Typography variant="body2" sx={{ fontWeight: 500 }}>
                            {link.file.name}
                          </Typography>
                          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mt: 0.5 }}>
                            <Chip
                              label={link.file.type === 'DIRECTORY' ? 'Folder' : 'File'}
                              size="small"
                              color={link.file.type === 'DIRECTORY' ? 'warning' : 'primary'}
                              sx={{ height: 20, fontSize: '0.7rem' }}
                            />
                            {link.file.type === 'FILE' && (
                              <Typography variant="caption" color="text.secondary">
                                {formatBytes(link.file.size)}
                              </Typography>
                            )}
                          </Box>
                        </Box>
                      </Box>
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                      <Box
                        sx={{
                          fontFamily: 'monospace',
                          fontSize: '0.85rem',
                          color: 'primary.main',
                          cursor: 'pointer',
                          '&:hover': { textDecoration: 'underline' },
                        }}
                        onClick={() => handleCopyLink(link.slug)}
                      >
                        {getBaseUrl()}/link/{link.slug}
                      </Box>
                    </TableCell>
                    <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                      {link.expiresAt ? (
                        <Chip
                          label={formatDistance(new Date(link.expiresAt), new Date(), { addSuffix: true })}
                          color={new Date(link.expiresAt) < new Date() ? 'error' : 'default'}
                          size="small"
                          icon={<Calendar size={14} />}
                        />
                      ) : (
                        <Typography variant="body2" color="text.secondary">
                          Never
                        </Typography>
                      )}
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', gap: 0.5, justifyContent: 'flex-end' }}>
                        <Tooltip title="Open link">
                          <IconButton size="small" onClick={() => handleOpenLink(link.slug)}>
                            <ExternalLink size={18} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Copy link">
                          <IconButton size="small" onClick={() => handleCopyLink(link.slug)}>
                            <Copy size={18} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Edit link">
                          <IconButton size="small" onClick={() => handleEditOpen(link)}>
                            <Edit size={18} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Deactivate link">
                          <IconButton size="small" color="error" onClick={() => setDeleteDialog(link)}>
                            <Trash2 size={18} />
                          </IconButton>
                        </Tooltip>
                      </Box>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </TableContainer>
        )}
      </Paper>

      <Dialog open={!!editDialog} onClose={() => setEditDialog(null)} maxWidth="sm" fullWidth>
        <DialogTitle>Edit Public Link</DialogTitle>
        <DialogContent>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>
            File: {editDialog?.file.name}
          </Typography>
          
          <TextField
            fullWidth
            label="Link Slug"
            value={newSlug}
            onChange={(e) => setNewSlug(e.target.value.toLowerCase())}
            helperText="Use 3-50 characters with lowercase letters, numbers, and hyphens only."
            sx={{ mb: 2 }}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <Typography variant="body2" color="text.secondary">
                    {getBaseUrl()}/link/
                  </Typography>
                </InputAdornment>
              ),
            }}
          />

          <TextField
            fullWidth
            type="datetime-local"
            label="Expiration Date (Optional)"
            value={newExpiresAt}
            onChange={(e) => setNewExpiresAt(e.target.value)}
            helperText="Leave empty for no expiration"
            InputLabelProps={{ shrink: true }}
            InputProps={{
              endAdornment: newExpiresAt && (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setNewExpiresAt('')}>
                    <Trash2 size={16} />
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEditDialog(null)}>Cancel</Button>
          <Button
            onClick={handleEditSave}
            variant="contained"
            disabled={updateMutation.isPending}
          >
            {updateMutation.isPending ? 'Saving...' : 'Save'}
          </Button>
        </DialogActions>
      </Dialog>

      <Dialog open={!!deleteDialog} onClose={() => setDeleteDialog(null)}>
        <DialogTitle>Deactivate Public Link</DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to deactivate the public link for "{deleteDialog?.file.name}"?
            <br />
            <br />
            The link will no longer be accessible, but you can create a new one later.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialog(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => deleteDialog && deleteMutation.mutate(deleteDialog.id)}
            disabled={deleteMutation.isPending}
          >
            {deleteMutation.isPending ? 'Deactivating...' : 'Deactivate'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
