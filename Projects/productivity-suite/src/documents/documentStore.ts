export type DocumentApp = 'writer' | 'spreadsheet' | 'presentation';

export interface WriterLayout {
  paper: 'A3' | 'A4' | 'A5' | 'Letter' | 'Legal' | 'Tabloid';
  orientation: 'portrait' | 'landscape';
  margins: { top: number; right: number; bottom: number; left: number };
}

export const DEFAULT_WRITER_LAYOUT: WriterLayout = {
  paper: 'Letter', orientation: 'portrait',
  margins: { top: 1, right: 1, bottom: 1, left: 1 },
};

export interface WorkspaceDocument {
  id: string;
  app: DocumentApp;
  title: string;
  content: string;
  layout?: WriterLayout;
  createdAt: string;
  updatedAt: string;
}

export interface WriterRecoveryDraft {
  documentId: string;
  title: string;
  content: string;
  layout: WriterLayout;
  updatedAt: string;
}

const DATABASE_NAME = 'nexus-workspace';
const DATABASE_VERSION = 1;
const DOCUMENT_STORE = 'documents';
const META_STORE = 'metadata';
const LEGACY_WRITER_KEY = 'nexus-writer-document';
const MIGRATION_KEY = 'legacy-writer-document-v1';

function openDatabase(): Promise<IDBDatabase> {
  if (!('indexedDB' in window)) return Promise.reject(new Error('This browser does not support local document storage.'));

  return new Promise((resolve, reject) => {
    const request = window.indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(DOCUMENT_STORE)) {
        const documents = database.createObjectStore(DOCUMENT_STORE, { keyPath: 'id' });
        documents.createIndex('by-app', 'app', { unique: false });
        documents.createIndex('by-updated', 'updatedAt', { unique: false });
      }
      if (!database.objectStoreNames.contains(META_STORE)) database.createObjectStore(META_STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Could not open local document storage.'));
    request.onblocked = () => reject(new Error('Document storage is blocked by another open Nexus tab. Close the other tab and retry.'));
  });
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error ?? new Error('Document storage transaction failed.'));
    transaction.onabort = () => reject(transaction.error ?? new Error('Document storage transaction was cancelled.'));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error('Document storage request failed.'));
  });
}

function newId(): string {
  return typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `nexus-${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
}

function safeLegacyRecord(raw: string): { title: string; content: string } | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== 'object') return null;
    const record = value as { title?: unknown; content?: unknown };
    if (typeof record.content !== 'string') return null;
    return {
      title: typeof record.title === 'string' && record.title.trim() ? record.title.trim() : 'Untitled document',
      content: record.content,
    };
  } catch {
    return null;
  }
}

async function migrateLegacyWriterDocument(): Promise<void> {
  const raw = window.localStorage.getItem(LEGACY_WRITER_KEY);
  if (!raw) return;
  const legacy = safeLegacyRecord(raw);
  if (!legacy) return;

  const database = await openDatabase();
  try {
    const transaction = database.transaction([DOCUMENT_STORE, META_STORE], 'readwrite');
    const done = transactionDone(transaction);
    const documents = transaction.objectStore(DOCUMENT_STORE);
    const metadata = transaction.objectStore(META_STORE);
    const migrated = await requestResult(metadata.get(MIGRATION_KEY));
    if (!migrated) {
      const now = new Date().toISOString();
      documents.add({
        id: newId(), app: 'writer', title: legacy.title, content: legacy.content, layout: DEFAULT_WRITER_LAYOUT,
        createdAt: now, updatedAt: now,
      } satisfies WorkspaceDocument);
      metadata.put(true, MIGRATION_KEY);
    }
    await done;
    window.localStorage.removeItem(LEGACY_WRITER_KEY);
  } finally {
    database.close();
  }
}

async function withDocuments<T>(operation: (store: IDBObjectStore) => Promise<T>): Promise<T> {
  await migrateLegacyWriterDocument();
  const database = await openDatabase();
  try {
    const transaction = database.transaction(DOCUMENT_STORE, 'readonly');
    const done = transactionDone(transaction);
    const result = await operation(transaction.objectStore(DOCUMENT_STORE));
    await done;
    return result;
  } finally {
    database.close();
  }
}

export const documentStore = {
  async list(app: DocumentApp): Promise<WorkspaceDocument[]> {
    return withDocuments(async store => {
      const records = await requestResult(store.index('by-app').getAll(app)) as WorkspaceDocument[];
      return records.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
    });
  },

  async recent(): Promise<WorkspaceDocument[]> {
    return withDocuments(async store => {
      const records = await requestResult(store.getAll()) as WorkspaceDocument[];
      return records.sort((left, right) => right.updatedAt.localeCompare(left.updatedAt)).slice(0, 8);
    });
  },

  async get(id: string): Promise<WorkspaceDocument | undefined> {
    return withDocuments(store => requestResult(store.get(id)) as Promise<WorkspaceDocument | undefined>);
  },

  async create(app: DocumentApp, title?: string): Promise<WorkspaceDocument> {
    await migrateLegacyWriterDocument();
    const database = await openDatabase();
    const now = new Date().toISOString();
    const defaultTitle = title?.trim() || (app === 'spreadsheet' ? 'Untitled spreadsheet' : app === 'presentation' ? 'Untitled presentation' : 'Untitled document');
    const defaultContent = app === 'spreadsheet'
      ? JSON.stringify({ sheets: [{ name: 'Sheet 1', cells: {}, colWidths: {}, rowHeights: {} }], activeSheet: 0 })
      : '<p></p>';
    const record: WorkspaceDocument = { id: newId(), app, title: defaultTitle, content: defaultContent, ...(app === 'writer' ? { layout: DEFAULT_WRITER_LAYOUT } : {}), createdAt: now, updatedAt: now };
    try {
      const transaction = database.transaction(DOCUMENT_STORE, 'readwrite');
      const done = transactionDone(transaction);
      transaction.objectStore(DOCUMENT_STORE).add(record);
      await done;
      return record;
    } finally {
      database.close();
    }
  },

  async duplicate(id: string, title: string): Promise<WorkspaceDocument> {
    await migrateLegacyWriterDocument();
    const database = await openDatabase();
    try {
      const transaction = database.transaction(DOCUMENT_STORE, 'readwrite');
      const done = transactionDone(transaction);
      const store = transaction.objectStore(DOCUMENT_STORE);
      const existing = await requestResult(store.get(id)) as WorkspaceDocument | undefined;
      if (!existing) throw new Error('This document no longer exists.');
      const now = new Date().toISOString();
      const copy: WorkspaceDocument = { ...existing, id: newId(), title: title.trim() || 'Untitled document', createdAt: now, updatedAt: now };
      store.add(copy);
      await done;
      return copy;
    } finally {
      database.close();
    }
  },

  async save(id: string, changes: Partial<Pick<WorkspaceDocument, 'title' | 'content' | 'layout'>>): Promise<WorkspaceDocument> {
    await migrateLegacyWriterDocument();
    const database = await openDatabase();
    try {
      const transaction = database.transaction([DOCUMENT_STORE, META_STORE], 'readwrite');
      const done = transactionDone(transaction);
      const store = transaction.objectStore(DOCUMENT_STORE);
      const metadata = transaction.objectStore(META_STORE);
      const existing = await requestResult(store.get(id)) as WorkspaceDocument | undefined;
      if (!existing) {
        throw new Error('This document no longer exists. Return to Documents and open it again.');
      }
      const updated: WorkspaceDocument = { ...existing, ...changes, updatedAt: new Date().toISOString() };
      store.put(updated);
      metadata.delete(`writer-recovery:${id}`);
      await done;
      return updated;
    } finally {
      database.close();
    }
  },

  async getRecovery(id: string): Promise<WriterRecoveryDraft | undefined> {
    await migrateLegacyWriterDocument();
    const database = await openDatabase();
    try {
      const transaction = database.transaction(META_STORE, 'readonly');
      const done = transactionDone(transaction);
      const result = await requestResult(transaction.objectStore(META_STORE).get(`writer-recovery:${id}`)) as WriterRecoveryDraft | undefined;
      await done;
      return result;
    } finally {
      database.close();
    }
  },

  async saveRecovery(draft: WriterRecoveryDraft): Promise<void> {
    await migrateLegacyWriterDocument();
    const database = await openDatabase();
    try {
      const transaction = database.transaction([DOCUMENT_STORE, META_STORE], 'readwrite');
      const done = transactionDone(transaction);
      const documents = transaction.objectStore(DOCUMENT_STORE);
      const metadata = transaction.objectStore(META_STORE);
      const existing = await requestResult(documents.get(draft.documentId)) as WorkspaceDocument | undefined;
      if (!existing) throw new Error('This document no longer exists. Return to Documents and open it again.');
      metadata.put(draft, `writer-recovery:${draft.documentId}`);
      await done;
    } finally {
      database.close();
    }
  },

  async clearRecovery(id: string): Promise<void> {
    await migrateLegacyWriterDocument();
    const database = await openDatabase();
    try {
      const transaction = database.transaction(META_STORE, 'readwrite');
      const done = transactionDone(transaction);
      transaction.objectStore(META_STORE).delete(`writer-recovery:${id}`);
      await done;
    } finally {
      database.close();
    }
  },

  async rename(id: string, title: string): Promise<WorkspaceDocument> {
    await migrateLegacyWriterDocument();
    const database = await openDatabase();
    try {
      const transaction = database.transaction(DOCUMENT_STORE, 'readwrite');
      const done = transactionDone(transaction);
      const store = transaction.objectStore(DOCUMENT_STORE);
      const existing = await requestResult(store.get(id)) as WorkspaceDocument | undefined;
      if (!existing) throw new Error('This document no longer exists.');
      const updated = { ...existing, title: title.trim() || 'Untitled document', updatedAt: new Date().toISOString() };
      store.put(updated);
      await done;
      return updated;
    } finally {
      database.close();
    }
  },

  async delete(id: string): Promise<void> {
    await migrateLegacyWriterDocument();
    const database = await openDatabase();
    try {
      const transaction = database.transaction([DOCUMENT_STORE, META_STORE], 'readwrite');
      const done = transactionDone(transaction);
      transaction.objectStore(DOCUMENT_STORE).delete(id);
      transaction.objectStore(META_STORE).delete(`writer-recovery:${id}`);
      await done;
    } finally {
      database.close();
    }
  },
};
