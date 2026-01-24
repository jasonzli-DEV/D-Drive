import { describe, it, expect } from 'vitest';
import { formatDistance, format, isValid, parseISO } from 'date-fns';

describe('Date Formatting Functions', () => {
  describe('formatDistance', () => {
    it('should format time difference in seconds', () => {
      const now = new Date();
      const past = new Date(now.getTime() - 30 * 1000);
      const result = formatDistance(past, now, { addSuffix: true });
      expect(result).toContain('second');
    });

    it('should format time difference in minutes', () => {
      const now = new Date();
      const past = new Date(now.getTime() - 5 * 60 * 1000);
      const result = formatDistance(past, now, { addSuffix: true });
      expect(result).toContain('minute');
    });

    it('should format time difference in hours', () => {
      const now = new Date();
      const past = new Date(now.getTime() - 3 * 60 * 60 * 1000);
      const result = formatDistance(past, now, { addSuffix: true });
      expect(result).toContain('hour');
    });

    it('should format time difference in days', () => {
      const now = new Date();
      const past = new Date(now.getTime() - 2 * 24 * 60 * 60 * 1000);
      const result = formatDistance(past, now, { addSuffix: true });
      expect(result).toContain('day');
    });
  });

  describe('format', () => {
    it('should format date with custom pattern', () => {
      const date = new Date(2024, 0, 15, 10, 30, 0);
      expect(format(date, 'yyyy-MM-dd')).toBe('2024-01-15');
    });

    it('should format time', () => {
      const date = new Date(2024, 0, 15, 14, 30, 0);
      expect(format(date, 'HH:mm')).toBe('14:30');
    });

    it('should format with AM/PM', () => {
      const date = new Date(2024, 0, 15, 14, 30, 0);
      expect(format(date, 'h:mm a')).toBe('2:30 PM');
    });

    it('should format full date and time', () => {
      const date = new Date(2024, 0, 15, 10, 30, 0);
      const result = format(date, 'MMM d, yyyy h:mm a');
      expect(result).toBe('Jan 15, 2024 10:30 AM');
    });
  });

  describe('parseISO', () => {
    it('should parse ISO date string', () => {
      const date = parseISO('2024-01-15T10:30:00.000Z');
      expect(isValid(date)).toBe(true);
    });

    it('should parse date-only string', () => {
      const date = parseISO('2024-01-15');
      expect(isValid(date)).toBe(true);
    });

    it('should handle invalid date string', () => {
      const date = parseISO('not-a-date');
      expect(isValid(date)).toBe(false);
    });
  });

  describe('isValid', () => {
    it('should return true for valid date', () => {
      expect(isValid(new Date())).toBe(true);
    });

    it('should return false for invalid date', () => {
      expect(isValid(new Date('invalid'))).toBe(false);
    });

    it('should return false for NaN', () => {
      expect(isValid(NaN)).toBe(false);
    });
  });
});
