const DURATION_RE = /^(\d+(?:\.\d+)?)(ms|s|m|h)$/i;

export function parseDurationMs(value: string): number {
  const match = value.trim().match(DURATION_RE);
  if (!match) {
    throw new Error(
      `Invalid duration "${value}". Use formats like 30s, 5m, 1h.`,
    );
  }
  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers: Record<string, number> = {
    ms: 1,
    s: 1000,
    m: 60_000,
    h: 3_600_000,
  };
  return amount * (multipliers[unit] ?? 1000);
}

export function formatDuration(ms: number): string {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${(ms / 60_000).toFixed(1)}m`;
  return `${(ms / 3_600_000).toFixed(1)}h`;
}

export function durationToK6(value: string): string {
  parseDurationMs(value);
  return value;
}
