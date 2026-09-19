const SECRET_KEYS = [
  "authorization",
  "api_key",
  "apikey",
  "api-key",
  "token",
  "access_token",
  "refresh_token",
  "password",
  "passwd",
  "secret",
  "client_secret",
  "bearer",
  "cookie",
  "set-cookie",
  "x-api-key",
];

const HARDCODED_PATTERNS = [
  /(?:api[_-]?key|token|secret|password)\s*[:=]\s*['"][^'"]{8,}['"]/gi,
  /Authorization:\s*Bearer\s+[A-Za-z0-9._\-+=/]{8,}/gi,
  /Bearer\s+[A-Za-z0-9._\-+=/]{20,}/g,
];

export function isSecretKey(key: string): boolean {
  const n = key.toLowerCase().replace(/[^a-z0-9]/g, "");
  return SECRET_KEYS.some((s) => n.includes(s.replace(/[^a-z0-9]/g, "")));
}

export function maskValue(value: string): string {
  if (!value) return value;
  if (value.length <= 8) return "********";
  return `${value.slice(0, 2)}******${value.slice(-2)}`;
}

export function maskSecrets(input: string): string {
  let out = input;
  out = out.replace(
    /(authorization|api[-_]?key|token|password|client_secret|secret|cookie)\s*[:=]\s*([^\s,;]+)/gi,
    (_, key: string) => `${key}: ********`,
  );
  out = out.replace(/Bearer\s+[A-Za-z0-9._\-+=/]{8,}/gi, "Bearer ********");
  out = out.replace(
    /(['"]?(?:api[_-]?key|token|password|secret|client_secret)['"]?\s*[:=]\s*)(['"])[^'"]+\2/gi,
    "$1$2********$2",
  );
  return out;
}

export function findHardcodedSecrets(source: string): string[] {
  const hits: string[] = [];
  for (const pattern of HARDCODED_PATTERNS) {
    const matches = source.match(pattern);
    if (matches) hits.push(...matches.map((m) => maskSecrets(m)));
  }
  return hits;
}

export function redactRecord(record: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(record)) {
    if (isSecretKey(k) && typeof v === "string") {
      out[k] = "********";
    } else if (typeof v === "string") {
      out[k] = maskSecrets(v);
    } else {
      out[k] = v;
    }
  }
  return out;
}
