export class FrameworkError extends Error {
  readonly code: string;
  readonly hint?: string;

  constructor(code: string, message: string, hint?: string) {
    super(message);
    this.name = "FrameworkError";
    this.code = code;
    this.hint = hint;
  }

  toString(): string {
    return this.hint ? `${this.message}\n\n${this.hint}` : this.message;
  }
}

export function fail(code: string, message: string, hint?: string): never {
  throw new FrameworkError(code, message, hint);
}
