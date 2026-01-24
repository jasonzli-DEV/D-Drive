import { describe, it, expect } from 'vitest';

// Test file type detection utilities
function getFileIcon(filename: string, isDirectory: boolean): string {
  if (isDirectory) return 'folder';
  
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  
  const iconMap: Record<string, string> = {
    // Images
    jpg: 'image', jpeg: 'image', png: 'image', gif: 'image', webp: 'image', svg: 'image', bmp: 'image',
    // Videos
    mp4: 'video', webm: 'video', mov: 'video', avi: 'video', mkv: 'video',
    // Audio
    mp3: 'audio', wav: 'audio', ogg: 'audio', flac: 'audio',
    // Documents
    pdf: 'pdf', doc: 'document', docx: 'document', txt: 'text',
    // Code
    js: 'code', ts: 'code', jsx: 'code', tsx: 'code', py: 'code', java: 'code',
    // Archives
    zip: 'archive', tar: 'archive', gz: 'archive', rar: 'archive', '7z': 'archive',
  };
  
  return iconMap[ext] || 'file';
}

function getMimeType(filename: string): string {
  const ext = filename.split('.').pop()?.toLowerCase() || '';
  
  const mimeMap: Record<string, string> = {
    jpg: 'image/jpeg', jpeg: 'image/jpeg', png: 'image/png', gif: 'image/gif',
    mp4: 'video/mp4', webm: 'video/webm', mov: 'video/quicktime',
    mp3: 'audio/mpeg', wav: 'audio/wav',
    pdf: 'application/pdf', txt: 'text/plain', json: 'application/json',
    html: 'text/html', css: 'text/css', js: 'application/javascript',
  };
  
  return mimeMap[ext] || 'application/octet-stream';
}

describe('File Type Detection', () => {
  describe('getFileIcon', () => {
    it('should return folder icon for directories', () => {
      expect(getFileIcon('my-folder', true)).toBe('folder');
    });

    it('should return image icon for image files', () => {
      expect(getFileIcon('photo.jpg', false)).toBe('image');
      expect(getFileIcon('image.png', false)).toBe('image');
      expect(getFileIcon('graphic.gif', false)).toBe('image');
    });

    it('should return video icon for video files', () => {
      expect(getFileIcon('movie.mp4', false)).toBe('video');
      expect(getFileIcon('clip.webm', false)).toBe('video');
    });

    it('should return audio icon for audio files', () => {
      expect(getFileIcon('song.mp3', false)).toBe('audio');
      expect(getFileIcon('music.wav', false)).toBe('audio');
    });

    it('should return code icon for code files', () => {
      expect(getFileIcon('app.js', false)).toBe('code');
      expect(getFileIcon('index.tsx', false)).toBe('code');
      expect(getFileIcon('main.py', false)).toBe('code');
    });

    it('should return archive icon for compressed files', () => {
      expect(getFileIcon('backup.zip', false)).toBe('archive');
      expect(getFileIcon('files.tar.gz', false)).toBe('archive');
    });

    it('should return generic file icon for unknown types', () => {
      expect(getFileIcon('readme', false)).toBe('file');
      expect(getFileIcon('data.xyz', false)).toBe('file');
    });
  });

  describe('getMimeType', () => {
    it('should return correct MIME type for images', () => {
      expect(getMimeType('photo.jpg')).toBe('image/jpeg');
      expect(getMimeType('image.png')).toBe('image/png');
    });

    it('should return correct MIME type for videos', () => {
      expect(getMimeType('movie.mp4')).toBe('video/mp4');
      expect(getMimeType('clip.webm')).toBe('video/webm');
    });

    it('should return correct MIME type for documents', () => {
      expect(getMimeType('document.pdf')).toBe('application/pdf');
      expect(getMimeType('readme.txt')).toBe('text/plain');
    });

    it('should return octet-stream for unknown types', () => {
      expect(getMimeType('data.xyz')).toBe('application/octet-stream');
    });
  });
});
