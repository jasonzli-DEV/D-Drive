import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Paper,
  Typography,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  IconButton,
  Tooltip,
  CircularProgress,
  useTheme,
  Menu,
  MenuItem,
  ListItemIcon,
  ListItemText,
} from '@mui/material';
import { Folder, File, Download, Star, StarOff, Eye } from 'lucide-react';
import { formatDistance } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../lib/api';
import { useNavigate } from 'react-router-dom';

interface StarredFile {
  id: string;
  name: string;
  type: 'FILE' | 'DIRECTORY';
  size: string;
  path: string;
  parentId: string | null;
  mimeType: string | null;
  starred: boolean;
  createdAt: string;
  updatedAt: string;
}

function formatSize(bytes: string | number): string {
  const b = typeof bytes === 'string' ? parseInt(bytes, 10) : bytes;
  if (b === 0) return '-';
  const units = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(b) / Math.log(1024));
  return `${(b / Math.pow(1024, i)).toFixed(1)} ${units[i]}`;
}

export default function StarredPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const theme = useTheme();
  const [contextMenu, setContextMenu] = useState<{ mouseX: number; mouseY: number; item: StarredFile } | null>(null);

  const handleContextMenu = (e: React.MouseEvent, file: StarredFile) => {
    e.preventDefault();
    setContextMenu({ mouseX: e.clientX, mouseY: e.clientY, item: file });
  };

  const closeContextMenu = () => {
    setContextMenu(null);
  };

  const { data: starredFiles, isLoading } = useQuery<StarredFile[]>({
    queryKey: ['files', 'starred'],
    queryFn: async () => {
      const res = await api.get('/files/starred');
      return res.data;
    },
  });

  const unstarMutation = useMutation({
    mutationFn: async (fileId: string) => {
      await api.post(`/files/${fileId}/star`, { starred: false });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      toast.success('Removed from starred');
    },
    onError: () => {
      toast.error('Failed to unstar file');
    },
  });

  const handleDownload = async (file: StarredFile) => {
    if (file.type === 'DIRECTORY') {
      // Navigate to the folder
      navigate(`/drive/${file.id}`);
      return;
    }
    try {
      const token = localStorage.getItem('token');
      const response = await fetch(`${api.defaults.baseURL}/files/${file.id}/download`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error('Download failed');
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = file.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      toast.error('Download failed');
    }
  };

  const handleNavigateToFile = (file: StarredFile) => {
    if (file.type === 'DIRECTORY') {
      navigate(`/drive/${file.id}`);
    } else if (file.parentId) {
      navigate(`/drive/${file.parentId}`);
    } else {
      navigate('/');
    }
  };

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', py: 8 }}>
        <CircularProgress />
      </Box>
    );
  }

  return (
    <Box>
      <Paper sx={{ p: 3, minHeight: 'calc(100vh - 140px)' }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 1 }}>
          <Star size={24} fill="gold" color="gold" />
          <Typography variant="h5" fontWeight={600}>
            Starred Files
          </Typography>
        </Box>

        {!starredFiles || starredFiles.length === 0 ? (
          <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '50vh' }}>
            <Star size={48} color="#ccc" style={{ marginBottom: 16 }} />
            <Typography color="text.secondary">
              No starred files yet. Star files for quick access.
            </Typography>
          </Box>
        ) : (
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow>
                  <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Location</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Size</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Modified</TableCell>
                  <TableCell sx={{ fontWeight: 600 }} align="right">Actions</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {starredFiles.map((file) => (
                  <TableRow 
                    key={file.id} 
                    hover 
                    sx={{ cursor: 'pointer' }}
                    onClick={() => handleNavigateToFile(file)}
                    onContextMenu={(e) => handleContextMenu(e, file)}
                  >
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {file.type === 'DIRECTORY' ? (
                          <Folder size={20} color={theme.palette.warning.main} />
                        ) : (
                          <File size={20} color={theme.palette.primary.main} />
                        )}
                        <Typography>{file.name}</Typography>
                      </Box>
                    </TableCell>
                    <TableCell>
                      <Typography variant="body2" color="text.secondary">
                        {file.path.split('/').slice(0, -1).join('/') || '/'}
                      </Typography>
                    </TableCell>
                    <TableCell>{formatSize(file.size)}</TableCell>
                    <TableCell>
                      {formatDistance(new Date(file.updatedAt), new Date(), { addSuffix: true })}
                    </TableCell>
                    <TableCell align="right">
                      <Box sx={{ display: 'flex', justifyContent: 'flex-end', gap: 0.5 }}>
                        <Tooltip title="View location">
                          <IconButton 
                            size="small" 
                            onClick={(e) => {
                              e.stopPropagation();
                              handleNavigateToFile(file);
                            }}
                          >
                            <Eye size={18} />
                          </IconButton>
                        </Tooltip>
                        {file.type === 'FILE' && (
                          <Tooltip title="Download">
                            <IconButton 
                              size="small" 
                              onClick={(e) => {
                                e.stopPropagation();
                                handleDownload(file);
                              }}
                            >
                              <Download size={18} />
                            </IconButton>
                          </Tooltip>
                        )}
                        <Tooltip title="Remove from starred">
                          <IconButton
                            size="small"
                            onClick={(e) => {
                              e.stopPropagation();
                              unstarMutation.mutate(file.id);
                            }}
                          >
                            <StarOff size={18} />
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

        {/* Context Menu */}
        <Menu
          open={contextMenu !== null}
          onClose={closeContextMenu}
          anchorReference="anchorPosition"
          anchorPosition={contextMenu ? { top: contextMenu.mouseY, left: contextMenu.mouseX } : undefined}
        >
          <MenuItem onClick={() => { contextMenu && handleNavigateToFile(contextMenu.item); closeContextMenu(); }}>
            <ListItemIcon><Eye size={18} /></ListItemIcon>
            <ListItemText>View location</ListItemText>
          </MenuItem>
          {contextMenu?.item?.type === 'FILE' && (
            <MenuItem onClick={() => { contextMenu && handleDownload(contextMenu.item); closeContextMenu(); }}>
              <ListItemIcon><Download size={18} /></ListItemIcon>
              <ListItemText>Download</ListItemText>
            </MenuItem>
          )}
          <MenuItem onClick={() => { contextMenu && unstarMutation.mutate(contextMenu.item.id); closeContextMenu(); }}>
            <ListItemIcon><StarOff size={18} /></ListItemIcon>
            <ListItemText>Remove from starred</ListItemText>
          </MenuItem>
        </Menu>
      </Paper>
    </Box>
  );
}
