import { useQuery } from '@tanstack/react-query';
import {
  Box,
  Typography,
  Paper,
  Grid,
  Card,
  CardContent,
  CircularProgress,
  Chip,
} from '@mui/material';
import { HardDrive, Upload, Download, File, Folder, Clock, Activity } from 'lucide-react';
import api from '../lib/api';

interface MetricsData {
  totalFiles: number;
  totalFolders: number;
  totalSize: number;
  encryptedFiles: number;
  starredFiles: number;
  totalShares: number;
  totalTasks: number;
  activeTasks: number;
  recycleBinItems: number;
  lastUploadDate: string | null;
  costSavingsPerMonth: number;
  averageFileSize: number;
  globalUsers: number;
  globalFiles: number;
  globalTotalSize: number;
  globalTasks: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export default function MetricsPage() {
  const { data: metrics, isLoading } = useQuery<MetricsData>({
    queryKey: ['metrics'],
    queryFn: async () => {
      const response = await api.get('/metrics');
      return response.data;
    },
  });

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  const metricCards = [
    {
      title: 'Total Storage',
      value: metrics ? formatBytes(metrics.totalSize) : '0 B',
      icon: <HardDrive size={32} />,
      color: '#3b82f6',
    },
    {
      title: 'Total Files',
      value: metrics?.totalFiles.toLocaleString() || '0',
      icon: <File size={32} />,
      color: '#8b5cf6',
    },
    {
      title: 'Total Folders',
      value: metrics?.totalFolders.toLocaleString() || '0',
      icon: <Folder size={32} />,
      color: '#f59e0b',
    },
    {
      title: 'Encrypted Files',
      value: metrics?.encryptedFiles.toLocaleString() || '0',
      icon: <Activity size={32} />,
      color: '#10b981',
    },
    {
      title: 'Starred Items',
      value: metrics?.starredFiles.toLocaleString() || '0',
      icon: <Activity size={32} />,
      color: '#eab308',
    },
    {
      title: 'Shared Items',
      value: metrics?.totalShares.toLocaleString() || '0',
      icon: <Upload size={32} />,
      color: '#06b6d4',
    },
    {
      title: 'Active Tasks',
      value: `${metrics?.activeTasks || 0} / ${metrics?.totalTasks || 0}`,
      icon: <Clock size={32} />,
      color: '#ec4899',
    },
    {
      title: 'Recycle Bin',
      value: metrics?.recycleBinItems.toLocaleString() || '0',
      icon: <Download size={32} />,
      color: '#ef4444',
    },
  ];

  const statCards = [
    {
      label: 'Cost Savings/Month',
      value: `$${metrics?.costSavingsPerMonth.toFixed(2) || '0.00'}`,
    },
    {
      label: 'Average File Size',
      value: metrics ? formatBytes(metrics.averageFileSize) : '0 B',
    },
    {
      label: 'Last Upload',
      value: metrics?.lastUploadDate 
        ? new Date(metrics.lastUploadDate).toLocaleString()
        : 'Never',
    },
  ];

  return (
    <Box>
      <Paper sx={{ p: 3, minHeight: 'calc(100vh - 140px)' }}>
        <Typography variant="h4" gutterBottom sx={{ mb: 3 }}>
          Metrics
        </Typography>

        <Grid container spacing={3}>
          {metricCards.map((card, index) => (
            <Grid item xs={12} sm={6} md={3} key={index}>
              <Card
                sx={{
                  height: '100%',
                  background: `linear-gradient(135deg, ${card.color}15 0%, ${card.color}05 100%)`,
                  border: `1px solid ${card.color}30`,
                }}
              >
                <CardContent>
                  <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', mb: 2 }}>
                    <Box>
                      <Typography variant="body2" color="text.secondary" gutterBottom>
                        {card.title}
                      </Typography>
                      <Typography variant="h4" sx={{ fontWeight: 600 }}>
                        {card.value}
                      </Typography>
                    </Box>
                    <Box sx={{ color: card.color, opacity: 0.8 }}>
                      {card.icon}
                    </Box>
                  </Box>
                </CardContent>
              </Card>
            </Grid>
          ))}
        </Grid>

        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
            Statistics
          </Typography>
          <Grid container spacing={2}>
            {statCards.map((stat, index) => (
              <Grid item xs={12} sm={4} key={index}>
                <Card variant="outlined">
                  <CardContent>
                    <Typography variant="body2" color="text.secondary" gutterBottom>
                      {stat.label}
                    </Typography>
                    <Typography variant="h6">
                      {stat.value}
                    </Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>
        </Box>

        <Box sx={{ mt: 4 }}>
          <Typography variant="h6" gutterBottom sx={{ mb: 2 }}>
            System Info (Global)
          </Typography>
          <Card variant="outlined">
            <CardContent>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                <Chip label={`Version: 2.1.0`} variant="outlined" />
                <Chip 
                  label={`Total Users: ${metrics?.globalUsers.toLocaleString() || 0}`}
                  variant="outlined" 
                />
                <Chip 
                  label={`Total Files: ${metrics?.globalFiles.toLocaleString() || 0}`}
                  variant="outlined" 
                />
                <Chip 
                  label={`Total Storage: ${metrics ? formatBytes(metrics.globalTotalSize) : '0 B'}`}
                  variant="outlined" 
                />
                <Chip 
                  label={`Total Tasks: ${metrics?.globalTasks.toLocaleString() || 0}`}
                  variant="outlined" 
                />
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Paper>
    </Box>
  );
}
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Paper>
    </Box>
  );
}
