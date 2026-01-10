import { useState, useCallback } from 'react';
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
  Snackbar,
  Alert,
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

  // Fetch files
  const { data: files, isLoading } = useQuery({
    queryKey: ['files', folderId],
    queryFn: async () => {
      const params = folderId ? `?parentId=${folderId}` : '';
      const response = await api.get(`/files${params}`);
      return response.data as FileItem[];
    },
  });

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
      formData.append('file', file);
      if (folderId) {
        formData.append('parentId', folderId);
      }
      formData.append('path', `/${file.name}`);
      formData.append('encrypt', encryptFiles.toString());

      // Add to upload progress
      setUploadProgress(prev => [...prev, { fileName: file.name, progress: 0, status: 'uploading' }]);

      const response = await api.post('/files/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
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
      toast.error(error.response?.data?.error || 'Failed to rename');
    },
  });

  const onDrop = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach((file) => {
      uploadMutation.mutate(file);
    });
  }, [uploadMutation]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    noClick: true,
  });

  const handleOpenMenu = (event: React.MouseEvent<HTMLElement>, file: FileItem) => {
    setMenuAnchor(event.currentTarget);
    setMenuFile(file);
  };

  const handleCloseMenu = () => {
    setMenuAnchor(null);
    setMenuFile(null);
  };

  const handleMoveClick = () => {
    if (menuFile) {
      setSelectedFile(menuFile);
      setMoveDialogOpen(true);
    }
    handleCloseMenu();
  };

  const handleRenameClick = () => {
    if (menuFile) {
      setSelectedFile(menuFile);
      setNewName(menuFile.name);
      setRenameDialogOpen(true);
    }
    handleCloseMenu();
  };

  const handleDeleteClick = () => {
    if (menuFile) {
      deleteMutation.mutate(menuFile.id);
    }
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
    <Box {...getRootProps()} sx={{ height: '100%', p: 3 }}>
      <input {...getInputProps()} />
      
      {isDragActive && (
        <Box
          sx={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(88, 101, 242, 0.1)',
            border: '3px dashed #5865F2',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 9999,
          }}
        >
          <Typography variant="h4">Drop files here...</Typography>
        </Box>
      )}

      <Box sx={{ mb: 3, display: 'flex', gap: 2, alignItems: 'center' }}>
        <Button
          variant="contained"
          startIcon={<Upload />}
          onClick={() => document.getElementById('file-upload')?.click()}
        >
          Upload
        </Button>
        <input
          id="file-upload"
          type="file"
          hidden
          multiple
          onChange={(e) => {
            if (e.target.files) {
              Array.from(e.target.files).forEach((file) => {
                uploadMutation.mutate(file);
              });
            }
          }}
        />
        <Button
          variant="outlined"
          startIcon={<FolderPlus />}
          onClick={() => setNewFolderOpen(true)}
        >
          New Folder
        </Button>
        <Tooltip title="Encrypt files with AES-256 before uploading">
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

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
          <CircularProgress />
        </Box>
      ) : (
        <TableContainer component={Paper}>
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Modified</TableCell>
                <TableCell>Size</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {files?.map((file) => (
                <TableRow 
                  key={file.id} 
                  hover
                  onClick={() => file.type === 'DIRECTORY' && handleFolderClick(file)}
                  sx={{ cursor: file.type === 'DIRECTORY' ? 'pointer' : 'default' }}
                >
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {file.type === 'DIRECTORY' ? (
                        <Folder size={20} color="#FFA000" />
                      ) : (
                        <File size={20} color="#666" />
                      )}
                      <Typography>{file.name}</Typography>
                    </Box>
                  </TableCell>
                  <TableCell>
                    {formatDistance(new Date(file.updatedAt), new Date(), {
                      addSuffix: true,
                    })}
                  </TableCell>
                  <TableCell>
                    {file.type === 'FILE' ? formatFileSize(Number(file.size)) : '—'}
                  </TableCell>
                  <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                    {file.type === 'FILE' && (
                      <IconButton onClick={() => handleDownload(file)} size="small">
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
              {files?.length === 0 && (
                <TableRow>
                  <TableCell colSpan={4} align="center" sx={{ py: 8 }}>
                    <Typography color="text.secondary">
                      No files yet. Upload or drag files here to get started!
                    </Typography>
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </TableContainer>
      )}

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

      {/* Context Menu */}
      <Menu
        anchorEl={menuAnchor}
        open={Boolean(menuAnchor)}
        onClose={handleCloseMenu}
      >
        <MenuItem onClick={handleRenameClick}>
          <ListItemIcon>
            <Edit size={18} />
          </ListItemIcon>
          <ListItemText>Rename</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleMoveClick}>
          <ListItemIcon>
            <Move size={18} />
          </ListItemIcon>
          <ListItemText>Move</ListItemText>
        </MenuItem>
        <MenuItem onClick={handleDeleteClick} sx={{ color: 'error.main' }}>
          <ListItemIcon>
            <Trash2 size={18} color="red" />
          </ListItemIcon>
          <ListItemText>Delete</ListItemText>
        </MenuItem>
      </Menu>

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
            disabled={!newName}
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
