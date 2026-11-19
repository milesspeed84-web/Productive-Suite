export interface HistoryEntry<T> {
  state: T;
  bookmark: { anchor: number; focus: number } | null;
}

export class EditHistory<T> {
  private undoEntries: HistoryEntry<T>[] = [];
  private redoEntries: HistoryEntry<T>[] = [];
  private groupKey: string | null = null;
  private groupAt = 0;
  private readonly maxEntries: number;
  private readonly groupWindowMs: number;
  private readonly sizeOf: (value: T) => number;
  private readonly maxBytes: number;

  constructor(
    maxEntries = 80,
    groupWindowMs = 650,
    sizeOf: (value: T) => number = () => 1,
    maxBytes = 16 * 1024 * 1024,
  ) {
    this.maxEntries = maxEntries;
    this.groupWindowMs = groupWindowMs;
    this.sizeOf = sizeOf;
    this.maxBytes = maxBytes;
  }

  reset(): void {
    this.undoEntries = [];
    this.redoEntries = [];
    this.breakGroup();
  }

  breakGroup(): void {
    this.groupKey = null;
    this.groupAt = 0;
  }

  checkpoint(entry: HistoryEntry<T>, groupKey: string | null = null, now = Date.now()): void {
    const sameGroup = groupKey !== null && this.groupKey === groupKey && now - this.groupAt <= this.groupWindowMs;
    this.groupKey = groupKey;
    this.groupAt = now;
    if (sameGroup) return;
    if (targetLastState(this.undoEntries) === entry.state) {
      this.redoEntries = [];
      return;
    }
    this.pushBounded(this.undoEntries, entry);
    this.redoEntries = [];
  }

  undo(current: HistoryEntry<T>): HistoryEntry<T> | null {
    const previous = this.undoEntries.pop();
    if (!previous) return null;
    this.pushBounded(this.redoEntries, current);
    this.breakGroup();
    return previous;
  }

  redo(current: HistoryEntry<T>): HistoryEntry<T> | null {
    const next = this.redoEntries.pop();
    if (!next) return null;
    this.pushBounded(this.undoEntries, current);
    this.breakGroup();
    return next;
  }

  get canUndo(): boolean { return this.undoEntries.length > 0; }
  get canRedo(): boolean { return this.redoEntries.length > 0; }

  private pushBounded(target: HistoryEntry<T>[], entry: HistoryEntry<T>): void {
    target.push(entry);
    let bytes = target.reduce((total, item) => total + this.sizeOf(item.state), 0);
    while (target.length > this.maxEntries || (bytes > this.maxBytes && target.length > 1)) {
      const removed = target.shift();
      if (removed) bytes -= this.sizeOf(removed.state);
    }
  }
}

function targetLastState<T>(entries: HistoryEntry<T>[]): T | undefined {
  return entries.at(-1)?.state;
}
