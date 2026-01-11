import { useState, useCallback, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
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
  LinearProgress,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  Select,
  FormControl,
  InputLabel,
  FormControlLabel,
  Checkbox,
  Tooltip,
  Breadcrumbs,
  Link,
  Chip,
  Card,
  CardContent,
} from '@mui/material';
import {
  Upload,
  FolderPlus,
  Folder,
  File,
  Download,
  Trash2,
  Move,
  MoreVertical,
  Edit,
  Lock,
  Home,
  ChevronRight,
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { formatDistance } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../lib/api';

interface FileItem {
  id: string;
  name: string;
  type: 'FILE' | 'DIRECTORY';
  size: number;
  mimeType?: string;
  createdAt: string;
  updatedAt: string;
  parentId?: string | null;
  path?: string;
}

interface UploadProgress {
  fileName: string;
  progress: number;
  status: 'uploading' | 'success' | 'error';
}

export default function DrivePage() {
  const { folderId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [folderName, setFolderName] = useState('');
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [targetFolderId, setTargetFolderId] = useState<string>('');
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuFile, setMenuFile] = useState<FileItem | null>(null);
  const [encryptFiles, setEncryptFiles] = useState(true);
  const [draggedFile, setDraggedFile] = useState<FileItem | null>(null);
  
  const [breadcrumbs, setBreadcrumbs] = useState<FileItem[]>([]);

  // Fetch files
  const { data: files, isLoading } = useQuery({
    queryKey: ['files', folderId],
    queryFn: async () => {
      const params = folderId ? `?parentId=${folderId}` : '';
      const response = await api.get(`/files${params}`);
      return response.data as FileItem[];
    },
  });

  // Fetch current folder details for breadcrumbs
  const { data: folderDetails } = useQuery({
    queryKey: ['folder', folderId],
    queryFn: async () => {
      if (!folderId) return null;
      const response = await api.get(`/files/${folderId}`);
      return response.data as FileItem;
    },
    enabled: !!folderId,
  });

  // Build breadcrumbs from current folder by traversing parentId chain
  useEffect(() => {
    const buildBreadcrumbs = async () => {
      const crumbs: FileItem[] = [];
      if (!folderDetails) {
        setBreadcrumbs([]);
        return;
      }

      try {
        // Walk up the parent chain collecting folders
        let current: FileItem | null = folderDetails;
        crumbs.push(current);

        // Prevent infinite loops by limiting depth
        const MAX_DEPTH = 50;
        let depth = 0;

        while (current?.parentId && depth < MAX_DEPTH) {
          depth += 1;
          try {
            const resp = await api.get(`/files/${current.parentId}`);
            const parent = resp.data as FileItem;
            // break if parent is already in crumbs (cycle protection)
            if (crumbs.find(c => c.id === parent.id)) break;
            crumbs.push(parent);
            current = parent;
          } catch (err) {
            // If fetching parent fails, stop climbing
            break;
          }
        }

        // We collected from current -> root, so reverse to show root -> ... -> current
        crumbs.reverse();
        setBreadcrumbs(crumbs);
      } catch (err) {
        // On any unexpected error, fallback to showing current folder only
        setBreadcrumbs([folderDetails]);
      }
    };

    buildBreadcrumbs();
  }, [folderDetails]);

  // Fetch all folders for move dialog
  const { data: allFolders } = useQuery({
    queryKey: ['allFolders'],
    queryFn: async () => {
      const response = await api.get('/files/folders/all');
      return response.data as FileItem[];
    },
  });

  // Upload file mutation
  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      // append metadata first so server-side stream parser can read fields before file
      if (folderId) {
        formData.append('parentId', folderId);
      }
      formData.append('path', `/${file.name}`);
      formData.append('encrypt', encryptFiles.toString());
      formData.append('file', file);

      // Add to upload progress
      setUploadProgress(prev => [...prev, { fileName: file.name, progress: 0, status: 'uploading' }]);

      // Try streaming endpoint first; fallback to legacy endpoint on error
      let response;
      try {
        response = await api.post('/files/upload/stream', formData, {
          onUploadProgress: (progressEvent) => {
            const percentCompleted = Math.round(
              (progressEvent.loaded * 100) / (progressEvent.total || 1)
            );
            setUploadProgress(prev =>
              prev.map(p =>
                p.fileName === file.name ? { ...p, progress: percentCompleted } : p
              )
            );
          },
        });
      } catch (err) {
        // Fallback: older endpoint that buffers to disk/server-side
        try {
          response = await api.post('/files/upload', formData, {
            onUploadProgress: (progressEvent) => {
              const percentCompleted = Math.round(
                (progressEvent.loaded * 100) / (progressEvent.total || 1)
              );
              setUploadProgress(prev =>
                prev.map(p =>
                  p.fileName === file.name ? { ...p, progress: percentCompleted } : p
                )
              );
            },
          });
        } catch (err2) {
          throw err2;
        }
      }
      return { data: response.data, fileName: file.name };
    },
    onSuccess: ({ fileName }) => {
      setUploadProgress(prev =>
        prev.map(p =>
          p.fileName === fileName ? { ...p, status: 'success', progress: 100 } : p
        )
      );
      queryClient.invalidateQueries({ queryKey: ['files'] });
      toast.success('File uploaded successfully!');
      // Remove from progress after 3 seconds
      setTimeout(() => {
        setUploadProgress(prev => prev.filter(p => p.fileName !== fileName));
      }, 3000);
    },
    onError: (error: any, file: File) => {
      setUploadProgress(prev =>
        prev.map(p =>
          p.fileName === file.name ? { ...p, status: 'error' } : p
        )
      );
      toast.error(error.response?.data?.error || 'Upload failed');
    },
  });

  // Create folder mutation
  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await api.post('/files/directory', {
        name,
        parentId: folderId || null,
        path: `/${name}`,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      toast.success('Folder created successfully!');
      setNewFolderOpen(false);
      setFolderName('');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to create folder');
    },
  });

  // Delete file mutation
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      await api.delete(`/files/${id}`);
      return id;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      toast.success('Deleted successfully!');
      handleCloseMenu();
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Delete failed');
    },
  });

  // Move file mutation
  const moveMutation = useMutation({
    mutationFn: async ({ fileId, newParentId }: { fileId: string; newParentId: string | null }) => {
      const response = await api.patch(`/files/${fileId}/move`, { parentId: newParentId });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      toast.success('File moved successfully!');
      setMoveDialogOpen(false);
      setSelectedFile(null);
      setTargetFolderId('');
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to move file');
    },
  });

  // Rename file mutation
  const renameMutation = useMutation({
    mutationFn: async ({ fileId, name }: { fileId: string; name: string }) => {
      const response = await api.patch(`/files/${fileId}`, { name });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      toast.success('Renamed successfully!');
      setRenameDialogOpen(false);
      setSelectedFile(null);
      setNewName('');
    },
    onError: (error: any) => {
      // Ensure UI stays in sync with server when rename fails (e.g. HTTP 409)
      // Invalidate the specific folder query so the current folder listing refreshes.
      queryClient.invalidateQueries({ queryKey: ['files', folderId] });
      if (error?.response?.status === 409) {
        toast.error(error.response?.data?.error || 'A file with that name already exists');
      } else {
        toast.error(error.response?.data?.error || 'Failed to rename');
      }
    },
  });

  // Support different react-query versions: status may be 'loading' or 'pending'
  const renameIsLoading = ((renameMutation as any).status === 'loading') || ((renameMutation as any).status === 'pending');

  const onDrop = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach((file) => {
      uploadMutation.mutate(file);
    });
  }, [uploadMutation]);

  // Drag and drop handlers for moving files into folders
  const handleDragStart = (e: React.DragEvent, file: FileItem) => {
    e.stopPropagation();
    setDraggedFile(file);
    e.dataTransfer.effectAllowed = 'move';
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    e.dataTransfer.dropEffect = 'move';
  };

  const handleDrop = async (e: React.DragEvent, targetFolder: FileItem) => {
    e.preventDefault();
    e.stopPropagation();
    
    if (!draggedFile || draggedFile.id === targetFolder.id) {
      setDraggedFile(null);
      return;
    }

    try {
      await api.patch(`/files/${draggedFile.id}/move`, {
        parentId: targetFolder.id,
      });
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['allFolders'] });
      toast.success(`Moved ${draggedFile.name} to ${targetFolder.name}`);
    } catch (error: any) {
      toast.error(error.response?.data?.error || 'Failed to move file');
    }
    
    setDraggedFile(null);
  };

  // Context menu handlers
  const handleContextMenu = (e: React.MouseEvent, file: FileItem) => {
    e.preventDefault();
    const target = e.currentTarget as HTMLElement | null;
    if (!target) return;
    setMenuFile(file);
    setMenuAnchor(target);
  };

  const handleCloseMenu = () => {
    setMenuAnchor(null);
    setMenuFile(null);
  };

  const handleMenuAction = (action: string) => {
    if (!menuFile) return;
    
    switch (action) {
      case 'rename':
        setSelectedFile(menuFile);
        setNewName(menuFile.name);
        setRenameDialogOpen(true);
        break;
      case 'move':
        setSelectedFile(menuFile);
        setMoveDialogOpen(true);
        break;
      case 'delete':
        if (window.confirm(`Are you sure you want to delete ${menuFile.name}?`)) {
          deleteMutation.mutate(menuFile.id);
        }
        break;
      case 'download':
        if (menuFile.type === 'FILE') {
          handleDownload(menuFile);
        }
        break;
    }
    
    handleCloseMenu();
  };


  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
  });


  const handleOpenMenu = (event: React.MouseEvent<HTMLElement>, file: FileItem) => {
    const target = event.currentTarget as HTMLElement | null;
    if (!target) return;
    setMenuAnchor(target);
    setMenuFile(file);
  };
  

  const handleFolderClick = (file: FileItem) => {
    if (file.type === 'DIRECTORY') {
      navigate(`/drive/${file.id}`);
    }
  };

  const handleDownload = async (file: FileItem) => {
    try {
      const response = await api.get(`/files/${file.id}/download`, {
        responseType: 'blob',
      });
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', file.name);
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Download started!');
    } catch (error) {
      toast.error('Download failed');
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  };

  return (
    <Box {...getRootProps()} sx={{ height: '100%', p: { xs: 2, sm: 3 }, bgcolor: '#f5f7fa' }}>
      <input {...getInputProps()} />
      
      {isDragActive && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(88, 101, 242, 0.15)',
            border: '4px dashed #5865F2',
            borderRadius: 2,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
            backdropFilter: 'blur(4px)',
          }}
        >
          <Box sx={{ textAlign: 'center' }}>
            <Upload size={64} color="#5865F2" style={{ marginBottom: 16 }} />
            <Typography variant="h4" color="#5865F2" fontWeight={600}>
              Drop files here to upload
            </Typography>
          </Box>
        </Box>
      )}

      {/* Breadcrumb Navigation */}
      {breadcrumbs.length > 0 && (
        <Card sx={{ mb: 3, boxShadow: 1 }}>
          <CardContent sx={{ py: 1.5, '&:last-child': { pb: 1.5 } }}>
            <Breadcrumbs separator={<ChevronRight size={16} />}>
              <Link
                component="button"
                variant="body2"
                onClick={() => navigate('/')}
                sx={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 0.5,
                  textDecoration: 'none',
                  color: 'primary.main',
                  '&:hover': { textDecoration: 'underline' },
                }}
              >
                <Home size={18} />
                <Typography>Home</Typography>
              </Link>
              {breadcrumbs.map((crumb) => (
                <Typography key={crumb.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                  <Folder size={18} />
                  {crumb.name}
                </Typography>
              ))}
            </Breadcrumbs>
          </CardContent>
        </Card>
      )}

      <Card sx={{ mb: 3, boxShadow: 2 }}>
        <CardContent>
          <Box sx={{ mb: 2, display: 'flex', gap: 2, alignItems: 'center', flexWrap: 'wrap' }}>
            <Button
              variant="contained"
              startIcon={<Upload />}
              onClick={() => {
                // Create a fresh input each time to avoid stale input state
                const inp = document.createElement('input');
                inp.type = 'file';
                inp.multiple = true;
                inp.style.display = 'none';
                inp.onchange = (e) => {
                  const target = e.target as HTMLInputElement | null;
                  if (target?.files) {
                    Array.from(target.files).forEach((file) => {
                      uploadMutation.mutate(file);
                    });
                  }
                  // cleanup
                  setTimeout(() => {
                    if (inp.parentNode) inp.parentNode.removeChild(inp);
                  }, 0);
                };
                document.body.appendChild(inp);
                inp.click();
              }}
              sx={{
                px: 3,
                py: 1,
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
              }}
            >
              Upload Files
            </Button>
            
            <Button
              variant="outlined"
              startIcon={<FolderPlus />}
              onClick={() => setNewFolderOpen(true)}
              sx={{
                px: 3,
                py: 1,
                borderRadius: 2,
                textTransform: 'none',
                fontWeight: 600,
              }}
            >
              New Folder
            </Button>
            <Tooltip title="Encrypt files with AES-256 before uploading"
              sx={{ ml: 'auto' }}
            >
          <FormControlLabel
            control={
              <Checkbox
                checked={encryptFiles}
                onChange={(e) => setEncryptFiles(e.target.checked)}
                icon={<Lock size={20} />}
                checkedIcon={<Lock size={20} />}
                sx={{
                  color: 'text.secondary',
                  '&.Mui-checked': { color: 'success.main' },
                }}
              />
            }
            label="Encrypt"
            sx={{ ml: 1 }}
          />
        </Tooltip>
          </Box>
        </CardContent>
      </Card>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : files && files.length === 0 ? (
        <Card sx={{ boxShadow: 2 }}>
          <CardContent>
            <Box sx={{ textAlign: 'center', py: 8 }}>
              <Folder size={64} color="#ccc" style={{ marginBottom: 16 }} />
              <Typography variant="h6" color="text.secondary" gutterBottom>
                This folder is empty
              </Typography>
              <Typography variant="body2" color="text.secondary">
                Upload files or create folders to get started
              </Typography>
            </Box>
          </CardContent>
        </Card>
      ) : (
        <Card sx={{ boxShadow: 2 }}>
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: '#fafbfc' }}>
                  <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Modified</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Size</TableCell>
                  <TableCell align="right" sx={{ fontWeight: 600 }}>Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {files?.map((file) => (
                  <TableRow 
                    key={file.id} 
                    hover
                    draggable={file.type === 'FILE'}
                    onDragStart={(e) => file.type === 'FILE' && handleDragStart(e, file)}
                    onDragOver={(e) => file.type === 'DIRECTORY' && handleDragOver(e)}
                    onDrop={(e) => file.type === 'DIRECTORY' && handleDrop(e, file)}
                    onContextMenu={(e) => handleContextMenu(e, file)}
                    onClick={() => file.type === 'DIRECTORY' && handleFolderClick(file)}
                    sx={{
                      cursor: file.type === 'DIRECTORY' ? 'pointer' : 'default',
                      bgcolor: file.type === 'DIRECTORY' && draggedFile ? 'rgba(88, 101, 242, 0.05)' : 'transparent',
                      transition: 'all 0.2s',
                      '&:hover': {
                        bgcolor: file.type === 'DIRECTORY' ? 'rgba(88, 101, 242, 0.08)' : 'rgba(0, 0, 0, 0.04)',
                      },
                    }}
                  >
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1.5 }}>
                        {file.type === 'DIRECTORY' ? (
                          <Folder size={22} color="#FFA000" />
                        ) : (
                          <File size={22} color="#666" />
                        )}
                        <Typography fontWeight={500}>{file.name}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {formatDistance(new Date(file.updatedAt), new Date(), {
                          addSuffix: true,
                        })}
                      </Typography>
                    </TableCell>
                    <TableCell>
                      <Chip
                        label={file.type === 'FILE' ? formatFileSize(Number(file.size)) : 'Folder'}
                        size="small"
                        sx={{
                          bgcolor: file.type === 'FILE' ? '#e3f2fd' : '#fff3e0',
                          color: file.type === 'FILE' ? '#1976d2' : '#e65100',
                          fontWeight: 500,
                        }}
                      />
                    </TableCell>
                    <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                      {file.type === 'FILE' && (
                        <IconButton onClick={() => handleDownload(file)} size="small" sx={{ mr: 0.5 }}>
                          <Download size={18} />
                        </IconButton>
                      )}
                      <IconButton
                        onClick={(e) => handleOpenMenu(e, file)}
                        size="small"
                      >
                        <MoreVertical size={18} />
                      </IconButton>
                    </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </TableContainer>
      </Card>
      )}

      {/* Context Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleCloseMenu}
        sx={{
          '& .MuiPaper-root': {
            borderRadius: 2,
            boxShadow: '0 4px 20px rgba(0,0,0,0.15)',
            minWidth: 200,
          },
        }}
      >
        {menuFile?.type === 'FILE' && (
          <MenuItem onClick={() => handleMenuAction('download')}>
            <ListItemIcon>
              <Download size={18} />
            </ListItemIcon>
            <ListItemText>Download</ListItemText>
          </MenuItem>
        )}
        <MenuItem onClick={() => handleMenuAction('rename')}>
          <ListItemIcon>
            <Edit size={18} />
          </ListItemIcon>
          <ListItemText>Rename</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleMenuAction('move')}>
          <ListItemIcon>
            <Move size={18} />
          </ListItemIcon>
          <ListItemText>Move</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => handleMenuAction('delete')} sx={{ color: 'error.main' }}>
          <ListItemIcon sx={{ color: 'inherit' }}>
            <Trash2 size={18} />
          </ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>

      <Dialog open={newFolderOpen} onClose={() => setNewFolderOpen(false)}>
        <DialogTitle>Create New Folder</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Folder Name"
            fullWidth
            value={folderName}
            onChange={(e) => setFolderName(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && folderName) {
                createFolderMutation.mutate(folderName);
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewFolderOpen(false)}>Cancel</Button>
          <Button
            onClick={() => createFolderMutation.mutate(folderName)}
            variant="contained"
            disabled={!folderName}
          >
            Create
          </Button>
        </DialogActions>
      </Dialog>

      {/* old context menu removed (duplicate) */}

      {/* Move Dialog */}
      <Dialog open={moveDialogOpen} onClose={() => setMoveDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>Move "{selectedFile?.name}"</DialogTitle>
        <DialogContent>
          <FormControl fullWidth sx={{ mt: 2 }}>
            <InputLabel>Destination Folder</InputLabel>
            <Select
              value={targetFolderId}
              label="Destination Folder"
              onChange={(e) => setTargetFolderId(e.target.value)}
            >
              <MenuItem value="">Root (My Drive)</MenuItem>
              {allFolders?.filter(f => f.id !== selectedFile?.id).map((folder) => (
                <MenuItem key={folder.id} value={folder.id}>
                  📁 {folder.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setMoveDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={() => selectedFile && moveMutation.mutate({ 
              fileId: selectedFile.id, 
              newParentId: targetFolderId || null 
            })}
            variant="contained"
          >
            Move
          </Button>
        </DialogActions>
      </Dialog>

      {/* Rename Dialog */}
      <Dialog open={renameDialogOpen} onClose={() => setRenameDialogOpen(false)}>
        <DialogTitle>Rename "{selectedFile?.name}"</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="New Name"
            fullWidth
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyPress={(e) => {
              if (e.key === 'Enter' && newName && selectedFile) {
                renameMutation.mutate({ fileId: selectedFile.id, name: newName });
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRenameDialogOpen(false)}>Cancel</Button>
          <Button
            onClick={() => selectedFile && renameMutation.mutate({ fileId: selectedFile.id, name: newName })}
            variant="contained"
            disabled={!newName || renameIsLoading}
          >
            Rename
          </Button>
        </DialogActions>
      </Dialog>

      {/* Upload Progress */}
      {uploadProgress.length > 0 && (
        <Paper
          sx={{
            position: 'fixed',
            bottom: 16,
            right: 16,
            width: 350,
            p: 2,
            zIndex: 1000,
          }}
          elevation={6}
        >
          <Typography variant="subtitle2" gutterBottom>
            Uploading Files
          </Typography>
          {uploadProgress.map((item) => (
            <Box key={item.fileName} sx={{ mb: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                  {item.fileName}
                </Typography>
                <Typography variant="body2" color={
                  item.status === 'success' ? 'success.main' :
                  item.status === 'error' ? 'error.main' : 'text.secondary'
                }>
                  {item.status === 'success' ? '✓' : 
                   item.status === 'error' ? '✗' : 
                   `${item.progress}%`}
                </Typography>
              </Box>
              <LinearProgress
                variant="determinate"
                value={item.progress}
                color={
                  item.status === 'success' ? 'success' :
                  item.status === 'error' ? 'error' : 'primary'
                }
              />
            </Box>
          ))}
        </Paper>
      )}
      
    </Box>
  );
}
