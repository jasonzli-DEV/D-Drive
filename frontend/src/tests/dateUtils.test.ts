import { describe, it, expect } from 'vitest';
import { formatDistance, format, isValid, parseISO } from 'date-fns';

describe('Date Formatting Functions', () => {
  describe('formatDistance', () => {
    it('should format time difference less than a minute', () => {
      const now = new Date();
      const past = new Date(now.getTime() - 30 * 1000);
      const result = formatDistance(past, now, { addSuffix: true });
      // date-fns rounds to nearest unit, 30 seconds shows as "less than a minute" or "1 minute"
      expect(result).toMatch(/minute|less than/i);
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

    it('should include suffix when addSuffix is true', () => {
      const now = new Date();
      const past = new Date(now.getTime() - 60 * 60 * 1000);
      const result = formatDistance(past, now, { addSuffix: true });
      expect(result).toContain('ago');
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

    it('should format year correctly', () => {
      const date = new Date(2024, 5, 20);
      expect(format(date, 'yyyy')).toBe('2024');
    });

    it('should format month correctly', () => {
      const date = new Date(2024, 5, 20);
      expect(format(date, 'MMMM')).toBe('June');
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

    it('should parse datetime with timezone', () => {
      const date = parseISO('2024-06-15T14:30:00+05:00');
      expect(isValid(date)).toBe(true);
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

    it('should return true for parsed valid date', () => {
      expect(isValid(parseISO('2024-01-15'))).toBe(true);
    });
  });
});
