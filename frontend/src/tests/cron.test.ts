import { describe, it, expect } from 'vitest';

// Cron expression parser tests (matching TasksPage.tsx describeCron function)
function describeCron(expression: string): string {
  const parts = expression.split(' ');
  if (parts.length !== 5) return expression;

  const [minute, hour, dayOfMonth, month, dayOfWeek] = parts;

  // Handle common patterns
  if (minute === '*' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return 'Every minute';
  }
  if (minute === '0' && hour === '*' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return 'Every hour';
  }
  if (minute === '0' && hour === '0' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return 'At 12:00 AM';
  }
  if (minute === '0' && hour === '12' && dayOfMonth === '*' && month === '*' && dayOfWeek === '*') {
    return 'At 12:00 PM';
  }

  // Build description
  let desc = '';

  // Time
  if (minute !== '*' && hour !== '*') {
    const h = parseInt(hour);
    const m = parseInt(minute);
    const ampm = h >= 12 ? 'PM' : 'AM';
    const hour12 = h === 0 ? 12 : h > 12 ? h - 12 : h;
    desc = `At ${hour12}:${m.toString().padStart(2, '0')} ${ampm}`;
  } else if (minute !== '*') {
    desc = `At minute ${minute}`;
  }

  return desc || expression;
}

describe('Cron Expression Parser', () => {
  describe('Common Patterns', () => {
    it('should describe every minute', () => {
      expect(describeCron('* * * * *')).toBe('Every minute');
    });

    it('should describe every hour', () => {
      expect(describeCron('0 * * * *')).toBe('Every hour');
    });

    it('should describe midnight', () => {
      expect(describeCron('0 0 * * *')).toBe('At 12:00 AM');
    });

    it('should describe noon', () => {
      expect(describeCron('0 12 * * *')).toBe('At 12:00 PM');
    });
  });

  describe('Specific Times', () => {
    it('should describe morning time', () => {
      expect(describeCron('30 9 * * *')).toBe('At 9:30 AM');
    });

    it('should describe afternoon time', () => {
      expect(describeCron('15 14 * * *')).toBe('At 2:15 PM');
    });

    it('should describe evening time', () => {
      expect(describeCron('0 18 * * *')).toBe('At 6:00 PM');
    });

    it('should describe late night time', () => {
      expect(describeCron('45 23 * * *')).toBe('At 11:45 PM');
    });
  });

  describe('Invalid Expressions', () => {
    it('should return original for invalid format', () => {
      expect(describeCron('invalid')).toBe('invalid');
    });

    it('should return original for too few parts', () => {
      expect(describeCron('0 0 * *')).toBe('0 0 * *');
    });
  });
});
