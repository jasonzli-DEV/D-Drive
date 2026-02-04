import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import {
  Box,
  Button,
  Typography,
  Paper,
  CircularProgress,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  Breadcrumbs,
  Link,
  IconButton,
  Dialog,
  DialogContent,
  useTheme,
  Chip,
} from '@mui/material';
import {
  Download,
  Folder,
  File,
  FileText,
  Play,
  Image as ImageIcon,
  ChevronRight,
  X,
  ChevronLeft,
  Eye,
} from 'lucide-react';
import { formatDistance } from 'date-fns';
import toast from 'react-hot-toast';
import api from '../lib/api';

interface PublicFile {
  id: string;
  name: string;
  type: 'FILE' | 'DIRECTORY';
  size: number;
  mimeType?: string;
  createdAt: string;
  updatedAt: string;
}

interface PublicLinkData {
  slug: string;
  file: PublicFile;
  expiresAt: string | null;
  createdAt: string;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

export default function PublicLinkPage() {
  const theme = useTheme();
  const { slug } = useParams<{ slug: string }>();
  
  const [loading, setLoading] = useState(true);
  const [linkData, setLinkData] = useState<PublicLinkData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [files, setFiles] = useState<PublicFile[]>([]);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [breadcrumbs, setBreadcrumbs] = useState<{ id: string; name: string }[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewFile, setPreviewFile] = useState<PublicFile | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [imageList, setImageList] = useState<PublicFile[]>([]);
  const [currentImageIndex, setCurrentImageIndex] = useState(0);

  useEffect(() => {
    loadLinkData();
  }, [slug]);

  useEffect(() => {
    if (linkData && linkData.file.type === 'DIRECTORY') {
      loadFolderContents(currentFolderId || linkData.file.id);
    }
  }, [linkData, currentFolderId]);

  const loadLinkData = async () => {
    try {
      setLoading(true);
      setError(null);
      const response = await api.get(`/link/${slug}`);
      setLinkData(response.data);
      
      if (response.data.file.type === 'DIRECTORY') {
        setBreadcrumbs([{ id: response.data.file.id, name: response.data.file.name }]);
      }
    } catch (err: any) {
      const message = err.response?.data?.error || 'Failed to load public link';
      setError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const loadFolderContents = async (folderId: string) => {
    try {
      const response = await api.get(`/link/${slug}/folder`, {
        params: { folderId },
      });
      setFiles(response.data);
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to load folder contents');
    }
  };

  const handleDownload = async (file: PublicFile) => {
    try {
      let downloadUrl: string;
      
      if (linkData?.file.type === 'DIRECTORY') {
        downloadUrl = `/api/link/${slug}/file/${file.id}/download`;
      } else {
        downloadUrl = `/api/link/${slug}/download`;
      }

      const response = await api.get(downloadUrl, {
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
      toast.success('Download started');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to download file');
    }
  };

  const navigateToFolder = (file: PublicFile) => {
    if (file.type !== 'DIRECTORY') return;
    
    setCurrentFolderId(file.id);
    setBreadcrumbs(prev => [...prev, { id: file.id, name: file.name }]);
  };

  const navigateToBreadcrumb = (index: number) => {
    if (!linkData) return;
    
    const newBreadcrumbs = breadcrumbs.slice(0, index + 1);
    setBreadcrumbs(newBreadcrumbs);
    const target = newBreadcrumbs[newBreadcrumbs.length - 1];
    setCurrentFolderId(target.id === linkData.file.id ? null : target.id);
  };

  const isImageFile = (file: PublicFile) => {
    if (file.mimeType?.startsWith('image/')) return true;
    const ext = file.name.split('.').pop()?.toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'bmp', 'svg'].includes(ext || '');
  };

  const isVideoFile = (file: PublicFile) => {
    if (file.mimeType?.startsWith('video/')) return true;
    const ext = file.name.split('.').pop()?.toLowerCase();
    return ['mp4', 'webm', 'ogg', 'mov'].includes(ext || '');
  };

  const isPdfFile = (file: PublicFile) => {
    return file.mimeType === 'application/pdf' || file.name.endsWith('.pdf');
  };

  const canPreview = (file: PublicFile) => {
    return isImageFile(file) || isVideoFile(file) || isPdfFile(file);
  };

  const openPreview = async (file: PublicFile, fileList: PublicFile[]) => {
    if (!canPreview(file)) return;

    setPreviewFile(file);
    setPreviewOpen(true);
    setPreviewLoading(true);
    setPreviewUrl(null);

    const images = fileList.filter(isImageFile);
    setImageList(images);
    setCurrentImageIndex(images.findIndex(f => f.id === file.id));

    try {
      let downloadUrl: string;
      
      if (linkData?.file.type === 'DIRECTORY') {
        downloadUrl = `/api/link/${slug}/file/${file.id}/download`;
      } else {
        downloadUrl = `/api/link/${slug}/download`;
      }

      const response = await api.get(downloadUrl, {
        responseType: 'blob',
      });

      const url = window.URL.createObjectURL(response.data);
      setPreviewUrl(url);
    } catch (err: any) {
      toast.error('Failed to load preview');
      setPreviewOpen(false);
    } finally {
      setPreviewLoading(false);
    }
  };

  const closePreview = () => {
    setPreviewOpen(false);
    setPreviewFile(null);
    if (previewUrl) {
      window.URL.revokeObjectURL(previewUrl);
      setPreviewUrl(null);
    }
    setImageList([]);
    setCurrentImageIndex(0);
  };

  const showNextPreview = async () => {
    if (currentImageIndex >= imageList.length - 1) return;
    const nextFile = imageList[currentImageIndex + 1];
    if (previewUrl) window.URL.revokeObjectURL(previewUrl);
    await openPreview(nextFile, imageList);
  };

  const showPrevPreview = async () => {
    if (currentImageIndex <= 0) return;
    const prevFile = imageList[currentImageIndex - 1];
    if (previewUrl) window.URL.revokeObjectURL(previewUrl);
    await openPreview(prevFile, imageList);
  };

  if (loading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '100vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !linkData) {
    return (
      <Box sx={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '100vh', p: 3 }}>
        <Typography variant="h4" gutterBottom>
          {error === 'Link not found' ? '404 - Link Not Found' : 
           error === 'Link has expired' ? '410 - Link Expired' : 
           error === 'File no longer available' ? 'File No Longer Available' : 
           'Error Loading Link'}
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          {error || 'This link could not be loaded'}
        </Typography>
      </Box>
    );
  }

  const isFolder = linkData.file.type === 'DIRECTORY';

  return (
    <Box sx={{ minHeight: '100vh', bgcolor: 'background.default', p: 3 }}>
      <Paper sx={{ maxWidth: 1400, mx: 'auto', p: 3 }}>
        <Box sx={{ mb: 3 }}>
          <Typography variant="h4" gutterBottom>
            {linkData.file.name}
          </Typography>
          <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap', alignItems: 'center' }}>
            <Chip
              label={isFolder ? 'Folder' : 'File'}
              color={isFolder ? 'warning' : 'primary'}
              size="small"
            />
            {!isFolder && (
              <Typography variant="body2" color="text.secondary">
                {formatBytes(Number(linkData.file.size))}
              </Typography>
            )}
            {linkData.expiresAt && (
              <Chip
                label={`Expires ${formatDistance(new Date(linkData.expiresAt), new Date(), { addSuffix: true })}`}
                color="error"
                size="small"
              />
            )}
          </Box>
        </Box>

        {!isFolder ? (
          <Box sx={{ display: 'flex', gap: 2, mb: 3 }}>
            <Button
              variant="contained"
              startIcon={<Download size={18} />}
              onClick={() => handleDownload(linkData.file)}
            >
              Download
            </Button>
            {canPreview(linkData.file) && (
              <Button
                variant="outlined"
                startIcon={<Eye size={18} />}
                onClick={() => openPreview(linkData.file, [linkData.file])}
              >
                Preview
              </Button>
            )}
          </Box>
        ) : (
          <>
            <Breadcrumbs sx={{ mb: 2 }}>
              {breadcrumbs.map((crumb, index) => (
                <Link
                  key={crumb.id}
                  component="button"
                  variant="body2"
                  onClick={() => navigateToBreadcrumb(index)}
                  sx={{
                    textDecoration: 'none',
                    color: index === breadcrumbs.length - 1 ? 'primary.main' : 'text.primary',
                    fontWeight: index === breadcrumbs.length - 1 ? 600 : 400,
                    '&:hover': { textDecoration: 'underline' },
                  }}
                >
                  {crumb.name}
                </Link>
              ))}
            </Breadcrumbs>

            {files.length === 0 ? (
              <Box sx={{ textAlign: 'center', py: 8, color: 'text.secondary' }}>
                <Folder size={48} style={{ opacity: 0.5, marginBottom: 16 }} />
                <Typography>This folder is empty</Typography>
              </Box>
            ) : (
              <TableContainer>
                <Table>
                  <TableHead>
                    <TableRow>
                      <TableCell>Name</TableCell>
                      <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>Size</TableCell>
                      <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>Modified</TableCell>
                      <TableCell align="right">Actions</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {files.map((file) => (
                      <TableRow
                        key={file.id}
                        hover
                        sx={{ cursor: file.type === 'DIRECTORY' || canPreview(file) ? 'pointer' : 'default' }}
                        onClick={() => {
                          if (file.type === 'DIRECTORY') {
                            navigateToFolder(file);
                          } else if (canPreview(file)) {
                            openPreview(file, files);
                          }
                        }}
                      >
                        <TableCell>
                          <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                            {file.type === 'DIRECTORY' ? (
                              <Folder size={20} style={{ color: theme.palette.warning.main }} />
                            ) : isImageFile(file) ? (
                              <ImageIcon size={20} style={{ color: theme.palette.info.main }} />
                            ) : isVideoFile(file) ? (
                              <Play size={20} style={{ color: theme.palette.error.main }} />
                            ) : isPdfFile(file) ? (
                              <FileText size={20} style={{ color: theme.palette.warning.dark }} />
                            ) : (
                              <File size={20} style={{ color: theme.palette.primary.main }} />
                            )}
                            <Typography sx={{ wordBreak: 'break-word' }}>
                              {file.name}
                            </Typography>
                          </Box>
                        </TableCell>
                        <TableCell sx={{ display: { xs: 'none', sm: 'table-cell' } }}>
                          {file.type === 'FILE' ? formatBytes(Number(file.size)) : '-'}
                        </TableCell>
                        <TableCell sx={{ display: { xs: 'none', md: 'table-cell' } }}>
                          {formatDistance(new Date(file.updatedAt), new Date(), { addSuffix: true })}
                        </TableCell>
                        <TableCell align="right" onClick={(e) => e.stopPropagation()}>
                          {file.type === 'DIRECTORY' ? (
                            <IconButton onClick={() => navigateToFolder(file)} size="small">
                              <ChevronRight size={18} />
                            </IconButton>
                          ) : (
                            <>
                              {canPreview(file) && (
                                <IconButton onClick={() => openPreview(file, files)} size="small" sx={{ mr: 0.5 }}>
                                  <Eye size={18} />
                                </IconButton>
                              )}
                              <IconButton onClick={() => handleDownload(file)} size="small">
                                <Download size={18} />
                              </IconButton>
                            </>
                          )}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            )}
          </>
        )}
      </Paper>

      <Dialog fullWidth maxWidth="xl" open={previewOpen} onClose={closePreview}>
        <Box
          tabIndex={0}
          onKeyDown={(e) => {
            if (e.key === 'ArrowLeft') showPrevPreview();
            if (e.key === 'ArrowRight') showNextPreview();
            if (e.key === 'Escape') closePreview();
          }}
        >
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', p: 2, borderBottom: 1, borderColor: 'divider' }}>
            <Typography variant="h6" sx={{ flexGrow: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {previewFile?.name}
            </Typography>
            <Box sx={{ display: 'flex', gap: 1 }}>
              {imageList.length > 1 && (
                <Typography variant="body2" color="text.secondary" sx={{ display: 'flex', alignItems: 'center', mr: 2 }}>
                  {currentImageIndex + 1} / {imageList.length}
                </Typography>
              )}
              {previewFile && (
                <Button
                  size="small"
                  startIcon={<Download size={16} />}
                  onClick={() => previewFile && handleDownload(previewFile)}
                >
                  Download
                </Button>
              )}
              <IconButton onClick={closePreview} size="small">
                <X size={18} />
              </IconButton>
            </Box>
          </Box>
          <DialogContent sx={{ p: 0, bgcolor: 'black', display: 'flex', alignItems: 'center', justifyContent: 'center', minHeight: '70vh', position: 'relative' }}>
            {previewLoading ? (
              <CircularProgress />
            ) : previewUrl && previewFile ? (
              <>
                {isImageFile(previewFile) && (
                  <img src={previewUrl} alt={previewFile.name} style={{ maxWidth: '100%', maxHeight: '80vh', objectFit: 'contain' }} />
                )}
                {isVideoFile(previewFile) && (
                  <video src={previewUrl} controls style={{ maxWidth: '100%', maxHeight: '80vh' }} />
                )}
                {isPdfFile(previewFile) && (
                  <iframe src={previewUrl} style={{ width: '100%', height: '80vh', border: 'none' }} />
                )}
                
                {imageList.length > 1 && (
                  <>
                    <IconButton
                      onClick={showPrevPreview}
                      disabled={currentImageIndex === 0}
                      sx={{ position: 'absolute', left: 16, bgcolor: 'rgba(0,0,0,0.5)', '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' }, color: 'white' }}
                    >
                      <ChevronLeft />
                    </IconButton>
                    <IconButton
                      onClick={showNextPreview}
                      disabled={currentImageIndex === imageList.length - 1}
                      sx={{ position: 'absolute', right: 16, bgcolor: 'rgba(0,0,0,0.5)', '&:hover': { bgcolor: 'rgba(0,0,0,0.7)' }, color: 'white' }}
                    >
                      <ChevronRight />
                    </IconButton>
                  </>
                )}
              </>
            ) : null}
          </DialogContent>
        </Box>
      </Dialog>
    </Box>
  );
}
