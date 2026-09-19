export class Registry<T> {
  private readonly items = new Map<string, T>();

  register(name: string, item: T): this {
    this.items.set(name, item);
    return this;
  }

  get(name: string): T | undefined {
    return this.items.get(name);
  }

  list(): string[] {
    return [...this.items.keys()];
  }
}
