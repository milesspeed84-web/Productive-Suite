import { useCallback, useEffect, useState } from 'react';
import { Clock3, FileText, MoreHorizontal, Plus, RefreshCw, Trash2, Pencil, ExternalLink, Table2 } from 'lucide-react';
import { documentStore, type DocumentApp, type WorkspaceDocument, DEFAULT_WRITER_LAYOUT } from './documents/documentStore';

interface DocumentLandingProps {
  app: DocumentApp;
  title: string;
  description: string;
  onCreate: () => void;
  onOpen: (id: string) => void;
}

function formatDate(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.valueOf()) ? 'Unknown date' : date.toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' });
}

export function DocumentLanding({ app, title, description, onCreate, onOpen }: DocumentLandingProps) {
  const [documents, setDocuments] = useState<WorkspaceDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      setDocuments(await documentStore.list(app));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not read local documents.');
    } finally {
      setLoading(false);
    }
  }, [app]);

  useEffect(() => {
    let cancelled = false;
    documentStore.list(app).then(items => { if (!cancelled) setDocuments(items); })
      .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Could not read local documents.'); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [app]);

  const rename = async (document: WorkspaceDocument) => {
    const next = window.prompt('Rename document', document.title);
    if (next === null || next.trim() === document.title) return;
    try {
      await documentStore.rename(document.id, next);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not rename this document.');
    }
  };

  const remove = async (document: WorkspaceDocument) => {
    if (!window.confirm(`Delete “${document.title}”? This removes the local document and cannot be undone.`)) return;
    try {
      await documentStore.delete(document.id);
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not delete this document.');
    }
  };

  const importDocFile = async (file?: File) => {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'docx') {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const mammoth = await import('mammoth');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { value } = await mammoth.convertToHtml({ arrayBuffer, buffer: arrayBuffer } as any);
        const html = value || '<p></p>';
        const importedTitleBase = file.name.replace(/\.docx$/i, '') || 'Imported DOCX';
        // Ensure unique title to avoid duplicate entries
        const existingDocs = await documentStore.list('writer');
        let uniqueTitle = importedTitleBase;
        let counter = 1;
        while (existingDocs.some(d => d.title === uniqueTitle)) {
          uniqueTitle = `${importedTitleBase} (${counter})`;
          counter++;
        }
        const imported = await documentStore.create('writer', uniqueTitle);
        await documentStore.save(imported.id, { title: imported.title, content: html, layout: DEFAULT_WRITER_LAYOUT });
        onOpen(imported.id);

      } catch (error) {
        window.alert(error instanceof Error ? error.message : 'Could not import this DOCX file.');
      }
    } else if (ext === 'odt') {
      window.alert('ODT import not supported yet.');
    } else {
      window.alert('Unsupported file type for import.');
    }
  };

  const importSpreadsheetFile = async (file?: File) => {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    const importedTitleBase = file.name.replace(/\.(xlsx|xls|csv)$/i, '') || 'Imported Spreadsheet';
    const existingDocs = await documentStore.list('spreadsheet');
    let uniqueTitle = importedTitleBase;
    let counter = 1;
    while (existingDocs.some(d => d.title === uniqueTitle)) {
      uniqueTitle = `${importedTitleBase} (${counter})`;
      counter++;
    }

    if (ext === 'xlsx' || ext === 'xls') {
      try {
        const ExcelJS = await import('exceljs');
        const workbook = new ExcelJS.Workbook();
        const buffer = await file.arrayBuffer();
        await workbook.xlsx.load(buffer);
        const sheets: Array<{
          name: string;
          cells: Record<string, { v?: string | number; f?: string; s?: { bold?: boolean; italic?: boolean; underline?: boolean; align?: 'left' | 'center' | 'right' } }>;
          colWidths: Record<number, number>;
          rowHeights: Record<number, number>;
        }> = [];
        workbook.eachSheet((ws) => {
          const s = { name: ws.name, cells: {} as Record<string, { v?: string | number; f?: string; s?: { bold?: boolean; italic?: boolean; underline?: boolean; align?: 'left' | 'center' | 'right' } }>, colWidths: {} as Record<number, number>, rowHeights: {} as Record<number, number> };
          ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
            row.eachCell({ includeEmpty: false }, (cell, colNumber) => {
              const key = `${rowNumber - 1},${colNumber - 1}`;
              const cd: { v?: string | number; f?: string; s?: { bold?: boolean; italic?: boolean; underline?: boolean; align?: 'left' | 'center' | 'right' } } = {};
              if (cell.type === 2) {
                cd.v = cell.value as number;
              } else if (cell.type === 6 && typeof cell.value === 'object' && cell.value && 'formula' in cell.value) {
                const fv = cell.value as { formula?: string; result?: unknown };
                cd.f = fv.formula;
                if (fv.result !== undefined) cd.v = fv.result as string | number;
              } else {
                cd.v = cell.text || String(cell.value ?? '');
              }
              if (cell.font) {
                cd.s = {
                  bold: cell.font.bold,
                  italic: cell.font.italic,
                  underline: !!cell.font.underline,
                };
              }
              if (cell.alignment?.horizontal) {
                cd.s = { ...cd.s, align: cell.alignment.horizontal as 'left' | 'center' | 'right' };
              }
              s.cells[key] = cd;
            });
          });
          sheets.push(s);
        });
        const imported = await documentStore.create('spreadsheet', uniqueTitle);
        await documentStore.save(imported.id, {
          title: imported.title,
          content: JSON.stringify({ sheets: sheets.length > 0 ? sheets : [{ name: 'Sheet 1', cells: {}, colWidths: {}, rowHeights: {} }], activeSheet: 0 }),
        });
        onOpen(imported.id);
      } catch (error) {
        window.alert(error instanceof Error ? error.message : 'Could not import this spreadsheet.');
      }
    } else if (ext === 'csv') {
      try {
        const text = await file.text();
        const s = { name: 'Sheet 1', cells: {} as Record<string, { v?: string | number; f?: string; s?: { bold?: boolean; italic?: boolean; underline?: boolean; align?: 'left' | 'center' | 'right' } }>, colWidths: {} as Record<number, number>, rowHeights: {} as Record<number, number> };
        const rows = text.split(/\r?\n/);
        rows.forEach((rowText, ri) => {
          if (rowText.trim() === '') return;
          const cols: string[] = [];
          let current = '';
          let inQuotes = false;
          for (let i = 0; i < rowText.length; i++) {
            const ch = rowText[i];
            if (inQuotes) {
              if (ch === '"' && rowText[i + 1] === '"') {
                current += '"';
                i++;
              } else if (ch === '"') {
                inQuotes = false;
              } else {
                current += ch;
              }
            } else {
              if (ch === '"') {
                inQuotes = true;
              } else if (ch === ',') {
                cols.push(current);
                current = '';
              } else {
                current += ch;
              }
            }
          }
          cols.push(current);
          cols.forEach((val, ci) => {
            if (val === '') return;
            const num = parseFloat(val);
            const v = !isNaN(num) && val.trim() === String(num) ? num : val;
            s.cells[`${ri},${ci}`] = { v };
          });
        });
        const imported = await documentStore.create('spreadsheet', uniqueTitle);
        await documentStore.save(imported.id, {
          title: imported.title,
          content: JSON.stringify({ sheets: [s], activeSheet: 0 }),
        });
        onOpen(imported.id);
      } catch (error) {
        window.alert(error instanceof Error ? error.message : 'Could not import this CSV file.');
      }
    } else {
      window.alert('Unsupported file type. Please choose a .xlsx or .csv file.');
    }
  };

  return (
    <section className="library-panel">
      <div className="library-heading">
        <div><div className="eyebrow"><span className="status-dot" /> LOCAL LIBRARY</div><h2>{title}</h2><p>{description}</p></div>
        <div className="library-header-actions">
          <button className="primary-button" onClick={onCreate}><Plus size={18} /> Create new {app === 'writer' ? 'document' : app}</button>
          {app === 'writer' && (
            <>
              <button className="primary-button import-docx-label" onClick={() => document.getElementById('import-docx-input')?.click()}><FileText size={18} /> Import DOCX</button>
              <input id="import-docx-input" type="file" accept=".docx,.odt" style={{display:'none'}} onChange={e=>{ void importDocFile(e.target.files?.[0]); e.target.value=''; }} />
            </>
          )}
          {app === 'spreadsheet' && (
            <>
              <button className="primary-button import-docx-label" onClick={() => document.getElementById('import-sheet-input')?.click()}><Table2 size={18} /> Import XLSX / CSV</button>
              <input id="import-sheet-input" type="file" accept=".xlsx,.xls,.csv" style={{display:'none'}} onChange={e=>{ void importSpreadsheetFile(e.target.files?.[0]); e.target.value=''; }} />
            </>
          )}
        </div>
      </div>
      {error && <div className="library-error" role="alert">{error} <button className="text-button" onClick={() => void refresh()}><RefreshCw size={14} /> Retry</button></div>}
      <div className="files-table library-table">
        <div className="files-header"><span>NAME</span><span>TYPE</span><span>LAST MODIFIED</span><span>ACTIONS</span></div>
        {loading ? <div className="library-empty">Loading local files…</div> : documents.map(document => (
          <div className="file-row library-row" key={document.id}>
            <button className="file-name library-open" onClick={() => onOpen(document.id)}>
              <div className={`file-type-icon ${app === 'writer' ? 'purple' : app === 'spreadsheet' ? 'green' : 'orange'}`}>
                {app === 'spreadsheet' ? <Table2 size={18} /> : <FileText size={18} />}
              </div>
              <strong>{document.title}</strong><ExternalLink size={14} className="library-open-icon" />
            </button>
            <span className="file-type">{app === 'writer' ? 'Document' : app === 'spreadsheet' ? 'Spreadsheet' : 'Presentation'}</span>
            <span className="file-date"><Clock3 size={14} />{formatDate(document.updatedAt)}</span>
            <div className="library-actions">
              <button className="row-menu" title="Rename" aria-label={`Rename ${document.title}`} onClick={() => void rename(document)}><Pencil size={16} /></button>
              <button className="row-menu" title="Delete" aria-label={`Delete ${document.title}`} onClick={() => void remove(document)}><Trash2 size={16} /></button>
              <button className="row-menu" title="More actions" aria-label={`More actions for ${document.title}`} onClick={() => onOpen(document.id)}><MoreHorizontal size={18} /></button>
            </div>
          </div>
        ))}
        {!loading && documents.length === 0 && !error && <div className="library-empty">No saved {app === 'writer' ? 'documents' : app === 'spreadsheet' ? 'spreadsheets' : 'presentations'} yet. Create one to get started.</div>}
      </div>
      {app === 'presentation' && <p className="library-limitation">This library only lists files created by Nexus. Editing and persistent storage for this app are not implemented yet.</p>}
    </section>
  );
}

export function RecentDocuments({ onOpen }: { onOpen: (id: string, app?: DocumentApp) => void }) {
  const [documents, setDocuments] = useState<WorkspaceDocument[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let cancelled = false;
    documentStore.recent().then(items => { if (!cancelled) setDocuments(items); })
      .catch(reason => { if (!cancelled) setError(reason instanceof Error ? reason.message : 'Local documents are unavailable.'); });
    return () => { cancelled = true; };
  }, []);
  return (
    <div className="files-table">
      <div className="files-header"><span>NAME</span><span>TYPE</span><span>LAST MODIFIED</span><span /></div>
      {documents.map(document => (
        <button className="file-row recent-document-row" key={document.id} onClick={() => onOpen(document.id, document.app)}>
          <span className="file-name">
            <span className={`file-type-icon ${document.app === 'spreadsheet' ? 'green' : 'purple'}`}>
              {document.app === 'spreadsheet' ? <Table2 size={18} /> : <FileText size={18} />}
            </span>
            <strong>{document.title}</strong>
          </span>
          <span className="file-type">{document.app === 'spreadsheet' ? 'Spreadsheet' : 'Document'}</span>
          <span className="file-date"><Clock3 size={14} />{formatDate(document.updatedAt)}</span><ExternalLink size={16} />
        </button>
      ))}
      {error && <div className="library-empty">{error}</div>}
      {!error && documents.length === 0 && <div className="library-empty">No local documents yet. Create one from Documents or Spreadsheets.</div>}
    </div>
  );
}
