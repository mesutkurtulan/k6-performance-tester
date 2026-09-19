#!/usr/bin/env node
import { startMockApi } from "./server.js";

const port = Number(process.env.PORT ?? 4010);
const started = await startMockApi(port);
console.log(`Mock API listening on http://127.0.0.1:${started.port}`);
