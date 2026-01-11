import React, { useMemo, useState } from 'react';
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, Box, Typography, IconButton } from '@mui/material';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useQuery } from '@tanstack/react-query';
import api from '../lib/api';

interface Props {
  open: boolean;
  value?: string | null;
  onClose: () => void;
  onSelect: (id: string | null) => void;
  title?: string;
}

export default function FolderSelectDialog({ open, value, onClose, onSelect, title }: Props) {
  const { data: allFolders } = useQuery<any[]>({ queryKey: ['allFoldersForPicker'], queryFn: async () => { const r = await api.get('/files/folders/all'); return r.data; } });

  const folderChildrenMap = useMemo(() => {
    const map: Record<string, any[]> = {};
    (allFolders || []).forEach((f) => {
      const parent = f.parentId || '';
      if (!map[parent]) map[parent] = [];
      map[parent].push(f);
    });
    Object.keys(map).forEach(k => map[k].sort((a,b)=>a.name.localeCompare(b.name)));
    return map;
  }, [allFolders]);

  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [selected, setSelected] = useState<string | null>(value || null);

  const toggle = (id: string) => setExpanded(prev => ({ ...prev, [id]: !prev[id] }));

  const renderNode = (folder: any, level = 0) => {
    const children = folderChildrenMap[folder.id] || [];
    const isExpanded = !!expanded[folder.id];
    const isSelected = selected === folder.id;
    return (
      <Box key={folder.id} sx={{ pl: level * 2, display: 'flex', alignItems: 'center', py: 0.5 }}>
        {children.length > 0 ? (
          <IconButton size="small" onClick={() => toggle(folder.id)}>{isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}</IconButton>
        ) : <Box sx={{ width: 32 }} />}
        <Button size="small" onClick={() => setSelected(folder.id)} sx={{ textTransform: 'none', justifyContent: 'flex-start', color: isSelected ? 'primary.main' : 'text.primary', width: '100%' }}>{`📁 ${folder.name}`}</Button>
        {isExpanded && <Box sx={{ width: '100%' }}>{children.map((c:any)=>renderNode(c, level+1))}</Box>}
      </Box>
    );
  };

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{title || 'Select Folder'}</DialogTitle>
      <DialogContent>
        <Box sx={{ mt: 1 }}>
          <Box sx={{ mb: 1 }}>
            <Button size="small" onClick={() => setSelected(null)} sx={{ textTransform: 'none', justifyContent: 'flex-start', color: selected === null ? 'primary.main' : 'text.primary', width: '100%' }}>🏠 My Drive (Root)</Button>
          </Box>

          <Box sx={{ maxHeight: 320, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1 }}>
            {(folderChildrenMap[''] || []).map((f:any)=>renderNode(f,0))}
            {(folderChildrenMap[''] || []).length === 0 && <Typography variant="body2" color="text.secondary">No folders</Typography>}
          </Box>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={() => { onSelect(selected); onClose(); }}>Select</Button>
      </DialogActions>
    </Dialog>
  );
}
