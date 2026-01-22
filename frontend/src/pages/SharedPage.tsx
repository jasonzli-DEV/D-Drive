import { useState } from 'react';
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
} from '@mui/material';
import { Folder, File, Download, X, Eye, Edit, Shield } from 'lucide-react';
import { formatDistance } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../lib/api';

interface SharedFile {
  id: string;
  fileId: string;
  permission: 'VIEW' | 'EDIT' | 'ADMIN';
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
  ADMIN: <Shield size={14} />,
};

const permissionColors: Record<string, 'default' | 'primary' | 'secondary'> = {
  VIEW: 'default',
  EDIT: 'primary',
  ADMIN: 'secondary',
};

export default function SharedPage() {
  const theme = useTheme();
  const queryClient = useQueryClient();
  const [tab, setTab] = useState(0);
  const [removeDialog, setRemoveDialog] = useState<SharedFile | null>(null);

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

  const handleDownload = async (file: SharedFile['file']) => {
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
      window.URL.revokeObjectURL(url);
      toast.success(`Downloaded ${file.name}`);
    } catch (error: any) {
      toast.error(error?.response?.data?.error || 'Failed to download file');
    }
  };

  const isLoading = tab === 0 ? loadingWithMe : loadingByMe;
  const files = tab === 0 ? sharedWithMe : sharedByMe;

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Typography variant="h4" gutterBottom>Shared Files</Typography>

      <Paper sx={{ mb: 3 }}>
        <Tabs value={tab} onChange={(_, v) => setTab(v)}>
          <Tab label="Shared with me" />
          <Tab label="Shared by me" />
        </Tabs>
      </Paper>

      <Paper>
        {isLoading ? (
          <Box sx={{ display: 'flex', justifyContent: 'center', p: 4 }}>
            <CircularProgress />
          </Box>
        ) : !files || files.length === 0 ? (
          <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
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
          <TableContainer>
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
                    <TableRow key={share.id} hover>
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
                        {share.file.type === 'FILE' && (
                          <Tooltip title="Download">
                            <IconButton
                              size="small"
                              onClick={() => handleDownload(share.file)}
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
          </TableContainer>
        )}
      </Paper>

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
    </Container>
  );
}
