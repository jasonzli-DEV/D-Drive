import { useState, useEffect } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography, List, ListItem, ListItemButton, ListItemIcon, ListItemText, Breadcrumbs, Link } from '@mui/material';
import { Folder, ChevronRight, Home, FolderPlus } from 'lucide-react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../lib/api';
import toast from 'react-hot-toast';

interface Props {
  open: boolean;
  value?: string | null;
  onClose: () => void;
  onSelect: (id: string | null) => void;
  title?: string;
}

export default function FolderSelectDialog({ open, value, onClose, onSelect, title }: Props) {
  const queryClient = useQueryClient();
  const { data: allFolders } = useQuery<any[]>({ 
    queryKey: ['allFoldersForPicker'], 
    queryFn: async () => { 
      const r = await api.get('/files/folders/all'); 
      return r.data; 
    } 
  });

  // Current folder being viewed (null = root)
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState('');
  const [showNewFolderInput, setShowNewFolderInput] = useState(false);

  // Reset to root when dialog opens
  useEffect(() => {
    if (open) {
      setCurrentFolderId(null);
      setShowNewFolderInput(false);
    }
  }, [open]);

  // Get current folder's children
  const currentChildren = (allFolders || []).filter((f: any) => 
    (currentFolderId === null && !f.parentId) || (f.parentId === currentFolderId)
  ).sort((a: any, b: any) => a.name.localeCompare(b.name));

  // Build breadcrumb path
  const buildPath = (folderId: string | null): any[] => {
    if (folderId === null) return [];
    const folder = allFolders?.find((f: any) => f.id === folderId);
    if (!folder) return [];
    return [...buildPath(folder.parentId), folder];
  };

  const breadcrumbs = buildPath(currentFolderId);

  // Create folder mutation
  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      const formData = new FormData();
      formData.append('name', name);
      formData.append('type', 'DIRECTORY');
      if (currentFolderId) {
        formData.append('parentId', currentFolderId);
      }
      const response = await api.post('/files/upload', formData);
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['allFoldersForPicker'] });
      queryClient.invalidateQueries({ queryKey: ['files'] });
      setShowNewFolderInput(false);
      setNewFolderName('');
      toast.success('Folder created');
    },
    onError: () => {
      toast.error('Failed to create folder');
    },
  });

  const handleCreateFolder = () => {
    if (!newFolderName.trim()) {
      toast.error('Folder name cannot be empty');
      return;
    }
    createFolderMutation.mutate(newFolderName.trim());
  };

  const handleSelect = () => {
    onSelect(currentFolderId);
    onClose();
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title || 'Select Folder'}</DialogTitle>
      <DialogContent>
        {/* Breadcrumbs */}
        <Box sx={{ mb: 2, mt: 1 }}>
          <Breadcrumbs separator={<ChevronRight size={16} />}>
            <Link
              component="button"
              variant="body2"
              onClick={() => setCurrentFolderId(null)}
              sx={{ 
                display: 'flex', 
                alignItems: 'center', 
                gap: 0.5,
                textDecoration: 'none',
                color: currentFolderId === null ? 'primary.main' : 'text.primary',
                fontWeight: currentFolderId === null ? 600 : 400,
                '&:hover': { textDecoration: 'underline' }
              }}
            >
              <Home size={16} />
              My Drive
            </Link>
            {breadcrumbs.map((folder: any) => (
              <Link
                key={folder.id}
                component="button"
                variant="body2"
                onClick={() => setCurrentFolderId(folder.id)}
                sx={{ 
                  textDecoration: 'none',
                  color: folder.id === currentFolderId ? 'primary.main' : 'text.primary',
                  fontWeight: folder.id === currentFolderId ? 600 : 400,
                  '&:hover': { textDecoration: 'underline' }
                }}
              >
                {folder.name}
              </Link>
            ))}
          </Breadcrumbs>
        </Box>

        {/* New Folder Button */}
        {!showNewFolderInput && (
          <Button
            startIcon={<FolderPlus size={18} />}
            onClick={() => setShowNewFolderInput(true)}
            sx={{ mb: 2 }}
            size="small"
          >
            New Folder
          </Button>
        )}

        {/* New Folder Input */}
        {showNewFolderInput && (
          <Box sx={{ mb: 2, display: 'flex', gap: 1 }}>
            <input
              type="text"
              placeholder="Folder name"
              value={newFolderName}
              onChange={(e) => setNewFolderName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleCreateFolder();
                if (e.key === 'Escape') {
                  setShowNewFolderInput(false);
                  setNewFolderName('');
                }
              }}
              autoFocus
              style={{
                flex: 1,
                padding: '8px 12px',
                border: '1px solid #ccc',
                borderRadius: '4px',
                fontSize: '14px',
              }}
            />
            <Button 
              onClick={handleCreateFolder} 
              disabled={!newFolderName.trim() || createFolderMutation.isPending}
              size="small"
              variant="contained"
            >
              Create
            </Button>
            <Button 
              onClick={() => {
                setShowNewFolderInput(false);
                setNewFolderName('');
              }}
              size="small"
            >
              Cancel
            </Button>
          </Box>
        )}

        {/* Folder List */}
        <Box sx={{ 
          border: '1px solid', 
          borderColor: 'divider', 
          borderRadius: 1, 
          maxHeight: 320, 
          overflow: 'auto' 
        }}>
          <List disablePadding>
            {currentChildren.length === 0 && (
              <ListItem>
                <Typography variant="body2" color="text.secondary">
                  No folders here
                </Typography>
              </ListItem>
            )}
            {currentChildren.map((folder: any) => (
              <ListItem key={folder.id} disablePadding>
                <ListItemButton onClick={() => setCurrentFolderId(folder.id)}>
                  <ListItemIcon sx={{ minWidth: 40 }}>
                    <Folder size={20} />
                  </ListItemIcon>
                  <ListItemText primary={folder.name} />
                  <ChevronRight size={18} color="#999" />
                </ListItemButton>
              </ListItem>
            ))}
          </List>
        </Box>

        {/* Current Location Indicator */}
        <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: 'block' }}>
          Files will be saved to: {breadcrumbs.length > 0 ? breadcrumbs.map((f: any) => f.name).join(' / ') : 'My Drive'}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={handleSelect}>
          Select "{breadcrumbs.length > 0 ? breadcrumbs[breadcrumbs.length - 1].name : 'My Drive'}"
        </Button>
      </DialogActions>
    </Dialog>
  );
}
