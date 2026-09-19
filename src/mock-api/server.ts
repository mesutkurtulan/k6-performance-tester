import { createServer, IncomingMessage, ServerResponse } from "node:http";

const products = new Map<string, { id: string; name: string; price: number }>([
  ["1", { id: "1", name: "Widget", price: 9.99 }],
]);

function send(res: ServerResponse, status: number, body: unknown) {
  const json = JSON.stringify(body);
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(json);
}

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (c) => chunks.push(c as Buffer));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf8")));
    req.on("error", reject);
  });
}

export function startMockApi(port = Number(process.env.PORT ?? 4010)) {
  const server = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const auth = req.headers.authorization;
    if (url.pathname.startsWith("/secure") && auth !== "Bearer test-token") {
      send(res, 401, { error: "unauthorized" });
      return;
    }

    if (req.method === "GET" && url.pathname === "/products") {
      const page = Number(url.searchParams.get("page") ?? "1");
      send(res, 200, { page, items: [...products.values()] });
      return;
    }
    if (req.method === "GET" && url.pathname.startsWith("/products/")) {
      const id = url.pathname.split("/")[2];
      const item = products.get(id);
      if (!item) {
        send(res, 404, { error: "not found" });
        return;
      }
      send(res, 200, item);
      return;
    }
    if (req.method === "POST" && url.pathname === "/products") {
      const raw = await readBody(req);
      try {
        const parsed = JSON.parse(raw) as { name?: string; price?: number };
        const id = String(products.size + 1);
        const item = { id, name: parsed.name ?? "unnamed", price: parsed.price ?? 1 };
        products.set(id, item);
        send(res, 201, item);
      } catch {
        send(res, 400, { error: "invalid json" });
      }
      return;
    }
    if ((req.method === "PUT" || req.method === "PATCH") && url.pathname.startsWith("/products/")) {
      const id = url.pathname.split("/")[2];
      const existing = products.get(id);
      if (!existing) {
        send(res, 404, { error: "not found" });
        return;
      }
      const raw = await readBody(req);
      const parsed = JSON.parse(raw || "{}") as Partial<typeof existing>;
      const next = { ...existing, ...parsed, id };
      products.set(id, next);
      send(res, 200, next);
      return;
    }
    if (req.method === "DELETE" && url.pathname.startsWith("/products/")) {
      const id = url.pathname.split("/")[2];
      products.delete(id);
      send(res, 204, {});
      return;
    }
    if (url.pathname === "/slow") {
      await new Promise((r) => setTimeout(r, 50));
      send(res, 200, { ok: true });
      return;
    }
    if (url.pathname === "/error") {
      send(res, 500, { error: "boom" });
      return;
    }
    send(res, 404, { error: "missing" });
  });
  return new Promise<{ port: number; close: () => Promise<void> }>((resolve) => {
    server.listen(port, "127.0.0.1", () => {
      const addr = server.address();
      const bound = typeof addr === "object" && addr ? addr.port : port;
      resolve({
        port: bound,
        close: () =>
          new Promise((resClose) => {
            server.close(() => resClose());
          }),
      });
    });
  });
}

if (import.meta.url === `file://${process.argv[1]}`) {
  startMockApi().then(({ port }) => {
    console.log(`Mock API on http://127.0.0.1:${port}`);
  });
}
