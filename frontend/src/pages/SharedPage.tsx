import { useState, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  Chip,
  Avatar,
  CircularProgress,
  Tabs,
  Tab,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  useTheme,
  Breadcrumbs,
  Link,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
  TextField,
  LinearProgress,
  Paper,
} from '@mui/material';
import { 
  Folder, 
  File, 
  Download, 
  X, 
  Eye, 
  Edit, 
  ChevronRight,
  ChevronLeft,
  Home,
  Trash,
  FolderPlus,
  Pencil,
  Upload,
  Play,
  Image,
  FileText,
} from 'lucide-react';
import { formatDistance } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../lib/api';

interface SharedFile {
  id: string;
  fileId: string;
  permission: 'VIEW' | 'EDIT';
  createdAt: string;
  file: {
    id: string;
    name: string;
    type: 'FILE' | 'DIRECTORY';
    size: string;
    mimeType: string | null;
    path: string;
  };
  owner?: {
    id: string;
    username: string;
    avatar: string | null;
  };
  sharedWith?: {
    id: string;
    username: string;
    avatar: string | null;
  };
}

interface FolderFile {
  id: string;
  name: string;
  type: 'FILE' | 'DIRECTORY';
  size: string;
  mimeType: string | null;
  path: string;
  createdAt: string;
  updatedAt: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

const permissionIcons: Record<string, JSX.Element> = {
  VIEW: <Eye size={14} />,
  EDIT: <Edit size={14} />,
};

const permissionColors: Record<string, 'default' | 'primary'> = {
  VIEW: 'default',
  EDIT: 'primary',
};

export default function SharedPage() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState(0);
  const [removeDialog, setRemoveDialog] = useState<SharedFile | null>(null);
  
  // Folder navigation state
  const [currentFolder, setCurrentFolder] = useState<{ id: string; name: string; permission: string } | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string; name: string }[]>([]);
  
  // Context menu state
  const [contextMenu, setContextMenu] = useState<{ mouseX: number; mouseY: number; item: FolderFile | null } | null>(null);
  
  // Dialogs
  const [renameDialog, setRenameDialog] = useState<FolderFile | null>(null);
  const [newName, setNewName] = useState('');
  const [createFolderDialog, setCreateFolderDialog] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const [deleteDialog, setDeleteDialog] = useState<FolderFile | null>(null);

  // Media preview state
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewIndex, setPreviewIndex] = useState(0);
  const [previewList, setPreviewList] = useState<FolderFile[]>([]);
  const [previewBlobUrl, setPreviewBlobUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [videoLoadProgress, setVideoLoadProgress] = useState(0);
  const loadedPreviewIdRef = useRef<string | null>(null);

  // Helper functions for file types
  const isImageFile = (f: FolderFile) => {
    if (f.mimeType && f.mimeType.startsWith('image/')) return true;
    const ext = (f.name || '').split('.').pop()?.toLowerCase() || '';
    return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'heic'].includes(ext);
  };

  const isVideoFile = (f: FolderFile) => {
    if (f.mimeType && f.mimeType.startsWith('video/')) return true;
    const ext = (f.name || '').split('.').pop()?.toLowerCase() || '';
    return ['mp4', 'mov', 'webm', 'ogg', 'mkv', 'avi', 'm4v'].includes(ext);
  };

  const isPdfFile = (f: FolderFile) => {
    if (f.mimeType && f.mimeType === 'application/pdf') return true;
    const ext = (f.name || '').split('.').pop()?.toLowerCase() || '';
    return ext === 'pdf';
  };

  const canPreview = (f: FolderFile) => isImageFile(f) || isVideoFile(f) || isPdfFile(f);

  const openPreview = (file: FolderFile, files: FolderFile[]) => {
    const previewableFiles = files.filter(f => f.type === 'FILE' && canPreview(f));
    if (previewableFiles.length === 0) return;
    
    const idx = previewableFiles.findIndex(f => f.id === file.id);
    setPreviewList(previewableFiles);
    setPreviewIndex(Math.max(0, idx));
    setPreviewOpen(true);
  };

  const closePreview = () => {
    loadedPreviewIdRef.current = null;
    setPreviewOpen(false);
    setPreviewBlobUrl(null);
    setPreviewError(null);
  };

  const showPrevPreview = () => {
    loadedPreviewIdRef.current = null;
    setPreviewIndex(i => Math.max(0, i - 1));
  };

  const showNextPreview = () => {
    loadedPreviewIdRef.current = null;
    setPreviewIndex(i => Math.min(previewList.length - 1, i + 1));
  };

  // Files shared with me
  const { data: sharedWithMe, isLoading: loadingWithMe } = useQuery({
    queryKey: ['shares', 'with-me'],
    queryFn: async () => {
      const response = await api.get('/shares/with-me');
      return response.data as SharedFile[];
    },
  });

  // Files I've shared
  const { data: sharedByMe, isLoading: loadingByMe } = useQuery({
    queryKey: ['shares', 'by-me'],
    queryFn: async () => {
      const response = await api.get('/shares/by-me');
      return response.data as SharedFile[];
    },
  });

  // Folder contents when browsing
  const { data: folderContents, isLoading: loadingFolder } = useQuery({
    queryKey: ['shared-folder', currentFolder?.id],
    queryFn: async () => {
      if (!currentFolder) return null;
      const response = await api.get(`/shares/folder/${currentFolder.id}/contents`);
      return response.data as { folder: FolderFile; files: FolderFile[]; permission: string };
    },
    enabled: !!currentFolder,
  });

  const removeShareMutation = useMutation({
    mutationFn: async (shareId: string) => {
      await api.delete(`/shares/${shareId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shares'] });
      toast.success('Share removed');
      setRemoveDialog(null);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Failed to remove share');
    },
  });

  const renameMutation = useMutation({
    mutationFn: async ({ fileId, name }: { fileId: string; name: string }) => {
      await api.patch(`/shares/file/${fileId}/rename`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shared-folder'] });
      toast.success('Renamed successfully');
      setRenameDialog(null);
      setNewName('');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Failed to rename');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (fileId: string) => {
      await api.delete(`/shares/file/${fileId}`);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shared-folder'] });
      toast.success('Deleted successfully');
      setDeleteDialog(null);
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Failed to delete');
    },
  });

  const createFolderMutation = useMutation({
    mutationFn: async ({ folderId, name }: { folderId: string; name: string }) => {
      await api.post(`/shares/folder/${folderId}/create-folder`, { name });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['shared-folder'] });
      toast.success('Folder created');
      setCreateFolderDialog(false);
      setNewFolderName('');
    },
    onError: (error: any) => {
      toast.error(error?.response?.data?.error || 'Failed to create folder');
    },
  });

  const handleDownload = async (fileId: string, fileName: string) => {
    try {
      const response = await api.get(`/shares/file/${fileId}/download`, {
        responseType: 'blob',
      });
      
      const url = window.URL.createObjectURL(new Blob([response.data]));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', fileName);
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
      toast.success(`Downloaded ${fileName}`);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to download file');
    }
  };

  const openFolder = (share: SharedFile) => {
    setCurrentFolder({ id: share.file.id, name: share.file.name, permission: share.permission });
    setBreadcrumbs([{ id: share.file.id, name: share.file.name }]);
  };

  const navigateToFolder = (folder: FolderFile) => {
    if (!currentFolder) return;
    setBreadcrumbs(prev => [...prev, { id: folder.id, name: folder.name }]);
    setCurrentFolder({ ...currentFolder, id: folder.id, name: folder.name });
  };

  const navigateToBreadcrumb = (index: number) => {
    if (!currentFolder) return;
    const newBreadcrumbs = breadcrumbs.slice(0, index + 1);
    setBreadcrumbs(newBreadcrumbs);
    const target = newBreadcrumbs[newBreadcrumbs.length - 1];
    setCurrentFolder({ ...currentFolder, id: target.id, name: target.name });
  };

  const goBack = () => {
    setCurrentFolder(null);
    setBreadcrumbs([]);
  };

  const handleContextMenu = (e: React.MouseEvent, item: FolderFile) => {
    e.preventDefault();
    setContextMenu({ mouseX: e.clientX, mouseY: e.clientY, item });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!currentFolder || !e.target.files?.length) return;
    
    const file = e.target.files[0];
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      await api.post(`/shares/folder/${currentFolder.id}/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      
      queryClient.invalidateQueries({ queryKey: ['shared-folder'] });
      toast.success(`Uploaded ${file.name}`);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to upload file');
    }
    
    e.target.value = '';
  };

  // Effect to load preview content
  const loadPreview = async () => {
    if (!previewOpen) return;
    const current = previewList[previewIndex];
    if (!current) return;
    
    // Skip if we already loaded this
    if (loadedPreviewIdRef.current === current.id && previewBlobUrl) return;
    
    setPreviewError(null);
    setPreviewLoading(true);
    setPreviewBlobUrl(null);
    setVideoLoadProgress(0);

    try {
      const isVideo = isVideoFile(current);
      
      // For videos, use direct URL for streaming
      if (isVideo) {
        const token = localStorage.getItem('token');
        const baseUrl = import.meta.env.VITE_API_URL || 'http://localhost:5000/api';
        const videoUrl = `${baseUrl}/shares/file/${current.id}/download?inline=1${token ? `&token=${encodeURIComponent(token)}` : ''}`;
        loadedPreviewIdRef.current = current.id;
        setPreviewBlobUrl(videoUrl);
        setPreviewLoading(false);
        return;
      }

      // For images/PDFs, fetch blob
      const response = await api.get(`/shares/file/${current.id}/download`, {
        responseType: 'blob',
      });
      
      const blob = response.data as Blob;
      const url = URL.createObjectURL(blob);
      loadedPreviewIdRef.current = current.id;
      setPreviewBlobUrl(url);
      setPreviewLoading(false);
    } catch (err: any) {
      setPreviewError(err?.response?.data?.error || 'Failed to load preview');
      setPreviewLoading(false);
    }
  };

  // Auto-load preview when dialog opens or index changes  
  if (previewOpen && previewList[previewIndex] && loadedPreviewIdRef.current !== previewList[previewIndex].id) {
    loadPreview();
  }

  const isLoading = currentFolder ? loadingFolder : (tab === 0 ? loadingWithMe : loadingByMe);
  const permission = currentFolder?.permission || folderContents?.permission;
  const canEdit = permission === 'EDIT';

  // Render folder contents view
  if (currentFolder) {
    const files = folderContents?.files || [];
    
    return (
      <Box sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', mb: 2 }}>
          <Breadcrumbs separator={<ChevronRight size={16} />}>
            <Link
              component="button"
              underline="hover"
              color="inherit"
              onClick={goBack}
              sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}
            >
              <Home size={16} /> Shared
            </Link>
            {breadcrumbs.map((crumb, index) => (
              <Link
                key={crumb.id}
                component="button"
                underline="hover"
                color={index === breadcrumbs.length - 1 ? 'text.primary' : 'inherit'}
                onClick={() => navigateToBreadcrumb(index)}
              >
                {crumb.name}
              </Link>
            ))}
          </Breadcrumbs>
          
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center' }}>
            <Chip
              size="small"
              icon={permissionIcons[permission || 'VIEW']}
              label={permission}
              color={permissionColors[permission || 'VIEW']}
            />
            {canEdit && (
              <>
                <Button
                  size="small"
                  startIcon={<FolderPlus size={16} />}
                  onClick={() => setCreateFolderDialog(true)}
                >
                  New Folder
                </Button>
                <Button
                  size="small"
                  variant="contained"
                  startIcon={<Upload size={16} />}
                  component="label"
                >
                  Upload
                  <input type="file" hidden onChange={handleFileUpload} />
                </Button>
              </>
            )}
          </Box>
        </Box>

        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : files.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
            <Folder size={48} style={{ opacity: 0.5, marginBottom: 16 }} />
            <Typography variant="h6">Empty folder</Typography>
            {canEdit && (
              <Typography variant="body2">Upload files or create folders to get started</Typography>
            )}
          </Box>
        ) : (
          <Table>
            <TableHead>
              <TableRow>
                <TableCell>Name</TableCell>
                <TableCell>Size</TableCell>
                <TableCell>Modified</TableCell>
                <TableCell align="right">Actions</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {files.map((file) => (
                <TableRow 
                  key={file.id} 
                  hover
                  onContextMenu={(e) => handleContextMenu(e, file)}
                  onDoubleClick={() => {
                    if (file.type === 'DIRECTORY') {
                      navigateToFolder(file);
                    } else if (canPreview(file)) {
                      openPreview(file, files);
                    }
                  }}
                  sx={{ cursor: file.type === 'DIRECTORY' || canPreview(file) ? 'pointer' : 'default' }}
                >
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {file.type === 'DIRECTORY' ? (
                        <Folder size={20} style={{ color: theme.palette.warning.main }} />
                      ) : isImageFile(file) ? (
                        <Image size={20} style={{ color: theme.palette.info.main }} />
                      ) : isVideoFile(file) ? (
                        <Play size={20} style={{ color: theme.palette.error.main }} />
                      ) : isPdfFile(file) ? (
                        <FileText size={20} style={{ color: theme.palette.warning.dark }} />
                      ) : (
                        <File size={20} style={{ color: theme.palette.primary.main }} />
                      )}
                      {file.name}
                    </Box>
                  </TableCell>
                  <TableCell>
                    {file.type === 'DIRECTORY' ? '-' : formatBytes(parseInt(file.size))}
                  </TableCell>
                  <TableCell>
                    <Tooltip title={new Date(file.updatedAt).toLocaleString()}>
                      <span>
                        {formatDistance(new Date(file.updatedAt), new Date(), { addSuffix: true })}
                      </span>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right">
                    {file.type === 'FILE' && canPreview(file) && (
                      <Tooltip title="Preview">
                        <IconButton size="small" onClick={() => openPreview(file, files)}>
                          <Eye size={18} />
                        </IconButton>
                      </Tooltip>
                    )}
                    {file.type === 'FILE' && (
                      <Tooltip title="Download">
                        <IconButton size="small" onClick={() => handleDownload(file.id, file.name)}>
                          <Download size={18} />
                        </IconButton>
                      </Tooltip>
                    )}
                    {file.type === 'DIRECTORY' && (
                      <Tooltip title="Open folder">
                        <IconButton size="small" onClick={() => navigateToFolder(file)}>
                          <ChevronRight size={18} />
                        </IconButton>
                      </Tooltip>
                    )}
                    {canEdit && (
                      <>
                        <Tooltip title="Rename">
                          <IconButton size="small" onClick={() => { setRenameDialog(file); setNewName(file.name); }}>
                            <Pencil size={18} />
                          </IconButton>
                        </Tooltip>
                        <Tooltip title="Delete">
                          <IconButton size="small" color="error" onClick={() => setDeleteDialog(file)}>
                            <Trash size={18} />
                          </IconButton>
                        </Tooltip>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Context Menu */}
        <Menu
          open={contextMenu !== null}
          onClose={closeContextMenu}
          anchorReference="anchorPosition"
          anchorPosition={contextMenu ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined}
        >
          {contextMenu?.item?.type === 'DIRECTORY' && (
            <MenuItem onClick={() => { navigateToFolder(contextMenu.item!); closeContextMenu(); }}>
              <ListItemIcon><ChevronRight size={18} /></ListItemIcon>
              <ListItemText>Open</ListItemText>
            </MenuItem>
          )}
          {contextMenu?.item?.type === 'FILE' && (
            <MenuItem onClick={() => { handleDownload(contextMenu.item!.id, contextMenu.item!.name); closeContextMenu(); }}>
              <ListItemIcon><Download size={18} /></ListItemIcon>
              <ListItemText>Download</ListItemText>
            </MenuItem>
          )}
          {contextMenu?.item?.type === 'FILE' && canPreview(contextMenu.item) && (
            <MenuItem onClick={() => { openPreview(contextMenu.item!, files); closeContextMenu(); }}>
              <ListItemIcon><Eye size={18} /></ListItemIcon>
              <ListItemText>Preview</ListItemText>
            </MenuItem>
          )}
          {canEdit && (
            <>
              <MenuItem onClick={() => { setRenameDialog(contextMenu?.item || null); setNewName(contextMenu?.item?.name || ''); closeContextMenu(); }}>
                <ListItemIcon><Pencil size={18} /></ListItemIcon>
                <ListItemText>Rename</ListItemText>
              </MenuItem>
              <MenuItem onClick={() => { setDeleteDialog(contextMenu?.item || null); closeContextMenu(); }}>
                <ListItemIcon><Trash size={18} /></ListItemIcon>
                <ListItemText>Delete</ListItemText>
              </MenuItem>
            </>
          )}
        </Menu>

        {/* Rename Dialog */}
        <Dialog open={!!renameDialog} onClose={() => setRenameDialog(null)}>
          <DialogTitle>Rename {renameDialog?.type === 'DIRECTORY' ? 'Folder' : 'File'}</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              fullWidth
              margin="dense"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && renameDialog && renameMutation.mutate({ fileId: renameDialog.id, name: newName })}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setRenameDialog(null)}>Cancel</Button>
            <Button
              variant="contained"
              onClick={() => renameDialog && renameMutation.mutate({ fileId: renameDialog.id, name: newName })}
              disabled={renameMutation.isPending || !newName.trim()}
            >
              Rename
            </Button>
          </DialogActions>
        </Dialog>

        {/* Create Folder Dialog */}
        <Dialog open={createFolderDialog} onClose={() => setCreateFolderDialog(false)}>
          <DialogTitle>Create New Folder</DialogTitle>
          <DialogContent>
            <TextField
              autoFocus
              fullWidth
              margin="dense"
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && currentFolder && createFolderMutation.mutate({ folderId: currentFolder.id, name: newFolderName })}
            />
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setCreateFolderDialog(false)}>Cancel</Button>
            <Button
              variant="contained"
              onClick={() => currentFolder && createFolderMutation.mutate({ folderId: currentFolder.id, name: newFolderName })}
              disabled={createFolderMutation.isPending || !newFolderName.trim()}
            >
              Create
            </Button>
          </DialogActions>
        </Dialog>

        {/* Delete Dialog */}
        <Dialog open={!!deleteDialog} onClose={() => setDeleteDialog(null)}>
          <DialogTitle>Delete {deleteDialog?.type === 'DIRECTORY' ? 'Folder' : 'File'}</DialogTitle>
          <DialogContent>
            <Typography>
              Are you sure you want to delete "{deleteDialog?.name}"?
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
              Delete
            </Button>
          </DialogActions>
        </Dialog>

        {/* Preview Dialog */}
        <Dialog fullWidth maxWidth="xl" open={previewOpen} onClose={closePreview}>
          <Box tabIndex={0} onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') showPrevPreview();
            if (e.key === 'ArrowRight') showNextPreview();
            if (e.key === 'Escape') closePreview();
          }} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 480 }}>
            <IconButton onClick={showPrevPreview} disabled={previewIndex <= 0} sx={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)' }}>
              <ChevronLeft />
            </IconButton>
            <Box sx={{ maxWidth: '90%', maxHeight: '80%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {previewList[previewIndex] ? (
                previewLoading ? (
                  <CircularProgress />
                ) : previewError ? (
                  <Typography color="error">{previewError}</Typography>
                ) : isPdfFile(previewList[previewIndex]) ? (
                  previewBlobUrl ? (
                    <embed
                      src={previewBlobUrl}
                      type="application/pdf"
                      title={previewList[previewIndex].name}
                      style={{ width: '100%', height: '80vh', border: 0 }}
                    />
                  ) : null
                ) : previewBlobUrl ? (
                  isVideoFile(previewList[previewIndex]) ? (
                    <Box sx={{ width: '100%', position: 'relative' }}>
                      {videoLoadProgress > 0 && videoLoadProgress < 100 && (
                        <Box sx={{ position: 'absolute', top: 10, left: 10, right: 10, zIndex: 1 }}>
                          <LinearProgress variant="determinate" value={videoLoadProgress} />
                          <Typography variant="caption" sx={{ color: 'white', textShadow: '0 0 4px black' }}>
                            Loading: {Math.round(videoLoadProgress)}%
                          </Typography>
                        </Box>
                      )}
                      <video
                        src={previewBlobUrl}
                        controls
                        style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                        onProgress={(e) => {
                          const video = e.currentTarget;
                          if (video.buffered.length > 0) {
                            const bufferedEnd = video.buffered.end(video.buffered.length - 1);
                            const duration = video.duration;
                            if (duration > 0) {
                              setVideoLoadProgress((bufferedEnd / duration) * 100);
                            }
                          }
                        }}
                        onLoadedData={() => setVideoLoadProgress(100)}
                      />
                    </Box>
                  ) : (
                    <img
                      src={previewBlobUrl}
                      alt={previewList[previewIndex].name}
                      style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                    />
                  )
                ) : null
              ) : null}
            </Box>
            <IconButton onClick={showNextPreview} disabled={previewIndex >= previewList.length - 1} sx={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)' }}>
              <ChevronRight />
            </IconButton>
            <IconButton onClick={closePreview} sx={{ position: 'absolute', right: 8, top: 8 }}>
              <X />
            </IconButton>
            {previewList[previewIndex] && (
              <Box sx={{ position: 'absolute', bottom: 16, left: '50%', transform: 'translateX(-50%)', textAlign: 'center' }}>
                <Typography variant="body2" sx={{ color: 'text.secondary' }}>
                  {previewList[previewIndex].name}
                </Typography>
                <Typography variant="caption" sx={{ color: 'text.disabled' }}>
                  {previewIndex + 1} / {previewList.length}
                </Typography>
              </Box>
            )}
          </Box>
        </Dialog>
      </Box>
    );
  }

  // Main shared files list view
  const files = tab === 0 ? sharedWithMe : sharedByMe;

  return (
    <Box>
      <Paper sx={{ p: 3, minHeight: 'calc(100vh - 140px)' }}>
      <Typography variant="h4" gutterBottom>Shared</Typography>

      <Tabs value={tab} onChange={(_, v) => setTab(v)} sx={{ mb: 3 }}>
        <Tab label="Shared with me" />
        <Tab label="Shared by me" />
      </Tabs>

      {isLoading ? (
        <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
          <CircularProgress />
        </Box>
      ) : !files || files.length === 0 ? (
        <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh', color: 'text.secondary' }}>
          <File size={48} style={{ opacity: 0.5, marginBottom: 16 }} />
          <Typography variant="h6">
            {tab === 0 ? 'No files shared with you' : 'You haven\'t shared any files'}
          </Typography>
          <Typography variant="body2">
            {tab === 0 
              ? 'When someone shares a file with you, it will appear here' 
              : 'Share files from the file browser to see them here'}
          </Typography>
        </Box>
      ) : (
        <Table>
          <TableHead>
            <TableRow>
              <TableCell>Name</TableCell>
              <TableCell>{tab === 0 ? 'Shared by' : 'Shared with'}</TableCell>
              <TableCell>Permission</TableCell>
              <TableCell>Size</TableCell>
              <TableCell>Shared</TableCell>
              <TableCell align="right">Actions</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {files.map((share) => {
              const user = tab === 0 ? share.owner : share.sharedWith;
              return (
                <TableRow 
                  key={share.id} 
                  hover
                  onDoubleClick={() => share.file.type === 'DIRECTORY' && tab === 0 && openFolder(share)}
                  sx={{ cursor: share.file.type === 'DIRECTORY' && tab === 0 ? 'pointer' : 'default' }}
                >
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      {share.file.type === 'DIRECTORY' ? (
                        <Folder size={20} style={{ color: theme.palette.warning.main }} />
                      ) : (
                        <File size={20} style={{ color: theme.palette.primary.main }} />
                      )}
                      {share.file.name}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                      <Avatar 
                        sx={{ width: 24, height: 24 }}
                        src={user?.avatar ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png` : undefined}
                      >
                        {user?.username?.charAt(0).toUpperCase()}
                      </Avatar>
                      {user?.username}
                    </Box>
                  </TableCell>
                  <TableCell>
                    <Chip
                      size="small"
                      icon={permissionIcons[share.permission]}
                      label={share.permission}
                      color={permissionColors[share.permission]}
                    />
                  </TableCell>
                  <TableCell>
                    {share.file.type === 'DIRECTORY' ? '-' : formatBytes(parseInt(share.file.size))}
                  </TableCell>
                  <TableCell>
                    <Tooltip title={new Date(share.createdAt).toLocaleString()}>
                      <span>
                        {formatDistance(new Date(share.createdAt), new Date(), { addSuffix: true })}
                      </span>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right">
                    {share.file.type === 'DIRECTORY' && tab === 0 && (
                      <Tooltip title="Open folder">
                        <IconButton size="small" onClick={() => openFolder(share)}>
                          <ChevronRight size={18} />
                        </IconButton>
                      </Tooltip>
                    )}
                    {share.file.type === 'FILE' && tab === 0 && (
                      <Tooltip title="Download">
                        <IconButton
                          size="small"
                          onClick={() => handleDownload(share.file.id, share.file.name)}
                          color="primary"
                        >
                          <Download size={18} />
                        </IconButton>
                      </Tooltip>
                    )}
                    <Tooltip title={tab === 0 ? 'Remove from my shared' : 'Stop sharing'}>
                      <IconButton
                        size="small"
                        onClick={() => setRemoveDialog(share)}
                        color="error"
                      >
                        <X size={18} />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      )}

      {/* Remove Share Dialog */}
      <Dialog open={!!removeDialog} onClose={() => setRemoveDialog(null)}>
        <DialogTitle>
          {tab === 0 ? 'Remove shared file' : 'Stop sharing'}
        </DialogTitle>
        <DialogContent>
          <Typography>
            {tab === 0 
              ? `Remove "${removeDialog?.file.name}" from your shared files? You can ask the owner to share it again.`
              : `Stop sharing "${removeDialog?.file.name}" with ${removeDialog?.sharedWith?.username}?`}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setRemoveDialog(null)}>Cancel</Button>
          <Button
            color="error"
            variant="contained"
            onClick={() => removeDialog && removeShareMutation.mutate(removeDialog.id)}
            disabled={removeShareMutation.isPending}
          >
            {removeShareMutation.isPending ? 'Removing...' : 'Remove'}
          </Button>
        </DialogActions>
      </Dialog>
      </Paper>
    </Box>
  );
}
