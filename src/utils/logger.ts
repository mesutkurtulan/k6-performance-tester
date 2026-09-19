import pc from "picocolors";
import { maskSecrets } from "./secrets.js";

export type LogLevel = "quiet" | "normal" | "verbose" | "debug" | "trace";

const RANK: Record<LogLevel, number> = {
  quiet: 0,
  normal: 1,
  verbose: 2,
  debug: 3,
  trace: 4,
};

export class Logger {
  constructor(
    public level: LogLevel = "normal",
    private readonly sink: (line: string) => void = console.error,
  ) {}

  private emit(min: LogLevel, prefix: string, message: string, color: (s: string) => string) {
    if (RANK[this.level] < RANK[min]) return;
    this.sink(color(`[${prefix}] ${maskSecrets(message)}`));
  }

  info(agent: string, message: string) {
    if (this.level === "quiet") return;
    this.emit("normal", agent.toUpperCase(), message, pc.cyan);
  }

  success(agent: string, message: string) {
    if (this.level === "quiet") return;
    this.emit("normal", agent.toUpperCase(), message, pc.green);
  }

  warn(agent: string, message: string) {
    this.emit("normal", agent.toUpperCase(), message, pc.yellow);
  }

  error(agent: string, message: string) {
    this.emit("quiet", agent.toUpperCase(), message, pc.red);
  }

  verbose(agent: string, message: string) {
    this.emit("verbose", agent.toUpperCase(), message, pc.dim);
  }

  debug(agent: string, message: string) {
    this.emit("debug", agent.toUpperCase(), message, pc.magenta);
  }

  trace(agent: string, message: string) {
    this.emit("trace", agent.toUpperCase(), message, pc.gray);
  }
}

export const logger = new Logger();
