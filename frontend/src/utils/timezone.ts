/**
 * Timezone utilities for consistent date formatting across the application
 */

/**
 * List of common timezones grouped by region
 */
export const TIMEZONE_OPTIONS = [
  { label: '--- Americas ---', value: '', disabled: true },
  { label: 'Eastern Time - New York', value: 'America/New_York' },
  { label: 'Central Time - Chicago', value: 'America/Chicago' },
  { label: 'Mountain Time - Denver', value: 'America/Denver' },
  { label: 'Pacific Time - Los Angeles', value: 'America/Los_Angeles' },
  { label: 'Alaska Time - Anchorage', value: 'America/Anchorage' },
  { label: 'Hawaii Time - Honolulu', value: 'Pacific/Honolulu' },
  { label: 'Toronto', value: 'America/Toronto' },
  { label: 'Mexico City', value: 'America/Mexico_City' },
  { label: 'São Paulo', value: 'America/Sao_Paulo' },
  { label: 'Buenos Aires', value: 'America/Argentina/Buenos_Aires' },
  { label: '--- Europe ---', value: '', disabled: true },
  { label: 'London', value: 'Europe/London' },
  { label: 'Paris', value: 'Europe/Paris' },
  { label: 'Berlin', value: 'Europe/Berlin' },
  { label: 'Rome', value: 'Europe/Rome' },
  { label: 'Madrid', value: 'Europe/Madrid' },
  { label: 'Amsterdam', value: 'Europe/Amsterdam' },
  { label: 'Moscow', value: 'Europe/Moscow' },
  { label: '--- Asia ---', value: '', disabled: true },
  { label: 'Dubai', value: 'Asia/Dubai' },
  { label: 'Mumbai', value: 'Asia/Kolkata' },
  { label: 'Singapore', value: 'Asia/Singapore' },
  { label: 'Hong Kong', value: 'Asia/Hong_Kong' },
  { label: 'Shanghai', value: 'Asia/Shanghai' },
  { label: 'Tokyo', value: 'Asia/Tokyo' },
  { label: 'Seoul', value: 'Asia/Seoul' },
  { label: '--- Australia & Pacific ---', value: '', disabled: true },
  { label: 'Sydney', value: 'Australia/Sydney' },
  { label: 'Melbourne', value: 'Australia/Melbourne' },
  { label: 'Brisbane', value: 'Australia/Brisbane' },
  { label: 'Perth', value: 'Australia/Perth' },
  { label: 'Auckland', value: 'Pacific/Auckland' },
];

/**
 * Format a date with timezone support
 * @param date - Date to format (Date object or ISO string)
 * @param timezone - IANA timezone string (e.g., "America/New_York") or null for UTC
 * @param options - Intl.DateTimeFormatOptions for formatting
 * @returns Formatted date string
 */
export function formatDateWithTimezone(
  date: Date | string,
  timezone: string | null | undefined,
  options?: Intl.DateTimeFormatOptions
): string {
  const dateObj = typeof date === 'string' ? new Date(date) : date;
  
  const defaultOptions: Intl.DateTimeFormatOptions = {
    year: 'numeric',
    month: 'numeric',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    second: '2-digit',
    ...options,
  };

  try {
    return new Intl.DateTimeFormat('en-US', {
      ...defaultOptions,
      timeZone: timezone || 'UTC',
    }).format(dateObj);
  } catch (error) {
    // Fallback to UTC if timezone is invalid
    console.warn(`Invalid timezone "${timezone}", falling back to UTC`, error);
    return new Intl.DateTimeFormat('en-US', {
      ...defaultOptions,
      timeZone: 'UTC',
    }).format(dateObj);
  }
}

/**
 * Get the current user's timezone from user data
 * @param user - User object with timezone field
 * @returns IANA timezone string or null for UTC
 */
export function getUserTimezone(user: { timezone?: string | null } | null | undefined): string | null {
  return user?.timezone || null;
}

/**
 * Get timezone abbreviation for display
 * @param timezone - IANA timezone string or null for UTC
 * @returns Timezone abbreviation (e.g., "EST", "PST", "UTC")
 */
export function getTimezoneAbbreviation(timezone: string | null | undefined): string {
  if (!timezone) return 'UTC';
  
  try {
    const date = new Date();
    const formatter = new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      timeZoneName: 'short',
    });
    const parts = formatter.formatToParts(date);
    const tzPart = parts.find(part => part.type === 'timeZoneName');
    return tzPart?.value || 'UTC';
  } catch (error) {
    return 'UTC';
  }
}
