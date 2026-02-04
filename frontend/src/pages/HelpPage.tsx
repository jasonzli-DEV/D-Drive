import {
  Box,
  Typography,
  Paper,
  Accordion,
  AccordionSummary,
  AccordionDetails,
  Card,
  CardContent,
  Chip,
  Link,
} from '@mui/material';
import { ChevronDown, HelpCircle, Book, Github, MessageCircle } from 'lucide-react';

export default function HelpPage() {
  const faqs = [
    {
      question: 'What is D-Drive?',
      answer: 'D-Drive is a Discord-based cloud storage solution that allows you to store and manage files using Discord as the backend storage. It provides encryption, file sharing, automated backups via SFTP tasks, and more.',
    },
    {
      question: 'How does encryption work?',
      answer: 'D-Drive uses AES-256-GCM encryption for your files. When encryption is enabled, files are encrypted before being uploaded to Discord and decrypted when downloaded. Your encryption key is derived from your Discord account and stored securely.',
    },
    {
      question: 'What are Tasks?',
      answer: 'Tasks are automated SFTP backup jobs that run on a schedule (using cron expressions). You can configure tasks to pull files from remote servers, compress them, and store them in your D-Drive. Tasks support exclusion patterns, encryption, and various compression formats.',
    },
    {
      question: 'How do I share files?',
      answer: 'Navigate to a file or folder, right-click and select "Share". You can grant VIEW (read-only) or EDIT (full access) permissions. Shared files appear in the "Shared" tab for recipients.',
    },
    {
      question: 'What is the Recycle Bin?',
      answer: 'The Recycle Bin stores deleted files for 30 days before permanent deletion. You can restore or permanently delete items from the recycle bin. When you delete a parent folder, all children are grouped together with a single restore/delete action.',
    },
    {
      question: 'How do I configure task scanning?',
      answer: 'In task settings, you can enable "Skip Pre-scan" to skip the scanning phase for faster execution. When scanning is disabled, you can optionally enable "Cache Scan Size" to save and display the last known scan size from when scanning was enabled.',
    },
    {
      question: 'What file types can I preview?',
      answer: 'D-Drive supports previewing images (JPG, PNG, GIF, WebP), videos (MP4, WebM, MOV), and PDF documents directly in the browser.',
    },
    {
      question: 'How do I use the CLI?',
      answer: 'The D-Drive CLI is available in the /cli directory. Configure it with your API key and server URL, then use commands like "upload", "download", "list", "copy", and "delete" to manage files from the command line.',
    },
  ];

  const shortcuts = [
    { key: 'Esc', action: 'Close dialogs/modals' },
    { key: '← →', action: 'Navigate file preview' },
    { key: 'Right-click', action: 'Open context menu' },
  ];

  return (
    <Paper sx={{ p: 3, minHeight: 'calc(100vh - 140px)' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', gap: 2, mb: 3 }}>
        <HelpCircle size={32} />
        <Typography variant="h4">Help & Documentation</Typography>
      </Box>

        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
            <Book size={20} />
            Quick Links
          </Typography>
          <Card variant="outlined" sx={{ mt: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Box>
                  <Link 
                    href="https://github.com/jasonzli-DEV/D-Drive" 
                    target="_blank" 
                    sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                  >
                    <Github size={18} />
                    GitHub Repository
                  </Link>
                </Box>
                <Box>
                  <Link 
                    href="https://github.com/jasonzli-DEV/D-Drive/blob/main/README.md" 
                    target="_blank"
                    sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                  >
                    <Book size={18} />
                    README Documentation
                  </Link>
                </Box>
                <Box>
                  <Link 
                    href="https://github.com/jasonzli-DEV/D-Drive/blob/main/docs/API.md" 
                    target="_blank"
                    sx={{ display: 'flex', alignItems: 'center', gap: 1 }}
                  >
                    <MessageCircle size={18} />
                    API Documentation
                  </Link>
                </Box>
              </Box>
            </CardContent>
          </Card>
        </Box>

        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            Frequently Asked Questions
          </Typography>
          <Box sx={{ mt: 2 }}>
            {faqs.map((faq, index) => (
              <Accordion key={index}>
                <AccordionSummary expandIcon={<ChevronDown />}>
                  <Typography>{faq.question}</Typography>
                </AccordionSummary>
                <AccordionDetails>
                  <Typography color="text.secondary">{faq.answer}</Typography>
                </AccordionDetails>
              </Accordion>
            ))}
          </Box>
        </Box>

        <Box sx={{ mb: 4 }}>
          <Typography variant="h6" gutterBottom>
            Keyboard Shortcuts
          </Typography>
          <Card variant="outlined" sx={{ mt: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', flexDirection: 'column', gap: 1.5 }}>
                {shortcuts.map((shortcut, index) => (
                  <Box key={index} sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <Typography variant="body2" color="text.secondary">
                      {shortcut.action}
                    </Typography>
                    <Chip label={shortcut.key} size="small" variant="outlined" />
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>
        </Box>

        <Box>
          <Typography variant="h6" gutterBottom>
            Version Information
          </Typography>
          <Card variant="outlined" sx={{ mt: 2 }}>
            <CardContent>
              <Box sx={{ display: 'flex', flexWrap: 'wrap', gap: 1 }}>
                <Chip label="Version 2.1.0" color="primary" />
                <Chip label="Build: Production" variant="outlined" />
                <Chip label="License: MIT" variant="outlined" />
              </Box>
            </CardContent>
          </Card>
        </Box>
      </Paper>
  );
}