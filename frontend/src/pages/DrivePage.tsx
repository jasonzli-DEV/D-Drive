import { useState, useCallback, useEffect, useMemo, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Box,
  Button,
  Checkbox,
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
  Copy,
  MoreVertical,
  Edit,
  Home,
  ChevronRight,
  ChevronLeft,
  ChevronDown,
  X,
} from 'lucide-react';
import { useDropzone } from 'react-dropzone';
import { formatDistance } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../lib/api';
import FolderSelectDialog from '../components/FolderSelectDialog';

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
  id?: string;
}

interface FolderUploadProgress {
  folderKey: string; // unique key for the folder (rel path or 'root')
  folderName: string; // display name
  uploadedBytes: number;
  totalBytes: number;
  progress: number;
  status: 'uploading' | 'success' | 'error';
}

export default function DrivePage() {
  const { folderId } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newMenuOpen, setNewMenuOpen] = useState(false);
  const [newMenuPos, setNewMenuPos] = useState<{ top: number; left: number } | null>(null);
  const [folderName, setFolderName] = useState('');
  const [uploadProgress, setUploadProgress] = useState<UploadProgress[]>([]);
  const [uploadFolders, setUploadFolders] = useState<FolderUploadProgress[]>([]);
  const [deleteProgress, setDeleteProgress] = useState<UploadProgress[]>([]);
  const [copyProgress, setCopyProgress] = useState<UploadProgress[]>([]);
  const fileLoadedRef = useRef<Record<string, number>>({});
  const folderPrevProgressRef = useRef<Record<string, number>>({});
  const folderErrorShownRef = useRef<Record<string, boolean>>({});
  const folderSuccessShownRef = useRef<Record<string, boolean>>({});
  const folderFilesRemainingRef = useRef<Record<string, number>>({});
  const [moveDialogOpen, setMoveDialogOpen] = useState(false);
  const [selectedFile, setSelectedFile] = useState<FileItem | null>(null);
  const [targetFolderId, setTargetFolderId] = useState<string>('');
  const [renameDialogOpen, setRenameDialogOpen] = useState(false);
  const [newName, setNewName] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [bulkProcessing, setBulkProcessing] = useState(false);
  const [bulkProgress, setBulkProgress] = useState<null | { action: 'copy'|'delete'|'move', total: number, completed: number, currentName?: string, failed: number }>(null);
  const [menuAnchor, setMenuAnchor] = useState<null | HTMLElement>(null);
  const [menuFile, setMenuFile] = useState<FileItem | null>(null);
  const [menuPosition, setMenuPosition] = useState<{ top: number; left: number } | null>(null);
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [encryptFiles, setEncryptFiles] = useState(true);
  const [draggedFile, setDraggedFile] = useState<FileItem | null>(null);
  
  const [breadcrumbs, setBreadcrumbs] = useState<FileItem[]>([]);
  const [imageViewerOpen, setImageViewerOpen] = useState(false);
  const [imageViewerIndex, setImageViewerIndex] = useState(0);
  const [imageList, setImageList] = useState<FileItem[]>([]);
  const [imageBlobUrl, setImageBlobUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [imageError, setImageError] = useState<string | null>(null);
  const [textContent, setTextContent] = useState<string | null>(null);

  const isImageFile = (f: FileItem) => {
    if (f.mimeType && f.mimeType.startsWith('image/')) return true;
    const ext = (f.name || '').split('.').pop()?.toLowerCase() || '';
    return ['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'heic'].includes(ext);
  };

  const isVideoFile = (f: FileItem) => {
    if (f.mimeType && f.mimeType.startsWith('video/')) return true;
    const ext = (f.name || '').split('.').pop()?.toLowerCase() || '';
    return ['mp4', 'mov', 'webm', 'ogg', 'mkv', 'avi', 'm4v'].includes(ext);
  };

  const isTextFile = (f: FileItem) => {
    if (f.mimeType && f.mimeType.startsWith('text/')) return true;
    const ext = (f.name || '').split('.').pop()?.toLowerCase() || '';
    return ['txt', 'json', 'md', 'csv', 'log', 'xml', 'yaml', 'yml', 'ini'].includes(ext);
  };

  const openImageViewer = (file: FileItem) => {
    let imgs = (files || []).filter(f => isImageFile(f) || isVideoFile(f) || isTextFile(f));
    // If the clicked file isn't in the current listing (freshly uploaded), add it so viewer can load it
    if (!imgs.find(i => i.id === file.id)) {
      imgs = [file, ...imgs];
    }
    const idx = imgs.findIndex(i => i.id === file.id);
    setImageList(imgs);
    setImageViewerIndex(Math.max(0, idx));
    // initialize viewer state and open
    // For text files, set an empty string immediately so the <pre> renders
    // (some browser/content scripts can error if there is no content node).
    if (isTextFile(file)) {
      setTextContent('');
    } else {
      setTextContent(null);
    }
    setImageViewerOpen(true);
  };

  const closeImageViewer = () => setImageViewerOpen(false);

  const showPrevImage = () => setImageViewerIndex(i => Math.max(0, i - 1));
  const showNextImage = () => setImageViewerIndex(i => Math.min(imageList.length - 1, i + 1));

  useEffect(() => {
    if (!imageViewerOpen) return;
    const current = imageList[imageViewerIndex];
    if (!current) return;
    let active = true;
    setImageError(null);
    setImageLoading(true);
    setImageBlobUrl(null);
    const controller = new AbortController();
    let localUrl: string | null = null;

    const fetchImage = async () => {
      try {
        const res = await api.get(`/files/${current.id}/download`, {
          responseType: 'blob',
          signal: controller.signal as any,
        });
        if (!active) return;
        const blob = res.data as Blob;
        // If text file, read text and set; otherwise create object URL for image/video
        if (isTextFile(current)) {
          try {
            const txt = await blob.text();
            setTextContent(txt);
          } catch (e) {
            setImageError('Failed to read text file');
          }
        } else {
          localUrl = URL.createObjectURL(blob);
          setImageBlobUrl(localUrl);
        }
      } catch (err: any) {
        if (err?.name === 'CanceledError' || err?.name === 'AbortError') return;
        console.error('failed to fetch media', err);
        setImageError('Failed to load media');
      } finally {
        if (active) setImageLoading(false);
      }
    };

    fetchImage();

    return () => {
      active = false;
      controller.abort();
      if (localUrl) {
        URL.revokeObjectURL(localUrl);
        localUrl = null;
      }
      setImageBlobUrl(null);
      setTextContent(null);
    };
  }, [imageViewerOpen, imageViewerIndex, imageList]);

  // Fetch files
  const { data: files, isLoading } = useQuery({
    queryKey: ['files', folderId],
    queryFn: async () => {
      const params = folderId ? `?parentId=${folderId}` : '';
      const response = await api.get(`/files${params}`);
      return response.data as FileItem[];
    },
  });

  const copyMutation = useMutation({
    mutationFn: async (vars: string | { id: string; encrypt?: boolean }) => {
      const id = typeof vars === 'string' ? vars : vars.id;
      const body = typeof vars === 'object' && typeof vars.encrypt !== 'undefined' ? { encrypt: vars.encrypt } : {};
      const resp = await api.post(`/files/${id}/copy`, body);
      return resp.data;
    },
    onSuccess: (data, vars) => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      // If API returned the new file id, poll its metadata and show chunk-level progress
      (async () => {
        try {
          const origId = typeof vars === 'string' ? vars : vars.id;
          const origMeta = await api.get(`/files/${origId}`);
          const origChunks = Array.isArray(origMeta.data.chunks) ? origMeta.data.chunks.length : (origMeta.data.chunkCount || origMeta.data._count?.chunks || 1);
          const newId = data?.id;
          if (!newId) {
            toast.success('Copy created');
            return;
          }
          // create progress entry
          setCopyProgress(prev => [...prev, { id: newId, fileName: origMeta.data.name || `Copy of ${origId}`, progress: 0, status: 'uploading' }]);
          let lastSeen = 0;
          // poll until chunks reach origChunks
          while (lastSeen < origChunks) {
            // eslint-disable-next-line no-await-in-loop
            const m = await api.get(`/files/${newId}`);
            const seen = Array.isArray(m.data.chunks) ? m.data.chunks.length : (m.data.chunkCount || m.data._count?.chunks || 0);
            const delta = Math.max(0, seen - lastSeen);
            if (delta > 0) {
              lastSeen = seen;
              const pct = Math.round((Math.min(lastSeen, origChunks) / Math.max(1, origChunks)) * 100);
              setCopyProgress(prev => prev.map(p => p.id === newId ? { ...p, progress: pct } : p));
            }
            if (lastSeen >= origChunks) break;
            // wait a bit
            // eslint-disable-next-line no-await-in-loop
            await new Promise(r => setTimeout(r, 500));
          }
          setCopyProgress(prev => prev.map(p => p.id === newId ? { ...p, progress: 100, status: 'success' } : p));
          setTimeout(() => setCopyProgress(prev => prev.filter(p => p.id !== newId)), 1500);
          toast.success('Copy created');
        } catch (err: any) {
          toast.success('Copy created');
        }
      })();
    },
    onError: (err: any) => {
      toast.error(err?.response?.data?.error || 'Failed to copy file');
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
  const uploadMutation = useMutation<any, any, { file: File; parentId?: string | null; folderKey?: string; fileKey?: string }>(
    {
    // accepts { file: File, parentId?: string | null, folderKey?: string, fileKey?: string }
    mutationFn: async ({ file, parentId, folderKey, fileKey: fileKeyParam }: { file: File; parentId?: string | null; folderKey?: string; fileKey?: string }) => {
      const formData = new FormData();
      // append metadata first so server-side stream parser can read fields before file
      if (parentId) {
        formData.append('parentId', parentId);
      } else if (folderId) {
        formData.append('parentId', folderId);
      }
      formData.append('encrypt', encryptFiles.toString());
      formData.append('file', file);

      // Add to upload progress (file-level) only for non-folder uploads
      if (!folderKey) {
        setUploadProgress(prev => [...prev, { fileName: file.name, progress: 0, status: 'uploading' }]);
      }

      // Initialize per-file loaded tracker for folder aggregation
      const fileIdentifier = `${folderKey || 'root'}::${fileKeyParam || file.name}`;
      if (folderKey) {
        fileLoadedRef.current[fileIdentifier] = 0;
      }

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

            // Update folder-level progress by delta bytes
            if (folderKey) {
              const fileKeyLocal = fileIdentifier;
              const prevLoaded = fileLoadedRef.current[fileKeyLocal] || 0;
              const delta = progressEvent.loaded - prevLoaded;
              fileLoadedRef.current[fileKeyLocal] = progressEvent.loaded;
              if (delta > 0) {
                let newProgressValue = 0;
                setUploadFolders(prev => prev.map(f => {
                  if (f.folderKey !== folderKey) return f;
                  const uploadedBytes = Math.min(f.uploadedBytes + delta, f.totalBytes || Number.MAX_SAFE_INTEGER);
                  const progress = f.totalBytes ? Math.round((uploadedBytes * 100) / f.totalBytes) : 0;
                  newProgressValue = progress;
                  return { ...f, uploadedBytes, progress };
                }));

                // Update previous progress; final completion will be decided
                // when all file uploads for this folder have settled (onSuccess/onError).
                folderPrevProgressRef.current[folderKey] = newProgressValue;
              }
            }
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

                if (folderKey) {
                  const fileKeyLocal = fileIdentifier;
                  const prevLoaded = fileLoadedRef.current[fileKeyLocal] || 0;
                  const delta = progressEvent.loaded - prevLoaded;
                  fileLoadedRef.current[fileKeyLocal] = progressEvent.loaded;
                  if (delta > 0) {
                    let newProgressValue = 0;
                    setUploadFolders(prev => prev.map(f => {
                      if (f.folderKey !== folderKey) return f;
                      const uploadedBytes = Math.min(f.uploadedBytes + delta, f.totalBytes || Number.MAX_SAFE_INTEGER);
                      const progress = f.totalBytes ? Math.round((uploadedBytes * 100) / f.totalBytes) : 0;
                      newProgressValue = progress;
                      return { ...f, uploadedBytes, progress };
                    }));

                    // Update previous progress; final completion will be decided
                    // when all file uploads for this folder have settled (onSuccess/onError).
                    folderPrevProgressRef.current[folderKey] = newProgressValue;
                  }
                }
              },
          });
        } catch (err2) {
          throw err2;
        }
      }
      return { data: response.data, fileName: file.name };
    },
    onSuccess: (_data, vars) => {
      const fileName = (vars as any).file?.name;
      const folderKey = (vars as any).folderKey;
      if (!folderKey) {
        setUploadProgress(prev =>
          prev.map(p =>
            p.fileName === fileName ? { ...p, status: 'success', progress: 100 } : p
          )
        );
        toast.success('File uploaded successfully!');
        // Remove from progress after 3 seconds
        setTimeout(() => {
          setUploadProgress(prev => prev.filter(p => p.fileName !== fileName));
        }, 3000);
      } else {
        // For folder uploads, decrement remaining counter and finalize only
        // when all files have settled. This avoids marking the folder complete
        // solely based on bytes uploaded which may precede final server-side
        // processing.
        const remaining = (folderFilesRemainingRef.current[folderKey] || 1) - 1;
        folderFilesRemainingRef.current[folderKey] = remaining;
        if (remaining <= 0) {
          folderPrevProgressRef.current[folderKey] = 100;
          setUploadFolders(prev => prev.map(f => f.folderKey === folderKey ? { ...f, status: 'success', progress: 100, uploadedBytes: f.totalBytes } : f));
          if (!folderSuccessShownRef.current[folderKey]) {
            folderSuccessShownRef.current[folderKey] = true;
            toast.success(`Folder uploaded successfully: ${folderKey || 'Root'}`);
          }
          setTimeout(() => setUploadFolders(prev => prev.filter(p => p.folderKey !== folderKey)), 1500);
        }
      }
      queryClient.invalidateQueries({ queryKey: ['files'] });
    },
    onError: (error: any, vars: { file: File; folderKey?: string }) => {
      const file = vars.file;
      const folderKey = (vars as any).folderKey;
      if (!folderKey) {
        setUploadProgress(prev =>
          prev.map(p =>
            p.fileName === file.name ? { ...p, status: 'error' } : p
          )
        );
        toast.error(error.response?.data?.error || 'Upload failed');
      } else {
        // mark folder errored and show only one toast per folder
        setUploadFolders(prev => prev.map(f => f.folderKey === folderKey ? { ...f, status: 'error' } : f));
        if (!folderErrorShownRef.current[folderKey]) {
          folderErrorShownRef.current[folderKey] = true;
          toast.error(error.response?.data?.error || 'Folder upload failed');
        }
        // decrement remaining counter and finalize (remove progress UI) when all files finished
        const remaining = (folderFilesRemainingRef.current[folderKey] || 1) - 1;
        folderFilesRemainingRef.current[folderKey] = remaining;
        if (remaining <= 0) {
          setTimeout(() => setUploadFolders(prev => prev.filter(p => p.folderKey !== folderKey)), 1500);
        }
      }
    },
  }
  );

  // Create folder mutation
  const createFolderMutation = useMutation({
    mutationFn: async (name: string) => {
      const response = await api.post('/files/directory', {
        name,
        parentId: folderId || null,
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

  // Create folder mutation used from the Move dialog (allows specifying parent)
  const createFolderInDialog = useMutation({
    mutationFn: async ({ name, parentId }: { name: string; parentId: string | null }) => {
      const response = await api.post('/files/directory', {
        name,
        parentId,
      });
      return response.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['files'] });
      queryClient.invalidateQueries({ queryKey: ['allFolders'] });
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
    mutationFn: async ({ id, recursive }: { id: string; recursive?: boolean }) => {
      await api.delete(`/files/${id}`, { data: { recursive: !!recursive } });
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

  // Helper: collect all files and directories under a directory (BFS)
  const collectFilesAndDirs = async (rootId: string) => {
    const files: FileItem[] = [];
    const dirs: FileItem[] = [];
    const queue: string[] = [rootId];

    while (queue.length > 0) {
      const current = queue.shift()!;
      try {
        const resp = await api.get(`/files?parentId=${current}`);
        const children = resp.data as FileItem[];
        for (const c of children) {
          if (c.type === 'FILE') files.push(c);
          else if (c.type === 'DIRECTORY') {
            dirs.push(c);
            queue.push(c.id);
          }
        }
      } catch (err) {
        // ignore and continue; caller will surface error
      }
    }

    return { files, dirs };
  };

  // Perform recursive delete by deleting files then directories sequentially,
  // updating a progress entry so the user sees progress.
  const performRecursiveDelete = async (root: FileItem) => {
    // create progress entry (use id so updates are deterministic)
    setDeleteProgress(prev => [...prev, { id: root.id, fileName: root.name, progress: 0, status: 'uploading' }]);
    const entryId = root.id;

    try {
      const { files, dirs } = await collectFilesAndDirs(root.id);
      // Try to get per-file chunk counts so progress can be shown at chunk granularity.
      const fileChunkCounts: Record<string, number> = {};
      try {
        await Promise.all(files.map(async (f) => {
          try {
            const meta = await api.get(`/files/${f.id}`);
            const data = meta.data || {};
            const cnt = Array.isArray(data.chunks) ? data.chunks.length : (data.chunkCount || data.chunksCount || 1);
            fileChunkCounts[f.id] = Math.max(1, Number(cnt) || 1);
          } catch (err) {
            fileChunkCounts[f.id] = 1;
          }
        }));
      } catch (err) {
        // ignore - fallback to 1 per file
      }

      const total = (dirs.length) + 1 + files.reduce((s, f) => s + (fileChunkCounts[f.id] || 1), 0);
      let completed = 0;

      // delete files sequentially, accounting for chunk counts
      for (const f of files) {
        const chunkCount = fileChunkCounts[f.id] || 1;
        await api.delete(`/files/${f.id}`, { data: { recursive: false } });
        completed += chunkCount;
        const pct = Math.round((completed / total) * 100);
        setDeleteProgress(prev => prev.map(p => p.id === entryId ? { ...p, progress: pct } : p));
      }

      // delete directories from leaves up (reverse collected order)
      for (const d of dirs.slice().reverse()) {
        await api.delete(`/files/${d.id}`, { data: { recursive: false } });
        completed++;
        const pct = Math.round((completed / total) * 100);
        setDeleteProgress(prev => prev.map(p => p.id === entryId ? { ...p, progress: pct } : p));
      }

      // delete the root directory itself
      await api.delete(`/files/${root.id}`, { data: { recursive: false } });
      completed++;
      setDeleteProgress(prev => prev.map(p => p.id === entryId ? { ...p, progress: 100, status: 'success' } : p));

      queryClient.invalidateQueries({ queryKey: ['files'] });
      toast.success('Deleted successfully!');
    } catch (err) {
      setDeleteProgress(prev => prev.map(p => p.id === entryId ? { ...p, status: 'error' } : p));
      toast.error('Delete failed');
    } finally {
      // remove the progress entry after a short delay so user can see result
      setTimeout(() => {
        setDeleteProgress(prev => prev.filter(p => p.id !== entryId));
      }, 1500);
    }
  };

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

  // Bulk actions
  const handleBulkCopy = async () => {
    if (selectedIds.length === 0) return;
    setBulkProcessing(true);
    // fetch original chunk counts to provide chunk-level progress
    const origCounts: Record<string, number> = {};
    await Promise.all(selectedIds.map(async (id) => {
      try {
        const m = await api.get(`/files/${id}`);
        origCounts[id] = Array.isArray(m.data.chunks) ? m.data.chunks.length : (m.data.chunkCount || m.data.chunksCount || m.data._count?.chunks || 1);
      } catch (err) {
        origCounts[id] = 1;
      }
    }));

    const totalChunks = selectedIds.reduce((s, id) => s + (origCounts[id] || 1), 0);
    setBulkProgress({ action: 'copy', total: totalChunks, completed: 0, failed: 0 });
    let completed = 0;
    let failed = 0;

    for (let i = 0; i < selectedIds.length; i++) {
      const id = selectedIds[i];
      const file = files?.find(f => f.id === id);
      setBulkProgress(prev => prev ? { ...prev, currentName: file?.name || id } : prev);
      try {
        const resp = await api.post(`/files/${id}/copy`, { encrypt: encryptFiles });
        const newId = resp.data?.id;
        const expect = origCounts[id] || 1;
        if (!newId) {
          // no new id; count as completed immediately
          completed += expect;
          setBulkProgress(prev => prev ? { ...prev, completed: completed } : prev);
          continue;
        }
        // create per-item copy progress entry
        setCopyProgress(prev => [...prev, { id: newId, fileName: file?.name || `Copy of ${id}`, progress: 0, status: 'uploading' }]);
        // poll new file metadata and update progress by observed chunks
        let lastSeen = 0;
        while (lastSeen < expect) {
          // eslint-disable-next-line no-await-in-loop
          const m = await api.get(`/files/${newId}`);
          const seen = Array.isArray(m.data.chunks) ? m.data.chunks.length : (m.data.chunkCount || 0);
          const delta = Math.max(0, seen - lastSeen);
          if (delta > 0) {
            lastSeen = seen;
            completed += delta;
            setBulkProgress(prev => prev ? { ...prev, completed: Math.min(completed, totalChunks) } : prev);
            setCopyProgress(prev => prev.map(p => p.id === newId ? { ...p, progress: Math.round((Math.min(lastSeen, expect) / Math.max(1, expect)) * 100) } : p));
          }
          if (lastSeen >= expect) break;
          // eslint-disable-next-line no-await-in-loop
          await new Promise(r => setTimeout(r, 500));
        }
        setCopyProgress(prev => prev.map(p => p.id === newId ? { ...p, progress: 100, status: 'success' } : p));
        setTimeout(() => setCopyProgress(prev => prev.filter(p => p.id !== newId)), 1500);
      } catch (err: any) {
        failed += 1;
        // approximate by adding expected chunks so progress keeps moving
        const expect = origCounts[id] || 1;
        completed += expect;
        setBulkProgress(prev => prev ? { ...prev, completed: Math.min(completed, totalChunks), failed: (prev.failed || 0) + 1 } : prev);
        // mark per-item copy as failed if there is a newId present
        try {
          const maybeNew = (err?.response?.data?.id) || null;
          if (maybeNew) {
            setCopyProgress(prev => prev.map(p => p.id === maybeNew ? { ...p, status: 'error' } : p));
            setTimeout(() => setCopyProgress(prev => prev.filter(p => p.id !== maybeNew)), 1500);
          }
        } catch (e) {
          // ignore
        }
      }
    }

    // finalize
    setBulkProgress(prev => prev ? { ...prev, completed: Math.min(completed, totalChunks) } : prev);
    const success = selectedIds.length - failed;
    if (failed === 0) {
      toast.success(`${success} copied`);
    } else {
      toast.success(`${success} copied, ${failed} failed`);
      toast.error(`${failed} items failed to copy`);
    }
    setSelectedIds([]);
    setTimeout(() => {
      setBulkProcessing(false);
      setBulkProgress(null);
    }, 1500);
    queryClient.invalidateQueries({ queryKey: ['files'] });
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Delete ${selectedIds.length} selected items? This is irreversible.`)) return;
    setBulkProcessing(true);
    // Build a work list at chunk granularity. For files we count chunks; for directories we
    // collect nested files and count their chunks, then schedule directory deletions after.
    const workFiles: Array<{ id: string; name?: string; chunks: number }> = [];
    const workDirs: string[] = [];
    const seen = new Set<string>();

    // helper to fetch chunk count safely
    const fetchChunkCount = async (fid: string) => {
      try {
        const m = await api.get(`/files/${fid}`);
        return Array.isArray(m.data.chunks) ? m.data.chunks.length : (m.data.chunkCount || 1);
      } catch (err) {
        return 1;
      }
    };

    for (const id of selectedIds) {
      if (seen.has(id)) continue;
      const f = files?.find(x => x.id === id);
      if (f && f.type === 'FILE') {
        const cnt = await fetchChunkCount(id);
        workFiles.push({ id, name: f.name, chunks: cnt });
        seen.add(id);
      } else {
        // assume directory: collect nested files and dirs
        try {
          const { files: nestedFiles, dirs: nestedDirs } = await collectFilesAndDirs(id);
          for (const nf of nestedFiles) {
            if (seen.has(nf.id)) continue;
            const cnt = await fetchChunkCount(nf.id);
            workFiles.push({ id: nf.id, name: nf.name, chunks: cnt });
            seen.add(nf.id);
          }
          // push directories to delete after files
          // include nested dirs then the root dir
          for (const d of nestedDirs) workDirs.push(d.id);
          workDirs.push(id);
        } catch (err: any) {
          // fallback: attempt to delete directly
          workDirs.push(id);
        }
      }
    }

    const total = workFiles.reduce((s, w) => s + (w.chunks || 1), 0) + workDirs.length;
    setBulkProgress({ action: 'delete', total, completed: 0, failed: 0 });
    let completed = 0;
    let failed = 0;

    // delete files sequentially with chunk accounting
    for (const wf of workFiles) {
      setBulkProgress(prev => prev ? { ...prev, currentName: wf.name || wf.id } : prev);
      try {
        await api.delete(`/files/${wf.id}`, { data: { recursive: false } });
        completed += wf.chunks || 1;
        setBulkProgress(prev => prev ? { ...prev, completed: Math.min(completed, total) } : prev);
      } catch (err: any) {
        failed += 1;
        // still advance by expected chunks so progress moves
        completed += wf.chunks || 1;
        setBulkProgress(prev => prev ? { ...prev, completed: Math.min(completed, total), failed: (prev.failed || 0) + 1 } : prev);
      }
    }

    // delete directories (leaves first if provided in nested order)
    for (const dirId of workDirs) {
      setBulkProgress(prev => prev ? { ...prev, currentName: dirId } : prev);
      try {
        await api.delete(`/files/${dirId}`, { data: { recursive: false } });
        completed += 1;
        setBulkProgress(prev => prev ? { ...prev, completed: Math.min(completed, total) } : prev);
      } catch (err: any) {
        failed += 1;
        completed += 1;
        setBulkProgress(prev => prev ? { ...prev, completed: Math.min(completed, total), failed: (prev.failed || 0) + 1 } : prev);
      }
    }

    // finalize
    setBulkProgress(prev => prev ? { ...prev, completed: Math.min(completed, total) } : prev);
    const success = selectedIds.length - failed;
    if (failed === 0) {
      toast.success(`${success} deleted`);
    } else {
      toast.success(`${success} deleted, ${failed} failed`);
      toast.error(`${failed} items failed to delete`);
    }
    setSelectedIds([]);
    setTimeout(() => {
      setBulkProcessing(false);
      setBulkProgress(null);
    }, 1500);
    queryClient.invalidateQueries({ queryKey: ['files'] });
  };

  const handleOpenBulkMove = () => {
    if (selectedIds.length === 0) return;
    setBulkMoveOpen(true);
  };

  const handleBulkMoveSelect = async (newParentId: string | null) => {
    setBulkMoveOpen(false);
    if (!selectedIds.length) return;
    setBulkProcessing(true);
    setBulkProgress({ action: 'move', total: selectedIds.length, completed: 0, failed: 0 });
    let failed = 0;
    for (let i = 0; i < selectedIds.length; i++) {
      const id = selectedIds[i];
      const file = files?.find(f => f.id === id);
      setBulkProgress(prev => prev ? { ...prev, completed: i, currentName: file?.name || id } : prev);
      try {
        await api.patch(`/files/${id}/move`, { parentId: newParentId });
      } catch (err) {
        failed += 1;
        setBulkProgress(prev => prev ? { ...prev, failed: (prev.failed || 0) + 1 } : prev);
      }
    }
    setBulkProgress(prev => prev ? { ...prev, completed: prev.total } : prev);
    const success = selectedIds.length - failed;
    if (failed === 0) {
      toast.success(`${success} moved`);
    } else {
      toast.success(`${success} moved, ${failed} failed`);
      toast.error(`${failed} items failed to move`);
    }
    setSelectedIds([]);
    setTimeout(() => {
      setBulkProcessing(false);
      setBulkProgress(null);
    }, 1500);
    queryClient.invalidateQueries({ queryKey: ['files'] });
  };

  const onDrop = useCallback((acceptedFiles: File[]) => {
    acceptedFiles.forEach((file) => {
      uploadMutation.mutate({ file, parentId: folderId || null });
    });
  }, [uploadMutation]);

  // Drag and drop handlers for moving files into folders
  const handleDragStart = (e: React.DragEvent, file: FileItem) => {
    e.stopPropagation();
    setDraggedFile(file);
    e.dataTransfer.effectAllowed = 'move';
  };
  // Initialize encryptFiles from user preferences
  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const resp = await api.get('/me');
        if (!mounted) return;
        const pref = resp.data?.encryptByDefault;
        if (typeof pref === 'boolean') setEncryptFiles(pref);
      } catch (err) {
        // ignore - default remains
      }
    })();
    return () => { mounted = false; };
  }, []);

  // Listen for +New events dispatched by the Layout sidebar
  useEffect(() => {
    const handler = (e: any) => {
      const { x, y } = e.detail || {};
      setNewMenuPos({ top: y || 80, left: x || 80 });
      setNewMenuOpen(true);
    };
    window.addEventListener('ddrive:new', handler as any);
    return () => window.removeEventListener('ddrive:new', handler as any);
  }, []);

  // Helpers to trigger file/folder pickers
  const triggerFileInput = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    inp.multiple = true;
    inp.style.display = 'none';
    inp.onchange = (e) => {
      const target = e.target as HTMLInputElement | null;
      if (target?.files) {
        Array.from(target.files).forEach((file) => {
          uploadMutation.mutate({ file, parentId: folderId || null });
        });
      }
      setTimeout(() => { if (inp.parentNode) inp.parentNode.removeChild(inp); }, 0);
    };
    document.body.appendChild(inp);
    inp.click();
  };

  const triggerFolderInput = () => {
    const inp = document.createElement('input');
    inp.type = 'file';
    // @ts-ignore
    inp.webkitdirectory = true;
    inp.multiple = true;
    inp.style.display = 'none';
    inp.onchange = async (e: any) => {
      const fileList: FileList | null = e.target?.files || null;
      if (!fileList) return;

      // Build a map of folder paths -> files
      const files = Array.from(fileList) as File[] & { webkitRelativePath?: string }[];

      // Helper: ensure a path of directories exists under a given parentId.
      // Check for an existing directory before attempting to create it so we
      // don't rely on catching 409s and to avoid extra errors.
      const ensureFolderPath = async (baseParentId: string | null, relPath: string) => {
        if (!relPath) return baseParentId;
        const segments = relPath.split('/').filter(Boolean);
        let currentParent = baseParentId || null;
        for (const seg of segments) {
          try {
            // List children under currentParent to look for an existing folder
            const listResp = currentParent ? await api.get(`/files?parentId=${currentParent}`) : await api.get('/files');
            const existing = (listResp.data || []).find((f: any) => f.name === seg && f.type === 'DIRECTORY');
            if (existing) {
              currentParent = existing.id;
              continue;
            }
          } catch (e) {
            // Listing failed; fall through and try to create the folder
          }

          const resp = await api.post('/files/directory', { name: seg, parentId: currentParent });
          currentParent = resp.data.id;
        }
        return currentParent;
      };

      // Filter out typical OS metadata files (e.g. .DS_Store) and empty entries.
      const filtered = files.filter((f) => {
        const name = (f as any).name || '';
        if (!name) return false;
        // skip dotfiles
        if (name.startsWith('.')) return false;
        return true;
      });

      // Create a server-side base folder for this upload. The server will
      // auto-number if a sibling with the same name exists. After creating
      // the base folder we'll create nested folders under it for each file's
      // relative path.
      const firstRel = (filtered[0] as any)?.webkitRelativePath || '';
      const baseFolderNameRequested = firstRel ? firstRel.split('/')[0] : '';
      const totalBytes = filtered.reduce((s, it) => s + (it.size || 0), 0);

      let baseFolderId: string | null = folderId || null;
      let actualBaseName = baseFolderNameRequested || 'Root';
      let baseFolderKey = actualBaseName;
      if (baseFolderNameRequested) {
        try {
          const resp = await api.post('/files/directory', { name: baseFolderNameRequested, parentId: folderId || null });
          baseFolderId = resp.data.id;
          actualBaseName = resp.data.name || baseFolderNameRequested;
          baseFolderKey = actualBaseName;
        } catch (e) {
          // If create failed, fall back to parent and proceed (uploads will go into parent)
          baseFolderId = folderId || null;
          baseFolderKey = baseFolderNameRequested || 'root';
        }
      }

      // initialize single folder progress entry for the whole selection
      setUploadFolders(prev => {
        if (prev.find(p => p.folderKey === baseFolderKey)) return prev;
        return [...prev, { folderKey: baseFolderKey, folderName: actualBaseName || baseFolderKey || 'Root', uploadedBytes: 0, totalBytes, progress: 0, status: 'uploading' }];
      });
      // no folder-level toast; upload is visible in the upload panel

      // Remove any existing per-file progress entries matching files in this selection
      const selectedNames = new Set(filtered.map(f => (f as any).webkitRelativePath || f.name));
      setUploadProgress(prev => prev.filter(p => !selectedNames.has(p.fileName)));

      // initialize refs to avoid multiple toasts and to track previous progress
      folderPrevProgressRef.current[baseFolderKey] = 0;
      folderErrorShownRef.current[baseFolderKey] = false;
      folderSuccessShownRef.current[baseFolderKey] = false;
      // track expected file count for this folder so we only finalize when
      // all file uploads have finished (success or error)
      folderFilesRemainingRef.current[baseFolderKey] = filtered.length;

      // For each file, create necessary nested folders under the newly created
      // base folder then upload the file there.
      for (const f of filtered) {
        const rel = (f as any).webkitRelativePath || f.name;
        const parts = rel.split('/');
        const nestedParts = parts.length > 1 ? parts.slice(1, -1) : [];
        const nestedPath = nestedParts.join('/');
        try {
          const targetParent = nestedPath ? await ensureFolderPath(baseFolderId, nestedPath) : baseFolderId;
          uploadMutation.mutate({ file: f as File, parentId: targetParent || null, folderKey: baseFolderKey, fileKey: rel });
        } catch (err) {
          console.error('Folder upload child error:', err);
          if (!folderErrorShownRef.current[baseFolderKey]) {
            folderErrorShownRef.current[baseFolderKey] = true;
            toast.error('Failed to upload some folder contents');
          }
        }
      }

      setTimeout(() => { if (inp.parentNode) inp.parentNode.removeChild(inp); }, 0);
    };
    document.body.appendChild(inp);
    inp.click();
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
    // Position menu at cursor. Use anchorPosition instead of anchorEl so the
    // menu appears under the mouse pointer rather than a fixed element.
    const clientX = e.clientX;
    const clientY = e.clientY;
    // Simple edge avoidance: only shift if the menu would overflow the viewport.
    // Shift just enough so the menu fits, don't move it unnecessarily.
    const approxMenuWidth = 240;
    const approxMenuHeight = 220;
    const margin = 8; // keep a small margin from edges
    const maxLeft = Math.max(margin, window.innerWidth - approxMenuWidth - margin);
    const maxTop = Math.max(margin, window.innerHeight - approxMenuHeight - margin);
    const left = Math.min(clientX, maxLeft);
    const top = Math.min(clientY, maxTop);
    setMenuAnchor(null);
    setMenuPosition({ top, left });
  };

  const handleCloseMenu = () => {
    setMenuAnchor(null);
    setMenuPosition(null);
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
        // Open move dialog starting at root
        setTargetFolderId('');
        setMoveDialogOpen(true);
        break;
      case 'delete':
        (async () => {
          try {
            if (menuFile.type === 'DIRECTORY') {
              // Check whether the folder has children before deleting and prompt once
              const resp = await api.get(`/files?parentId=${menuFile.id}`);
              const children = resp.data as FileItem[];
              if (children && children.length > 0) {
                if (!window.confirm(
                  `"${menuFile.name}" is not empty and contains ${children.length} item${children.length > 1 ? 's' : ''}. Deleting it will permanently remove all contents. Continue?`
                )) return;
                await performRecursiveDelete(menuFile);
                return;
              }

              // empty directory: single confirm, then delete non-recursively
              if (!window.confirm(`Are you sure you want to delete ${menuFile.name}?`)) return;
              deleteMutation.mutate({ id: menuFile.id, recursive: false });
            } else {
              if (!window.confirm(`Are you sure you want to delete ${menuFile.name}?`)) return;
              deleteMutation.mutate({ id: menuFile.id, recursive: false });
            }
          } catch (err) {
            toast.error('Failed to verify folder contents');
          }
        })();
        break;
      case 'download':
        if (menuFile.type === 'FILE') {
          handleDownload(menuFile);
        }
        break;
      case 'copy':
        // create a copy of the file (respect user's encrypt setting)
        copyMutation.mutate({ id: menuFile.id, encrypt: encryptFiles });
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
    // Clear any position-based anchor when opening via button
    setMenuPosition(null);
    setMenuAnchor(target);
    setMenuFile(file);
  };
  

  const handleFolderClick = (file: FileItem) => {
    if (file.type === 'DIRECTORY') {
      navigate(`/drive/${file.id}`);
    }
  };

  // Build folder tree map for Move dialog
  const folderChildrenMap = useMemo(() => {
    const map: Record<string, FileItem[]> = {};
    (allFolders || []).forEach((f) => {
      const parent = f.parentId || '';
      if (!map[parent]) map[parent] = [];
      map[parent].push(f);
    });
    // sort children by name
    Object.keys(map).forEach((k) => map[k].sort((a, b) => a.name.localeCompare(b.name)));
    return map;
  }, [allFolders]);

  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({});

  const toggleExpand = (id: string) => {
    setExpandedFolders((prev) => ({ ...prev, [id]: !prev[id] }));
  };

  const renderFolderNode = (folder: FileItem, level = 0) => {
    const children = folderChildrenMap[folder.id] || [];
    const isExpanded = !!expandedFolders[folder.id];
    const isSelectedTarget = targetFolderId === folder.id;
    const isCurrentLocation = selectedFile?.parentId === folder.id;

    return (
      <Box key={folder.id} sx={{ pl: level * 2, display: 'flex', alignItems: 'center', py: 0.5 }}>
        {children.length > 0 ? (
          <IconButton size="small" onClick={() => toggleExpand(folder.id)}>
            {isExpanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
          </IconButton>
        ) : (
          <Box sx={{ width: 32 }} />
        )}
        <Button
          size="small"
          onClick={() => setTargetFolderId(folder.id)}
          sx={{
            textTransform: 'none',
            justifyContent: 'flex-start',
            color: isSelectedTarget ? 'primary.main' : 'text.primary',
            fontWeight: isCurrentLocation ? 700 : 400,
            width: '100%',
          }}
        >
          📁 {folder.name}
        </Button>
        {/* Render children */}
        {isExpanded && (
          <Box sx={{ width: '100%' }}>
            {children.map((c) => renderFolderNode(c, level + 1))}
          </Box>
        )}
      </Box>
    );
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

      {/* Breadcrumb Navigation - always show (Home at root) */}
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
            {breadcrumbs.map((crumb, idx) => {
              const isLast = idx === breadcrumbs.length - 1;
              if (isLast) {
                return (
                  <Typography key={crumb.id} sx={{ display: 'flex', alignItems: 'center', gap: 0.5 }}>
                    <Folder size={18} />
                    {crumb.name}
                  </Typography>
                );
              }

              return (
                <Link
                  component="button"
                  key={crumb.id}
                  variant="body2"
                  onClick={() => navigate(`/drive/${crumb.id}`)}
                  sx={{ display: 'flex', alignItems: 'center', gap: 0.5, textDecoration: 'none', color: 'text.primary', '&:hover': { textDecoration: 'underline' } }}
                >
                  <Folder size={18} />
                  <Typography>{crumb.name}</Typography>
                </Link>
              );
            })}
          </Breadcrumbs>
        </CardContent>
      </Card>

      {/* +New menu (triggered from Layout sidebar) */}
      <Menu
        open={newMenuOpen}
        onClose={() => setNewMenuOpen(false)}
        anchorReference="anchorPosition"
        anchorPosition={newMenuPos ? { top: newMenuPos.top, left: newMenuPos.left } : undefined}
      >
        <MenuItem onClick={() => { setNewFolderOpen(true); setNewMenuOpen(false); }}>
          <ListItemIcon>
            <FolderPlus size={16} />
          </ListItemIcon>
          <ListItemText>New Folder</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { triggerFileInput(); setNewMenuOpen(false); }}>
          <ListItemIcon>
            <Upload size={16} />
          </ListItemIcon>
          <ListItemText>Upload File</ListItemText>
        </MenuItem>
        <MenuItem onClick={() => { triggerFolderInput(); setNewMenuOpen(false); }}>
          <ListItemIcon>
            <Folder size={16} />
          </ListItemIcon>
          <ListItemText>Upload Folder</ListItemText>
        </MenuItem>
      </Menu>

      {/* top action buttons removed — New/+ menu available in left sidebar */}

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
          {selectedIds.length > 0 && (
            <Box sx={{ display: 'flex', gap: 1, p: 1, alignItems: 'center' }}>
              <Button variant="outlined" size="small" onClick={handleBulkCopy} disabled={bulkProcessing}>Copy ({selectedIds.length})</Button>
              <Button variant="outlined" size="small" onClick={handleOpenBulkMove} disabled={bulkProcessing}>Move ({selectedIds.length})</Button>
              <Button variant="contained" color="error" size="small" onClick={handleBulkDelete} disabled={bulkProcessing}>Delete ({selectedIds.length})</Button>
            </Box>
          )}
          <TableContainer>
            <Table>
              <TableHead>
                <TableRow sx={{ bgcolor: '#fafbfc' }}>
                  <TableCell sx={{ width: 48 }}>
                    <Checkbox
                      size="small"
                      checked={files && files.length > 0 && selectedIds.length === files.length}
                      indeterminate={selectedIds.length > 0 && files && selectedIds.length < files.length}
                      onChange={(e) => {
                        if (e.target.checked && files) setSelectedIds(files.map(f => f.id)); else setSelectedIds([]);
                      }}
                    />
                  </TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Name</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Created</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Modified</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Size</TableCell>
                  <TableCell sx={{ fontWeight: 600 }}>Path</TableCell>
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
                    <TableCell sx={{ width: 48 }} onClick={(e) => e.stopPropagation()}>
                      <Checkbox
                        size="small"
                        checked={selectedIds.includes(file.id)}
                        onChange={(e) => {
                          e.stopPropagation();
                          setSelectedIds(prev => e.target.checked ? [...prev, file.id] : prev.filter(id => id !== file.id));
                        }}
                      />
                    </TableCell>
                    <TableCell onClick={() => { if (file.type === 'DIRECTORY') handleFolderClick(file); else if (file.type === 'FILE' && (isImageFile(file) || isVideoFile(file))) openImageViewer(file); }}>
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
                        {new Date(file.createdAt).toLocaleString()}
                      </Typography>
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
                    <TableCell>
                      <Typography variant="body2" color="text.secondary" sx={{ maxWidth: 300, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {file.path || `/${file.name}`}
                      </Typography>
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
        anchorReference={menuPosition ? 'anchorPosition' : 'anchorEl'}
        anchorPosition={menuPosition ? { top: menuPosition.top, left: menuPosition.left } : undefined}
        open={Boolean(menuAnchor) || Boolean(menuPosition)}
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
        <MenuItem onClick={() => handleMenuAction('copy')}>
          <ListItemIcon>
            <Copy size={18} />
          </ListItemIcon>
          <ListItemText>Make a copy</ListItemText>
        </MenuItem>
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

      {/* Image Viewer Dialog */}
      <Dialog fullWidth maxWidth="xl" open={imageViewerOpen} onClose={closeImageViewer}>
        <Box tabIndex={0} onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') showPrevImage();
          if (e.key === 'ArrowRight') showNextImage();
          if (e.key === 'Escape') closeImageViewer();
        }} sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: 480 }}>
          <IconButton onClick={showPrevImage} disabled={imageViewerIndex <= 0} sx={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)' }}>
            <ChevronLeft />
          </IconButton>
          <Box sx={{ maxWidth: '90%', maxHeight: '80%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            {imageList[imageViewerIndex] ? (
              imageLoading ? (
                <CircularProgress />
              ) : imageError ? (
                <Typography color="error">{imageError}</Typography>
              ) : isTextFile(imageList[imageViewerIndex]) ? (
                textContent !== null ? (
                  <Box sx={{ width: '100%', maxHeight: '80%', overflow: 'auto', bgcolor: '#fff', p: 2, borderRadius: 1 }}>
                    <pre style={{ whiteSpace: 'pre-wrap', wordBreak: 'break-word', margin: 0 }}>{textContent}</pre>
                  </Box>
                ) : null
              ) : imageBlobUrl ? (
                (imageList[imageViewerIndex].mimeType && imageList[imageViewerIndex].mimeType.startsWith('video/')) || isVideoFile(imageList[imageViewerIndex]) ? (
                  <video
                    src={imageBlobUrl}
                    controls
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  />
                ) : (
                  <img
                    src={imageBlobUrl}
                    alt={imageList[imageViewerIndex].name}
                    style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
                  />
                )
              ) : null
            ) : null}
          </Box>
          <IconButton onClick={showNextImage} disabled={imageViewerIndex >= imageList.length - 1} sx={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)' }}>
            <ChevronRight />
          </IconButton>
          <IconButton onClick={closeImageViewer} sx={{ position: 'absolute', right: 8, top: 8 }}>
            <X />
          </IconButton>
        </Box>
      </Dialog>

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
                if (moveDialogOpen) {
                  createFolderInDialog.mutate({ name: folderName, parentId: targetFolderId || null });
                } else {
                  createFolderMutation.mutate(folderName);
                }
              }
            }}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setNewFolderOpen(false)}>Cancel</Button>
          <Button
            onClick={() => {
              if (moveDialogOpen) {
                createFolderInDialog.mutate({ name: folderName, parentId: targetFolderId || null });
              } else {
                createFolderMutation.mutate(folderName);
              }
            }}
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
          <Box sx={{ mt: 1 }}>
            <Typography variant="body2" sx={{ mb: 1 }}>Select destination folder (My Drive):</Typography>

            {/* Root option */}
            <Box sx={{ display: 'flex', alignItems: 'center', mb: 1 }}>
              <Box sx={{ pl: 0, width: '100%' }}>
                <Button
                  size="small"
                  onClick={() => setTargetFolderId('')}
                  sx={{ textTransform: 'none', justifyContent: 'flex-start', color: targetFolderId === '' ? 'primary.main' : 'text.primary', fontWeight: selectedFile?.parentId ? 400 : 700, width: '100%' }}
                >
                  🏠 My Drive (Root)
                </Button>
              </Box>
            </Box>

            {/* Folder tree */}
            <Box sx={{ maxHeight: 320, overflow: 'auto', border: '1px solid', borderColor: 'divider', borderRadius: 1, p: 1 }}>
              {(folderChildrenMap[''] || []).map((f) => renderFolderNode(f, 0))}
              { (folderChildrenMap[''] || []).length === 0 && (
                <Typography variant="body2" color="text.secondary">No folders</Typography>
              )}
            </Box>

            <Box sx={{ mt: 2, display: 'flex', gap: 1, alignItems: 'center' }}>
              <Button onClick={() => setNewFolderOpen(true)} size="small">New folder</Button>
              <TextField
                placeholder="Search folders"
                size="small"
                sx={{ flex: 1 }}
                onChange={() => { /* no-op for now */ }}
              />
            </Box>
          </Box>
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

      {/* Upload Progress (folder-aggregated when available, else per-file) */}
      {(uploadFolders.length > 0 || uploadProgress.length > 0) && (
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
            Uploads
          </Typography>
          {uploadFolders.length > 0 ? (
            uploadFolders.map((f) => (
              <Box key={f.folderKey} sx={{ mb: 1 }}>
                <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                  <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                    {f.folderName || f.folderKey}
                  </Typography>
                  <Typography variant="body2" color={
                    f.status === 'success' ? 'success.main' :
                    f.status === 'error' ? 'error.main' : 'text.secondary'
                  }>
                    {f.status === 'success' ? '✓' : f.status === 'error' ? '✗' : (f.progress === 100 ? 'Processing' : `${f.progress}%`)}
                  </Typography>
                </Box>
                <LinearProgress
                  variant="determinate"
                  value={f.progress}
                  color={
                    f.status === 'success' ? 'success' :
                    f.status === 'error' ? 'error' : 'primary'
                  }
                />
              </Box>
            ))
          ) : (
            uploadProgress.map((item) => (
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
                     (item.progress === 100 ? 'Processing' : `${item.progress}%`)}
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
            ))
          )}
        </Paper>
      )}
      {/* Bulk action progress (matches Uploads panel styling) */}
      {bulkProgress && (
        <Paper
          sx={{
            position: 'fixed',
            bottom: 16,
            right: 16,
            width: 350,
            p: 2,
            zIndex: 1003,
          }}
          elevation={6}
        >
          <Typography variant="subtitle2" gutterBottom>
            {bulkProgress.action === 'copy' ? 'Copying' : bulkProgress.action === 'move' ? 'Moving' : 'Deleting'}
          </Typography>
          <Box sx={{ mb: 1 }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
              <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                {bulkProgress.currentName || `${bulkProgress.completed}/${bulkProgress.total}`}
              </Typography>
              <Typography variant="body2" color={bulkProgress.failed > 0 ? 'error.main' : 'text.secondary'}>
                {bulkProgress.failed > 0 ? `${bulkProgress.failed} failed` : (bulkProgress.completed === bulkProgress.total ? '✓' : `${Math.round((bulkProgress.completed / Math.max(1, bulkProgress.total)) * 100)}%`)}
              </Typography>
            </Box>
            <LinearProgress
              variant="determinate"
              value={Math.round((bulkProgress.completed / Math.max(1, bulkProgress.total)) * 100)}
              color={bulkProgress.failed > 0 ? 'error' : 'primary'}
            />
          </Box>
        </Paper>
      )}
      {/* Delete Progress Panel */}
      {deleteProgress.length > 0 && (
        <Paper
          sx={{
            position: 'fixed',
            bottom: 16,
            right: 16,
            width: 350,
            p: 2,
            zIndex: 1001,
          }}
          elevation={6}
        >
          <Typography variant="subtitle2" gutterBottom>
            Deleting
          </Typography>
          {deleteProgress.map((item) => (
            <Box key={item.id || item.fileName} sx={{ mb: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                  {item.fileName}
                </Typography>
                <Typography variant="body2" color={
                  item.status === 'success' ? 'success.main' :
                  item.status === 'error' ? 'error.main' : 'text.secondary'
                }>
                  {item.status === 'success' ? '✓' : item.status === 'error' ? '✗' : `${item.progress}%`}
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
      {/* Copy Progress Panel */}
      {copyProgress.length > 0 && (
        <Paper
          sx={{
            position: 'fixed',
            bottom: 16,
            right: 16,
            width: 350,
            p: 2,
            zIndex: 1001,
          }}
          elevation={6}
        >
          <Typography variant="subtitle2" gutterBottom>
            Copying
          </Typography>
          {copyProgress.map((item) => (
            <Box key={item.id || item.fileName} sx={{ mb: 1 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="body2" noWrap sx={{ maxWidth: 200 }}>
                  {item.fileName}
                </Typography>
                <Typography variant="body2" color={
                  item.status === 'success' ? 'success.main' :
                  item.status === 'error' ? 'error.main' : 'text.secondary'
                }>
                  {item.status === 'success' ? '✓' : item.status === 'error' ? '✗' : (item.progress === 100 ? 'Processing' : `${item.progress}%`)}
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
      <FolderSelectDialog open={bulkMoveOpen} value={null} onClose={() => setBulkMoveOpen(false)} onSelect={(id) => handleBulkMoveSelect(id)} title="Move selected items" />
      
    </Box>
  );
}
