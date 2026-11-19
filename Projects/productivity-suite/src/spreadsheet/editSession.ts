export interface CellEditSession {
  cell: { row: number; col: number };
  value: string;
  source: 'cell' | 'formula';
}

export type CellEditAction =
  | { type: 'start'; cell: CellEditSession['cell']; value: string; source: CellEditSession['source'] }
  | { type: 'update'; value: string }
  | { type: 'finish' };

export function cellEditReducer(
  session: CellEditSession | null,
  action: CellEditAction,
): CellEditSession | null {
  switch (action.type) {
    case 'start':
      return { cell: action.cell, value: action.value, source: action.source };
    case 'update':
      return session ? { ...session, value: action.value } : null;
    case 'finish':
      return null;
  }
}

export function editKeyAction(key: string): 'commit' | 'cancel' | undefined {
  if (key === 'Enter') return 'commit';
  if (key === 'Escape') return 'cancel';
  return undefined;
}
