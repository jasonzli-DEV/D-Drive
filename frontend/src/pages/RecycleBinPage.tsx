import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
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
  CircularProgress,
  Tooltip,
  useTheme,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import { Trash2, RotateCcw, Folder, File, AlertTriangle, ChevronRight, ChevronDown } from 'lucide-react';
import { formatDistance } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../lib/api';

interface DeletedFile {
  id: string;
  name: string;
  type: 'FILE' | 'DIRECTORY';
  size: string;
  mimeType: string | null;
  deletedAt: string;
  originalPath: string | null;
  createdAt: string;
  itemCount?: number; // Number of items inside (for directories)
  children?: DeletedFile[]; // Nested children deleted with parent
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function getDaysUntilDeletion(deletedAt: string): { days: number; isUrgent: boolean } {
  const deletedDate = new Date(deletedAt);
  const now = new Date();
  const deleteAfterDays = 30;
  const deleteDate = new Date(deletedDate.getTime() + deleteAfterDays * 24 * 60 * 60 * 1000);
  const daysLeft = Math.ceil((deleteDate.getTime() - now.getTime()) / (24 * 60 * 60 * 1000));
  return { days: Math.max(0, daysLeft), isUrgent: daysLeft <= 7 };
}

export default function RecycleBinPage() {
  const queryClient = useQueryClient();
  const theme = useTheme();
  const [emptyDialogOpen, setEmptyDialogOpen] = useState(false);
  const [deleteDialogFile, setDeleteDialogFile] = useState<DeletedFile | null>(null);
  const [contextMenu, setContextMenu] = useState<{ mouseX: number; mouseY: number; item: DeletedFile } | null>(null);
  const [expandedFolders, setExpandedFolders] = useState<Set<string>>(new Set());

  const toggleFolder = (folderId: string) => {
    setExpandedFolders(prev => {
      const next = new Set(prev);
      if (next.has(folderId)) {
        next.delete(folderId);
      } else {
        next.add(folderId);
      }
      return next;
    });
  };

  const handleContextMenu = (e: React.MouseEvent, file: DeletedFile) => {
    e.preventDefault();
    setContextMenu({ mouseX: e.clientX, mouseY: e.clientY, item: file });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  const { data: files, isLoading } = useQuery({
    queryKey: ['recycleBin'],
    queryFn: async () => {
      const response = await api.get('/files/recycle-bin');
      const data = Array.isArray(response.data) ? response.data : response.data.files || [];
      return data as DeletedFile[];
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (fileId: string) => {
      const response = await api.post(`/files/recycle-bin/${fileId}/restore`);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['recycleBin'] });
      queryClient.invalidateQueries({ queryKey: ['files'] });
      
      // Build a descriptive success message
      let message = `Restored ${data.filesRestored} item(s)`;
      if (data.restoredToRoot) {
        message += ' to root (original folder no longer exists)';
      }
      if (data.renamedTo) {
        message += ` as "${data.renamedTo}" (name conflict resolved)`;
      }
      toast.success(message);
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.error || 'Failed to restore file';
      toast.error(msg);
    },
  });

  const deletePermanentlyMutation = useMutation({
    mutationFn: async (fileId: string) => {
      const response = await api.delete(`/files/recycle-bin/${fileId}`);
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['recycleBin'] });
      toast.success(`Permanently deleted ${data.filesDeleted} item(s)`);
      setDeleteDialogFile(null);
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.error || 'Failed to delete file';
      toast.error(msg);
    },
  });

  const emptyRecycleBinMutation = useMutation({
    mutationFn: async () => {
      const response = await api.delete('/files/recycle-bin');
      return response.data;
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['recycleBin'] });
      toast.success(`Permanently deleted ${data.filesDeleted} item(s)`);
      setEmptyDialogOpen(false);
    },
    onError: (error: any) => {
      const msg = error?.response?.data?.error || 'Failed to empty recycle bin';
      toast.error(msg);
    },
  });

  return (
    <Box>
      <Paper sx={{ p: 3, minHeight: 'calc(100vh - 140px)' }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 3 }}>
        <Typography variant="h4">Recycle Bin</Typography>
        <Button
          variant="outlined"
          color="error"
          startIcon={<Trash2 size={18} />}
          onClick={() => setEmptyDialogOpen(true)}
          disabled={!files || files.length === 0}
        >
          Empty Recycle Bin
        </Button>
      </Box>

        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '50vh' }}>
            <CircularProgress />
          </Box>
        ) : !files || files.length === 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', color: 'text.secondary' }}>
            <Trash2 size={48} style={{ opacity: 0.5, marginBottom: 16 }} />
            <Typography variant="h6">Recycle bin is empty</Typography>
            <Typography variant="body2">Deleted files will appear here</Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell>Name</TableCell>
                  <TableCell>Original Location</TableCell>
                  <TableCell>Size</TableCell>
                  <TableCell>Deleted</TableCell>
                  <TableCell align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {files.map((file) => {
                  const renderFileRow = (f: DeletedFile, depth: number = 0): JSX.Element => (
                    <>
                      <TableRow key={f.id} hover onContextMenu={(e) => handleContextMenu(e, f)}>
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1, pl: depth * 3 }}>
                            {f.type === 'DIRECTORY' && f.children && f.children.length > 0 && (
                              <IconButton 
                                size="small" 
                                onClick={() => toggleFolder(f.id)}
                                sx={{ p: 0.5 }}
                              >
                                {expandedFolders.has(f.id) ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
                              </IconButton>
                            )}
                            {f.type === 'DIRECTORY' ? (
                              <Folder size={20} style={{ color: theme.palette.warning.main }} />
                            ) : (
                              <File size={20} style={{ color: theme.palette.primary.main }} />
                            )}
                            <Box>
                              {f.name}
                              {depth === 0 && f.type === 'DIRECTORY' && f.itemCount !== undefined && f.itemCount > 0 && (
                                <Typography variant="caption" color="text.secondary" display="block">
                                  {f.itemCount} item{f.itemCount !== 1 ? 's' : ''} inside
                                </Typography>
                              )}
                            </Box>
                          </Box>
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {depth === 0 ? (
                              f.originalPath 
                                ? f.originalPath.substring(0, f.originalPath.lastIndexOf('/')) || '/' 
                                : '/'
                            ) : (
                              '(inside parent)'
                            )}
                          </Typography>
                        </TableCell>
                        <TableCell>
                          {f.type === 'DIRECTORY' ? '-' : formatBytes(parseInt(f.size))}
                        </TableCell>
                        <TableCell>
                          {depth === 0 ? (() => {
                            const { days, isUrgent } = getDaysUntilDeletion(f.deletedAt);
                            return (
                              <Box>
                                <Tooltip title={new Date(f.deletedAt).toLocaleString()}>
                                  <span>
                                    {formatDistance(new Date(f.deletedAt), new Date(), { addSuffix: true })}
                                  </span>
                                </Tooltip>
                                <Typography 
                                  variant="caption" 
                                  display="block" 
                                  sx={{ 
                                    color: isUrgent ? 'error.main' : 'text.secondary',
                                    fontWeight: isUrgent ? 600 : 400,
                                  }}
                                >
                                  {days === 0 ? 'Deletes today' : `${days} day${days !== 1 ? 's' : ''} until auto-delete`}
                                </Typography>
                              </Box>
                            );
                          })() : (
                            <Typography variant="body2" color="text.secondary">
                              -
                            </Typography>
                          )}
                        </TableCell>
                        <TableCell align="right">
                          {depth === 0 && (
                            <>
                              <Tooltip title="Restore">
                                <IconButton
                                  size="small"
                                  onClick={() => restoreMutation.mutate(f.id)}
                                  disabled={restoreMutation.isPending}
                                  color="primary"
                                >
                                  <RotateCcw size={18} />
                                </IconButton>
                              </Tooltip>
                              <Tooltip title="Delete permanently">
                                <IconButton
                                  size="small"
                                  onClick={() => setDeleteDialogFile(f)}
                                  disabled={deletePermanentlyMutation.isPending}
                                  color="error"
                                >
                                  <Trash2 size={18} />
                                </IconButton>
                              </Tooltip>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                      {f.type === 'DIRECTORY' && f.children && expandedFolders.has(f.id) && f.children.map((child) => 
                        renderFileRow(child, depth + 1)
                      )}
                    </>
                  );
                  
                  return renderFileRow(file);
                })}
              </TableBody>
            </Table>
          </TableContainer>
        )}

        {/* Context Menu */}
        <Menu
          open={contextMenu !== null}
          onClose={closeContextMenu}
          anchorReference="anchorPosition"
          anchorPosition={contextMenu ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined}
        >
          {contextMenu?.item?.type === 'DIRECTORY' && contextMenu.item.children && contextMenu.item.children.length > 0 && (
            <MenuItem onClick={() => { contextMenu && toggleFolder(contextMenu.item.id); closeContextMenu(); }}>
              <ListItemIcon><Folder size={18} /></ListItemIcon>
              <ListItemText>{expandedFolders.has(contextMenu.item.id) ? 'Collapse' : 'Open'}</ListItemText>
            </MenuItem>
          )}
          <MenuItem onClick={() => { contextMenu && restoreMutation.mutate(contextMenu.item.id); closeContextMenu(); }}>
            <ListItemIcon><RotateCcw size={18} /></ListItemIcon>
            <ListItemText>Restore</ListItemText>
          </MenuItem>
          <MenuItem onClick={() => { contextMenu && setDeleteDialogFile(contextMenu.item); closeContextMenu(); }}>
            <ListItemIcon><Trash2 size={18} color={theme.palette.error.main} /></ListItemIcon>
            <ListItemText>Delete permanently</ListItemText>
          </MenuItem>
        </Menu>
      </Paper>

      {/* Empty Recycle Bin Dialog */}
      <Dialog open={emptyDialogOpen} onClose={() => setEmptyDialogOpen(false)}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AlertTriangle style={{ color: theme.palette.error.main }} />
          Empty Recycle Bin
        </DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to permanently delete all {files?.length || 0} item(s) in the recycle bin?
          </Typography>
          <Typography color="error" sx={{ mt: 1 }}>
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEmptyDialogOpen(false)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => emptyRecycleBinMutation.mutate()}
            disabled={emptyRecycleBinMutation.isPending}
          >
            {emptyRecycleBinMutation.isPending ? 'Deleting...' : 'Empty Recycle Bin'}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Delete Single File Dialog */}
      <Dialog open={!!deleteDialogFile} onClose={() => setDeleteDialogFile(null)}>
        <DialogTitle sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
          <AlertTriangle style={{ color: theme.palette.error.main }} />
          Delete Permanently
        </DialogTitle>
        <DialogContent>
          <Typography>
            Are you sure you want to permanently delete "{deleteDialogFile?.name}"?
          </Typography>
          <Typography color="error" sx={{ mt: 1 }}>
            This action cannot be undone.
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDeleteDialogFile(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => deleteDialogFile && deletePermanentlyMutation.mutate(deleteDialogFile.id)}
            disabled={deletePermanentlyMutation.isPending}
          >
            {deletePermanentlyMutation.isPending ? 'Deleting...' : 'Delete Permanently'}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
}
