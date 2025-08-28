// Time utilities for prediction timeline and formatting

export function formatDuration(milliseconds: number): string {
  if (milliseconds < 1000) {
    return `${milliseconds}ms`;
  }
  
  const seconds = Math.floor(milliseconds / 1000);
  if (seconds < 60) {
    return `${seconds}s`;
  }
  
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  if (minutes < 60) {
    return remainingSeconds > 0 ? `${minutes}m ${remainingSeconds}s` : `${minutes}m`;
  }
  
  const hours = Math.floor(minutes / 60);
  const remainingMinutes = minutes % 60;
  return remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours}h`;
}

export function parseISO8601Duration(duration: string): number {
  // Parse ISO 8601 duration strings like "PT15M", "PT1H", "P1D"
  const match = duration.match(/^P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?$/);
  if (!match) return 0;
  
  const [, days, hours, minutes, seconds] = match.map(val => val ? parseInt(val) : 0);
  
  return (
    days * 24 * 60 * 60 * 1000 +
    hours * 60 * 60 * 1000 +
    minutes * 60 * 1000 +
    seconds * 1000
  );
}

export function formatTimeRemaining(targetTime: Date, currentTime: Date = new Date()): string {
  const diff = targetTime.getTime() - currentTime.getTime();
  
  if (diff <= 0) {
    return "Expired";
  }
  
  const minutes = Math.floor(diff / (1000 * 60));
  const seconds = Math.floor((diff % (1000 * 60)) / 1000);
  
  if (minutes > 0) {
    return `${minutes}m ${seconds}s`;
  }
  
  return `${seconds}s`;
}

export function formatDateTime(date: Date): string {
  return new Intl.DateTimeFormat('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    timeZoneName: 'short'
  }).format(date);
}

export function calculateHorizonTime(
  horizon: string, 
  baseTime: Date = new Date()
): Date {
  // Convert horizon format (e.g., "15m", "1h", "1d") to milliseconds
  const timeframeMs: Record<string, number> = {
    '15m': 15 * 60 * 1000,
    '30m': 30 * 60 * 1000,
    '1h': 60 * 60 * 1000,
    '2h': 2 * 60 * 60 * 1000,
    '4h': 4 * 60 * 60 * 1000,
    '1d': 24 * 60 * 60 * 1000,
    '1w': 7 * 24 * 60 * 60 * 1000
  };
  
  const ms = timeframeMs[horizon] || 60 * 60 * 1000; // Default to 1 hour
  return new Date(baseTime.getTime() + ms);
}

export function getRelativeTime(date: Date, now: Date = new Date()): string {
  const diff = now.getTime() - date.getTime();
  const absDiff = Math.abs(diff);
  
  if (absDiff < 60 * 1000) {
    return 'Just now';
  }
  
  if (absDiff < 60 * 60 * 1000) {
    const minutes = Math.floor(absDiff / (60 * 1000));
    return diff > 0 ? `${minutes}m ago` : `in ${minutes}m`;
  }
  
  if (absDiff < 24 * 60 * 60 * 1000) {
    const hours = Math.floor(absDiff / (60 * 60 * 1000));
    return diff > 0 ? `${hours}h ago` : `in ${hours}h`;
  }
  
  const days = Math.floor(absDiff / (24 * 60 * 60 * 1000));
  return diff > 0 ? `${days}d ago` : `in ${days}d`;
}