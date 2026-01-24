import { describe, it, expect } from 'vitest';

// Utility functions to test
export function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

export function formatDate(dateString: string): string {
  const date = new Date(dateString);
  return date.toLocaleString();
}

export function isImageFile(filename: string): boolean {
  const imageExtensions = ['.jpg', '.jpeg', '.png', '.gif', '.bmp', '.webp', '.svg'];
  return imageExtensions.some(ext => filename.toLowerCase().endsWith(ext));
}

export function isVideoFile(filename: string): boolean {
  const videoExtensions = ['.mp4', '.webm', '.ogg', '.mov', '.avi', '.mkv'];
  return videoExtensions.some(ext => filename.toLowerCase().endsWith(ext));
}

export function getFileExtension(filename: string): string {
  const parts = filename.split('.');
  return parts.length > 1 ? parts[parts.length - 1].toLowerCase() : '';
}

describe('Utility Functions', () => {
  describe('formatBytes', () => {
    it('should format 0 bytes', () => {
      expect(formatBytes(0)).toBe('0 B');
    });

    it('should format bytes', () => {
      expect(formatBytes(500)).toBe('500 B');
    });

    it('should format kilobytes', () => {
      expect(formatBytes(1024)).toBe('1 KB');
      expect(formatBytes(2048)).toBe('2 KB');
    });

    it('should format megabytes', () => {
      expect(formatBytes(1048576)).toBe('1 MB');
      expect(formatBytes(5242880)).toBe('5 MB');
    });

    it('should format gigabytes', () => {
      expect(formatBytes(1073741824)).toBe('1 GB');
      expect(formatBytes(2147483648)).toBe('2 GB');
    });

    it('should format decimal values correctly', () => {
      expect(formatBytes(1536)).toBe('1.5 KB');
      expect(formatBytes(1572864)).toBe('1.5 MB');
    });

    it('should handle large numbers', () => {
      expect(formatBytes(1099511627776)).toBe('1 TB');
    });
  });

  describe('formatDate', () => {
    it('should format valid date strings', () => {
      const result = formatDate('2024-01-15T10:30:00Z');
      expect(result).toContain('2024');
      expect(result).toContain('15');
    });

    it('should handle ISO date format', () => {
      const result = formatDate('2024-01-15T10:30:00.000Z');
      expect(typeof result).toBe('string');
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('isImageFile', () => {
    it('should return true for image files', () => {
      expect(isImageFile('photo.jpg')).toBe(true);
      expect(isImageFile('image.png')).toBe(true);
      expect(isImageFile('graphic.gif')).toBe(true);
      expect(isImageFile('picture.webp')).toBe(true);
    });

    it('should be case insensitive', () => {
      expect(isImageFile('PHOTO.JPG')).toBe(true);
      expect(isImageFile('Image.PNG')).toBe(true);
    });

    it('should return false for non-image files', () => {
      expect(isImageFile('document.pdf')).toBe(false);
      expect(isImageFile('video.mp4')).toBe(false);
      expect(isImageFile('music.mp3')).toBe(false);
    });

    it('should handle files without extensions', () => {
      expect(isImageFile('README')).toBe(false);
    });
  });

  describe('isVideoFile', () => {
    it('should return true for video files', () => {
      expect(isVideoFile('movie.mp4')).toBe(true);
      expect(isVideoFile('clip.webm')).toBe(true);
      expect(isVideoFile('video.mov')).toBe(true);
      expect(isVideoFile('film.mkv')).toBe(true);
    });

    it('should be case insensitive', () => {
      expect(isVideoFile('VIDEO.MP4')).toBe(true);
      expect(isVideoFile('Movie.MOV')).toBe(true);
    });

    it('should return false for non-video files', () => {
      expect(isVideoFile('photo.jpg')).toBe(false);
      expect(isVideoFile('document.pdf')).toBe(false);
      expect(isVideoFile('music.mp3')).toBe(false);
    });
  });

  describe('getFileExtension', () => {
    it('should extract file extension', () => {
      expect(getFileExtension('document.pdf')).toBe('pdf');
      expect(getFileExtension('image.png')).toBe('png');
      expect(getFileExtension('archive.tar.gz')).toBe('gz');
    });

    it('should handle uppercase extensions', () => {
      expect(getFileExtension('FILE.PDF')).toBe('pdf');
      expect(getFileExtension('IMAGE.PNG')).toBe('png');
    });

    it('should return empty string for files without extension', () => {
      expect(getFileExtension('README')).toBe('');
      expect(getFileExtension('makefile')).toBe('');
    });

    it('should handle hidden files', () => {
      expect(getFileExtension('.gitignore')).toBe('gitignore');
      expect(getFileExtension('.env')).toBe('env');
    });
  });
});
