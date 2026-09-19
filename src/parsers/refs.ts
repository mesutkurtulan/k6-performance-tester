export function resolveRefs<T>(root: T): T {
  const seen = new WeakSet<object>();
  return walk(root, root, seen, 0) as T;
}

function walk(node: unknown, root: unknown, seen: WeakSet<object>, depth: number): unknown {
  if (depth > 40) return node;
  if (Array.isArray(node)) return node.map((n) => walk(n, root, seen, depth + 1));
  if (!isRecord(node)) return node;
  if (seen.has(node)) return node;
  seen.add(node);

  if (typeof node.$ref === "string") {
    const resolved = lookup(root, node.$ref);
    if (resolved === undefined) {
      return { ...node, unresolvedRef: node.$ref };
    }
    const merged = { ...(isRecord(resolved) ? resolved : { value: resolved }), ...omitRef(node) };
    return walk(merged, root, seen, depth + 1);
  }

  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(node)) {
    out[k] = walk(v, root, seen, depth + 1);
  }
  return out;
}

function omitRef(node: Record<string, unknown>): Record<string, unknown> {
  const { $ref: _r, ...rest } = node;
  return rest;
}

function lookup(root: unknown, ref: string): unknown {
  if (!ref.startsWith("#/")) return undefined;
  const parts = ref
    .slice(2)
    .split("/")
    .map((p) => p.replace(/~1/g, "/").replace(/~0/g, "~"));
  let cur: unknown = root;
  for (const part of parts) {
    if (!isRecord(cur) || !(part in cur)) return undefined;
    cur = cur[part];
  }
  return cur;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return Boolean(v) && typeof v === "object" && !Array.isArray(v);
}
