import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Container,
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
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Paper sx={{ p: 3 }}>
        <Box sx={{ display: 'flex', alignItems: 'center', mb: 3, gap: 1 }}>
          <Star size={24} fill="gold" color="gold" />
          <Typography variant="h5" fontWeight={600}>
            Starred Files
          </Typography>
        </Box>

        {!starredFiles || starredFiles.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8 }}>
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
                  >
                    <TableCell>
                      <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                        {file.type === 'DIRECTORY' ? (
                          <Folder size={20} color="#1976d2" />
                        ) : (
                          <File size={20} color="#666" />
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
      </Paper>
    </Container>
  );
}
