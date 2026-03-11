import type { WorkingHoursConfig } from './types';

function getMinutesForTimezone(date: Date, timezone: string): number {
    const formatter = new Intl.DateTimeFormat('en-GB', {
        timeZone: timezone,
        hour: '2-digit',
        minute: '2-digit',
        hour12: false,
    });

    const parts = formatter.formatToParts(date);
    const hour = Number(parts.find((part) => part.type === 'hour')?.value || '0');
    const minute = Number(parts.find((part) => part.type === 'minute')?.value || '0');

    return hour * 60 + minute;
}

function parseMinutes(raw: string): number {
    const [hour, minute] = raw.split(':').map(Number);
    return (hour * 60) + minute;
}

export function isWithinWorkingHours(
    workingHours: WorkingHoursConfig | null | undefined,
    now = new Date(),
): boolean {
    if (!workingHours?.enabled || !workingHours.start || !workingHours.end) {
        return true;
    }

    const timezone = workingHours.timezone || 'UTC';
    const currentMinutes = getMinutesForTimezone(now, timezone);
    const startMinutes = parseMinutes(workingHours.start);
    const endMinutes = parseMinutes(workingHours.end);

    if (startMinutes <= endMinutes) {
        return currentMinutes >= startMinutes && currentMinutes <= endMinutes;
    }

    return currentMinutes >= startMinutes || currentMinutes <= endMinutes;
}
