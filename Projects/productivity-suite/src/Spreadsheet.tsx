import { useState, useRef, useEffect, useCallback, useMemo, useReducer, useSyncExternalStore } from 'react';
import {
  ArrowLeft, Save, Download, Upload, FileSpreadsheet,
  Plus, Copy, Scissors, ClipboardPaste,
  Trash2,
} from 'lucide-react';
import { documentStore } from './documents/documentStore';
import { formulaEngine } from './spreadsheet/formulaEngine';
import { Ribbon, type RibbonTab } from './spreadsheet/Ribbon';
import { FindReplaceModal } from './spreadsheet/FindReplaceModal';
import { ChartOverlay, type ChartItem, type ChartType } from './spreadsheet/ChartOverlay';
import { formatCellValue, type NumberFormatType } from './spreadsheet/formatters';
import { parseCsv } from './spreadsheet/csv';
import {
  applyCellInput,
  cellColorToCss,
  extendTableForCell,
  getCellRawContent,
  getTableCellAppearance,
  type CellData,
  type CellStyle,
  type SheetData,
  type SpreadsheetData,
} from './spreadsheet/types';
import { exportXlsx as exportWorkbookXlsx, importXlsx } from './spreadsheet/xlsx';
import { cellEditReducer, editKeyAction } from './spreadsheet/editSession';
import './Spreadsheet.css';

// ─── Types ───
interface CellRef {
  row: number;
  col: number;
}

interface SelectionRange {
  start: CellRef;
  end: CellRef;
}

// ─── Constants ───
const DEFAULT_COL_WIDTH = 100;
const DEFAULT_ROW_HEIGHT = 24;
const VISIBLE_ROWS = 100;
const VISIBLE_COLS = 26;
const COL_LETTERS = Array.from({ length: VISIBLE_COLS }, (_, i) =>
  i < 26 ? String.fromCharCode(65 + i) : String.fromCharCode(65 + Math.floor(i / 26) - 1) + String.fromCharCode(65 + (i % 26))
);

// ─── Helpers ───
function cellKey(row: number, col: number): string { return `${row},${col}`; }
function colLabel(col: number): string { return COL_LETTERS[col] ?? ''; }
function cellLabel(row: number, col: number): string { return `${colLabel(col)}${row + 1}`; }
function parseCellRef(ref: string): CellRef | null {
  const m = ref.match(/^([A-Z]{1,2})(\d+)$/i);
  if (!m) return null;
  const letters = m[1].toUpperCase();
  let col = 0;
  for (let i = 0; i < letters.length; i++) col = col * 26 + (letters.charCodeAt(i) - 64);
  col--;
  const row = parseInt(m[2], 10) - 1;
  if (row < 0 || col < 0) return null;
  return { row, col };
}

function normalizeRange(range: SelectionRange): SelectionRange {
  return {
    start: {
      row: Math.min(range.start.row, range.end.row),
      col: Math.min(range.start.col, range.end.col),
    },
    end: {
      row: Math.max(range.start.row, range.end.row),
      col: Math.max(range.start.col, range.end.col),
    },
  };
}

function isInRange(row: number, col: number, range: SelectionRange): boolean {
  const n = normalizeRange(range);
  return row >= n.start.row && row <= n.end.row && col >= n.start.col && col <= n.end.col;
}

function emptySheet(name: string): SheetData {
  return { name, cells: {}, colWidths: {}, rowHeights: {}, charts: [] };
}

function emptySpreadsheet(): SpreadsheetData {
  return { sheets: [emptySheet('Sheet 1')], activeSheet: 0 };
}

// ─── Fallback Formula Engine (built-in regex evaluator) ───
function evaluateFormula(formula: string, getCellValue: (row: number, col: number) => string | number | boolean | undefined): string | number | boolean {
  const upper = formula.toUpperCase().trim();

  // SUM(range)
  const sumMatch = upper.match(/^SUM\(([A-Z]+\d+):([A-Z]+\d+)\)$/);
  if (sumMatch) {
    const start = parseCellRef(sumMatch[1]);
    const end = parseCellRef(sumMatch[2]);
    if (start && end) {
      let sum = 0;
      for (let r = Math.min(start.row, end.row); r <= Math.max(start.row, end.row); r++) {
        for (let c = Math.min(start.col, end.col); c <= Math.max(start.col, end.col); c++) {
          const v = getCellValue(r, c);
          if (typeof v === 'number') sum += v;
          else if (typeof v === 'string') { const n = parseFloat(v); if (!isNaN(n)) sum += n; }
        }
      }
      return sum;
    }
  }

  // AVERAGE(range)
  const avgMatch = upper.match(/^AVERAGE\(([A-Z]+\d+):([A-Z]+\d+)\)$/);
  if (avgMatch) {
    const start = parseCellRef(avgMatch[1]);
    const end = parseCellRef(avgMatch[2]);
    if (start && end) {
      let sum = 0, count = 0;
      for (let r = Math.min(start.row, end.row); r <= Math.max(start.row, end.row); r++) {
        for (let c = Math.min(start.col, end.col); c <= Math.max(start.col, end.col); c++) {
          const v = getCellValue(r, c);
          if (typeof v === 'number') { sum += v; count++; }
          else if (typeof v === 'string') { const n = parseFloat(v); if (!isNaN(n)) { sum += n; count++; } }
        }
      }
      return count > 0 ? sum / count : 0;
    }
  }

  // COUNT(range)
  const countMatch = upper.match(/^COUNT\(([A-Z]+\d+):([A-Z]+\d+)\)$/);
  if (countMatch) {
    const start = parseCellRef(countMatch[1]);
    const end = parseCellRef(countMatch[2]);
    if (start && end) {
      let count = 0;
      for (let r = Math.min(start.row, end.row); r <= Math.max(start.row, end.row); r++) {
        for (let c = Math.min(start.col, end.col); c <= Math.max(start.col, end.col); c++) {
          const v = getCellValue(r, c);
          if (v !== undefined && v !== '') count++;
        }
      }
      return count;
    }
  }

  // MIN(range)
  const minMatch = upper.match(/^MIN\(([A-Z]+\d+):([A-Z]+\d+)\)$/);
  if (minMatch) {
    const start = parseCellRef(minMatch[1]);
    const end = parseCellRef(minMatch[2]);
    if (start && end) {
      let min = Infinity;
      for (let r = Math.min(start.row, end.row); r <= Math.max(start.row, end.row); r++) {
        for (let c = Math.min(start.col, end.col); c <= Math.max(start.col, end.col); c++) {
          const v = getCellValue(r, c);
          const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
          if (!isNaN(n) && n < min) min = n;
        }
      }
      return min === Infinity ? 0 : min;
    }
  }

  // MAX(range)
  const maxMatch = upper.match(/^MAX\(([A-Z]+\d+):([A-Z]+\d+)\)$/);
  if (maxMatch) {
    const start = parseCellRef(maxMatch[1]);
    const end = parseCellRef(maxMatch[2]);
    if (start && end) {
      let max = -Infinity;
      for (let r = Math.min(start.row, end.row); r <= Math.max(start.row, end.row); r++) {
        for (let c = Math.min(start.col, end.col); c <= Math.max(start.col, end.col); c++) {
          const v = getCellValue(r, c);
          const n = typeof v === 'number' ? v : parseFloat(String(v ?? ''));
          if (!isNaN(n) && n > max) max = n;
        }
      }
      return max === -Infinity ? 0 : max;
    }
  }

  // IF(condition, trueVal, falseVal)
  const ifMatch = upper.match(/^IF\((.+),(.+),(.+)\)$/);
  if (ifMatch) {
    const condStr = ifMatch[1].trim();
    const trueVal = ifMatch[2].trim();
    const falseVal = ifMatch[3].trim();
    const compMatch = condStr.match(/^([A-Z]+\d+)\s*([><=!]+)\s*(.+)$/);
    if (compMatch) {
      const ref = parseCellRef(compMatch[1]);
      const op = compMatch[2];
      const compareVal = parseFloat(compMatch[3]);
      if (ref) {
        const cellVal = Number(getCellValue(ref.row, ref.col) ?? 0);
        let result = false;
        if (op === '>') result = cellVal > compareVal;
        else if (op === '<') result = cellVal < compareVal;
        else if (op === '>=' || op === '=>') result = cellVal >= compareVal;
        else if (op === '<=' || op === '=<') result = cellVal <= compareVal;
        else if (op === '=' || op === '==') result = cellVal === compareVal;
        else if (op === '!=' || op === '<>') result = cellVal !== compareVal;
        const rv = result ? trueVal : falseVal;
        const rvRef = parseCellRef(rv);
        if (rvRef) return getCellValue(rvRef.row, rvRef.col) ?? '';
        const rvNum = parseFloat(rv);
        if (!isNaN(rvNum)) return rvNum;
        return rv.replace(/^["']|["']$/g, '');
      }
    }
  }

  // Simple cell reference: =A1
  const refOnly = parseCellRef(upper);
  if (refOnly) {
    const v = getCellValue(refOnly.row, refOnly.col);
    return v ?? '';
  }

  // Simple arithmetic: =A1+B1, =A1*2, etc.
  try {
    const expr = formula.replace(/[A-Z]{1,2}\d+/gi, (match) => {
      const ref = parseCellRef(match);
      if (!ref) return '0';
      const v = getCellValue(ref.row, ref.col);
      if (typeof v === 'number') return String(v);
      if (typeof v === 'string') { const n = parseFloat(v); return isNaN(n) ? '0' : String(n); }
      return '0';
    });
    if (/^[\d+\-*/().%\s]+$/.test(expr)) {
      const result = new Function(`return (${expr})`)();
      if (typeof result === 'number' && isFinite(result)) return Math.round(result * 1e10) / 1e10;
    }
  } catch { /* ignore */ }

  return '#ERROR';
}

// ─── Undo/Redo ───
interface UndoEntry {
  sheets: string;
  activeSheet: number;
}

function cloneSheets(data: SpreadsheetData): UndoEntry {
  return { sheets: JSON.stringify(data.sheets), activeSheet: data.activeSheet };
}

function restoreSheets(entry: UndoEntry): SpreadsheetData {
  return { sheets: JSON.parse(entry.sheets), activeSheet: entry.activeSheet };
}

// ─── Component Props ───
interface SpreadsheetProps {
  documentId: string;
  onBack: () => void;
  onSwitchDocument?: (id: string) => void;
}

export default function Spreadsheet({ documentId, onBack }: SpreadsheetProps) {
  // ─── Core State ───
  const [data, setData] = useState<SpreadsheetData>(emptySpreadsheet);
  const [title, setTitle] = useState('Untitled spreadsheet');
  const [cursor, setCursor] = useState<CellRef>({ row: 0, col: 0 });
  const [selection, setSelection] = useState<SelectionRange | null>(null);
  const [editSession, dispatchEdit] = useReducer(cellEditReducer, null);
  const [saveStatus, setSaveStatus] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const [tabMenu, setTabMenu] = useState<number | null>(null);
  const [loaded, setLoaded] = useState(false);

  // ─── Ribbon & View State ───
  const [activeRibbonTab, setActiveRibbonTab] = useState<RibbonTab>('home');
  const [showFormulaBar, setShowFormulaBar] = useState(true);
  const [showGridlines, setShowGridlines] = useState(true);
  const [showHeadings, setShowHeadings] = useState(true);
  const [freezeRow, setFreezeRow] = useState(false);
  const [freezeCol, setFreezeCol] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [findReplaceOpen, setFindReplaceOpen] = useState(false);

  // Undo/Redo
  const [undoStack, setUndoStack] = useState<UndoEntry[]>([]);
  const [redoStack, setRedoStack] = useState<UndoEntry[]>([]);

  const gridRef = useRef<HTMLDivElement>(null);
  const editInputRef = useRef<HTMLInputElement>(null);
  const formulaInputRef = useRef<HTMLInputElement>(null);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const editFinishedRef = useRef(false);

  const sheet = data.sheets[data.activeSheet] ?? emptySheet('Sheet 1');
  const editing = editSession?.cell ?? null;
  const editValue = editSession?.value ?? '';
  const editSource = editSession?.source ?? null;
  useSyncExternalStore(formulaEngine.subscribe, formulaEngine.getVersion, formulaEngine.getVersion);

  // ─── HyperFormula Sync ───
  useEffect(() => {
    if (loaded && data.sheets.length > 0) {
      formulaEngine.syncWorkbook(data.sheets);
    }
  }, [loaded, data]);

  // ─── Persistence ───
  useEffect(() => {
    let cancelled = false;
    documentStore.get(documentId).then(doc => {
      if (cancelled) return;
      if (doc) {
        setTitle(doc.title);
        if (doc.content && doc.content !== '<p></p>') {
          try {
            const parsed = JSON.parse(doc.content) as SpreadsheetData;
            if (parsed.sheets && Array.isArray(parsed.sheets)) {
              setData(parsed);
            }
          } catch { /* start fresh */ }
        }
      }
      setLoaded(true);
    }).catch(err => {
      console.error('Failed to load spreadsheet:', err);
      if (!cancelled) setLoaded(true);
    });
    return () => { cancelled = true; };
  }, [documentId]);

  const saveDocument = useCallback(async (currentData: SpreadsheetData, currentTitle: string) => {
    try {
      setSaveStatus('Saving…');
      await documentStore.save(documentId, {
        title: currentTitle,
        content: JSON.stringify(currentData),
      });
      setSaveStatus('Saved');
      setTimeout(() => setSaveStatus(''), 2000);
    } catch (err) {
      console.error('Failed to save spreadsheet:', err);
      setSaveStatus('Save failed');
    }
  }, [documentId]);

  const debouncedSave = useCallback((currentData: SpreadsheetData, currentTitle: string) => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => { void saveDocument(currentData, currentTitle); }, 1500);
  }, [saveDocument]);

  // ─── Cell value resolution ───
  const getCellDisplayValue = useCallback((row: number, col: number, sheetData?: SheetData): string => {
    const s = sheetData ?? sheet;
    const cell = s.cells[cellKey(row, col)];
    if (!cell) return '';

    let rawVal: string | number | boolean | undefined;

    if (cell.f) {
      if (formulaEngine.isAvailable()) {
        rawVal = formulaEngine.getCellValue(s.name, row, col);
      }
      if (rawVal === undefined || rawVal === '#ERROR!') {
        const getter = (r: number, c: number): string | number | boolean | undefined => {
          const inner = s.cells[cellKey(r, c)];
          return inner?.v ?? undefined;
        };
        rawVal = evaluateFormula(cell.f, getter);
      }
    } else {
      rawVal = cell.v;
    }

    return formatCellValue(rawVal, cell.s?.numberFormat);
  }, [sheet]);

  const getCellRawDisplay = useCallback((row: number, col: number): string => {
    return getCellRawContent(sheet.cells[cellKey(row, col)]);
  }, [sheet]);

  // ─── Update helpers ───
  const pushUndo = useCallback(() => {
    setUndoStack(prev => [...prev.slice(-50), cloneSheets(data)]);
    setRedoStack([]);
  }, [data]);

  const updateSheet = useCallback((updater: (s: SheetData) => SheetData) => {
    setData(prev => {
      const newSheets = [...prev.sheets];
      newSheets[prev.activeSheet] = updater({ ...newSheets[prev.activeSheet] });
      const newData = { ...prev, sheets: newSheets };
      debouncedSave(newData, title);
      return newData;
    });
  }, [debouncedSave, title]);

  const setCellValue = useCallback((row: number, col: number, rawValue: string) => {
    pushUndo();
    updateSheet(s => {
      const cells = { ...s.cells };
      const key = cellKey(row, col);
      const updatedCell = applyCellInput(cells[key], rawValue);
      if (updatedCell) cells[key] = updatedCell;
      else delete cells[key];
      return {
        ...s,
        cells,
        ...(rawValue !== '' && s.tables ? { tables: extendTableForCell(s.tables, row, col) } : {}),
      };
    });
  }, [pushUndo, updateSheet]);

  // ─── Editing ───
  const startEditing = useCallback((row: number, col: number, initialValue?: string, source: 'cell' | 'formula' = 'cell') => {
    const raw = initialValue ?? getCellRawDisplay(row, col);
    editFinishedRef.current = false;
    dispatchEdit({ type: 'start', cell: { row, col }, value: raw, source });
    if (source === 'cell') setTimeout(() => editInputRef.current?.focus(), 0);
  }, [getCellRawDisplay]);

  const commitEdit = useCallback(() => {
    if (!editSession || editFinishedRef.current) return;
    editFinishedRef.current = true;
    setCellValue(editSession.cell.row, editSession.cell.col, editSession.value);
    dispatchEdit({ type: 'finish' });
    gridRef.current?.focus();
  }, [editSession, setCellValue]);

  const cancelEdit = useCallback(() => {
    editFinishedRef.current = true;
    dispatchEdit({ type: 'finish' });
    gridRef.current?.focus();
  }, []);

  // ─── Selection ───
  const selectCell = useCallback((row: number, col: number, extend?: boolean) => {
    if (extend && selection) {
      setSelection({ start: selection.start, end: { row, col } });
    } else {
      setCursor({ row, col });
      setSelection({ start: { row, col }, end: { row, col } });
    }
    setContextMenu(null);
    setTabMenu(null);
  }, [selection]);

  // ─── Style toggle & formatting ───
  const toggleStyle = useCallback((prop: 'bold' | 'italic' | 'underline' | 'strikethrough' | 'wrapText') => {
    if (!selection) return;
    pushUndo();
    const range = normalizeRange(selection);
    updateSheet(s => {
      const cells = { ...s.cells };
      let anyHas = false;
      for (let r = range.start.row; r <= range.end.row; r++) {
        for (let c = range.start.col; c <= range.end.col; c++) {
          if (cells[cellKey(r, c)]?.s?.[prop]) { anyHas = true; break; }
        }
        if (anyHas) break;
      }
      for (let r = range.start.row; r <= range.end.row; r++) {
        for (let c = range.start.col; c <= range.end.col; c++) {
          const key = cellKey(r, c);
          cells[key] = { ...cells[key], s: { ...cells[key]?.s, [prop]: !anyHas } };
        }
      }
      return { ...s, cells };
    });
  }, [selection, pushUndo, updateSheet]);

  const setAlignment = useCallback((align: 'left' | 'center' | 'right') => {
    if (!selection) return;
    pushUndo();
    const range = normalizeRange(selection);
    updateSheet(s => {
      const cells = { ...s.cells };
      for (let r = range.start.row; r <= range.end.row; r++) {
        for (let c = range.start.col; c <= range.end.col; c++) {
          const key = cellKey(r, c);
          cells[key] = { ...cells[key], s: { ...cells[key]?.s, align } };
        }
      }
      return { ...s, cells };
    });
  }, [selection, pushUndo, updateSheet]);

  const setFontSize = useCallback((fontSize: number) => {
    if (!selection) return;
    pushUndo();
    const range = normalizeRange(selection);
    updateSheet(s => {
      const cells = { ...s.cells };
      for (let r = range.start.row; r <= range.end.row; r++)
        for (let c = range.start.col; c <= range.end.col; c++) {
          const key = cellKey(r, c);
          cells[key] = { ...cells[key], s: { ...cells[key]?.s, fontSize } };
        }
      return { ...s, cells };
    });
  }, [selection, pushUndo, updateSheet]);

  const setColor = useCallback((color: string) => {
    if (!selection) return;
    pushUndo();
    const range = normalizeRange(selection);
    updateSheet(s => {
      const cells = { ...s.cells };
      for (let r = range.start.row; r <= range.end.row; r++)
        for (let c = range.start.col; c <= range.end.col; c++) {
          const key = cellKey(r, c);
          cells[key] = { ...cells[key], s: { ...cells[key]?.s, color } };
        }
      return { ...s, cells };
    });
  }, [selection, pushUndo, updateSheet]);

  const setBg = useCallback((bg: string) => {
    if (!selection) return;
    pushUndo();
    const range = normalizeRange(selection);
    updateSheet(s => {
      const cells = { ...s.cells };
      for (let r = range.start.row; r <= range.end.row; r++)
        for (let c = range.start.col; c <= range.end.col; c++) {
          const key = cellKey(r, c);
          cells[key] = {
            ...cells[key],
            s: { ...cells[key]?.s, bg, fill: { type: 'pattern', pattern: 'solid', fgColor: bg } },
          };
        }
      return { ...s, cells };
    });
  }, [selection, pushUndo, updateSheet]);

  const setBorder = useCallback((borderType: string) => {
    if (!selection) return;
    pushUndo();
    const range = normalizeRange(selection);
    updateSheet(s => {
      const cells = { ...s.cells };
      for (let r = range.start.row; r <= range.end.row; r++) {
        for (let c = range.start.col; c <= range.end.col; c++) {
          const key = cellKey(r, c);
          cells[key] = { ...cells[key], s: { ...cells[key]?.s, border: borderType === 'none' ? undefined : borderType } };
        }
      }
      return { ...s, cells };
    });
  }, [selection, pushUndo, updateSheet]);

  const setNumberFormat = useCallback((format: NumberFormatType) => {
    if (!selection) return;
    pushUndo();
    const range = normalizeRange(selection);
    updateSheet(s => {
      const cells = { ...s.cells };
      for (let r = range.start.row; r <= range.end.row; r++) {
        for (let c = range.start.col; c <= range.end.col; c++) {
          const key = cellKey(r, c);
          cells[key] = { ...cells[key], s: { ...cells[key]?.s, numberFormat: format } };
        }
      }
      return { ...s, cells };
    });
  }, [selection, pushUndo, updateSheet]);

  const adjustDecimals = useCallback((delta: number) => {
    if (delta !== 0) {
      setNumberFormat('number');
    }
  }, [setNumberFormat]);

  // ─── Copy / Cut / Paste ───
  const clipboardRef = useRef<{ cells: Record<string, CellData>; range: SelectionRange; cut?: boolean } | null>(null);

  const handleCopy = useCallback(() => {
    if (!selection) return;
    const range = normalizeRange(selection);
    const cells: Record<string, CellData> = {};
    for (let r = range.start.row; r <= range.end.row; r++) {
      for (let c = range.start.col; c <= range.end.col; c++) {
        const cell = sheet.cells[cellKey(r, c)];
        if (cell) cells[cellKey(r - range.start.row, c - range.start.col)] = { ...cell };
      }
    }
    clipboardRef.current = { cells, range };
    let text = '';
    for (let r = range.start.row; r <= range.end.row; r++) {
      const row: string[] = [];
      for (let c = range.start.col; c <= range.end.col; c++) {
        row.push(String(getCellDisplayValue(r, c)));
      }
      text += row.join('\t') + '\n';
    }
    void navigator.clipboard.writeText(text).catch(() => {});
  }, [selection, sheet.cells, getCellDisplayValue]);

  const handleCut = useCallback(() => {
    if (!selection) return;
    handleCopy();
    if (clipboardRef.current) clipboardRef.current.cut = true;
    pushUndo();
    const range = normalizeRange(selection);
    updateSheet(s => {
      const cells = { ...s.cells };
      for (let r = range.start.row; r <= range.end.row; r++) {
        for (let c = range.start.col; c <= range.end.col; c++) {
          delete cells[cellKey(r, c)];
        }
      }
      return { ...s, cells };
    });
  }, [selection, handleCopy, pushUndo, updateSheet]);

  const handlePaste = useCallback(async () => {
    pushUndo();
    if (clipboardRef.current) {
      const { cells: clipCells, range: clipRange } = clipboardRef.current;
      const height = clipRange.end.row - clipRange.start.row + 1;
      const width = clipRange.end.col - clipRange.start.col + 1;
      updateSheet(s => {
        const cells = { ...s.cells };
        for (let r = 0; r < height; r++) {
          for (let c = 0; c < width; c++) {
            const src = clipCells[cellKey(r, c)];
            const targetKey = cellKey(cursor.row + r, cursor.col + c);
            if (src) {
              cells[targetKey] = { ...src };
            }
          }
        }
        return { ...s, cells };
      });
      return;
    }
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        const rows = text.split('\n').filter(r => r.length > 0);
        updateSheet(s => {
          const cells = { ...s.cells };
          rows.forEach((rowText, ri) => {
            const cols = rowText.split('\t');
            cols.forEach((val, ci) => {
              const key = cellKey(cursor.row + ri, cursor.col + ci);
              const num = parseFloat(val);
              const v = !isNaN(num) && val.trim() === String(num) ? num : val;
              cells[key] = { ...cells[key], v, f: undefined };
            });
          });
          return { ...s, cells };
        });
      }
    } catch { /* clipboard not available */ }
  }, [cursor, pushUndo, updateSheet]);

  const handleGridPaste = useCallback((e: React.ClipboardEvent) => {
    e.preventDefault();
    void handlePaste();
  }, [handlePaste]);

  // ─── Undo / Redo actions ───
  const handleUndo = useCallback(() => {
    if (undoStack.length === 0) return;
    const entry = undoStack[undoStack.length - 1];
    setRedoStack(prev => [...prev, cloneSheets(data)]);
    setUndoStack(prev => prev.slice(0, -1));
    const restored = restoreSheets(entry);
    setData(restored);
    debouncedSave(restored, title);
  }, [undoStack, data, debouncedSave, title]);

  const handleRedo = useCallback(() => {
    if (redoStack.length === 0) return;
    const entry = redoStack[redoStack.length - 1];
    setUndoStack(prev => [...prev, cloneSheets(data)]);
    setRedoStack(prev => prev.slice(0, -1));
    const restored = restoreSheets(entry);
    setData(restored);
    debouncedSave(restored, title);
  }, [redoStack, data, debouncedSave, title]);

  // ─── Keyboard navigation ───
  const handleGridKeyDown = useCallback((e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === 'z') {
      e.preventDefault();
      if (e.shiftKey) handleRedo();
      else handleUndo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'y') {
      e.preventDefault();
      handleRedo();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 's') {
      e.preventDefault();
      void saveDocument(data, title);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      e.preventDefault();
      setFindReplaceOpen(true);
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'b') {
      e.preventDefault();
      toggleStyle('bold');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'i') {
      e.preventDefault();
      toggleStyle('italic');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'u') {
      e.preventDefault();
      toggleStyle('underline');
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'c') {
      e.preventDefault();
      handleCopy();
      return;
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'x') {
      e.preventDefault();
      handleCut();
      return;
    }

    if (editing) return;

    switch (e.key) {
      case 'ArrowUp':
        e.preventDefault();
        selectCell(Math.max(0, cursor.row - 1), cursor.col, e.shiftKey);
        setCursor(prev => ({ ...prev, row: Math.max(0, prev.row - 1) }));
        break;
      case 'ArrowDown':
        e.preventDefault();
        selectCell(Math.min(VISIBLE_ROWS - 1, cursor.row + 1), cursor.col, e.shiftKey);
        setCursor(prev => ({ ...prev, row: Math.min(VISIBLE_ROWS - 1, prev.row + 1) }));
        break;
      case 'ArrowLeft':
        e.preventDefault();
        selectCell(cursor.row, Math.max(0, cursor.col - 1), e.shiftKey);
        setCursor(prev => ({ ...prev, col: Math.max(0, prev.col - 1) }));
        break;
      case 'ArrowRight':
        e.preventDefault();
        selectCell(cursor.row, Math.min(VISIBLE_COLS - 1, cursor.col + 1), e.shiftKey);
        setCursor(prev => ({ ...prev, col: Math.min(VISIBLE_COLS - 1, prev.col + 1) }));
        break;
      case 'Tab':
        e.preventDefault();
        if (e.shiftKey) {
          selectCell(cursor.row, Math.max(0, cursor.col - 1));
          setCursor(prev => ({ ...prev, col: Math.max(0, prev.col - 1) }));
        } else {
          selectCell(cursor.row, Math.min(VISIBLE_COLS - 1, cursor.col + 1));
          setCursor(prev => ({ ...prev, col: Math.min(VISIBLE_COLS - 1, prev.col + 1) }));
        }
        break;
      case 'Enter':
        e.preventDefault();
        if (e.shiftKey) {
          selectCell(Math.max(0, cursor.row - 1), cursor.col);
          setCursor(prev => ({ ...prev, row: Math.max(0, prev.row - 1) }));
        } else {
          startEditing(cursor.row, cursor.col);
        }
        break;
      case 'F2':
        e.preventDefault();
        startEditing(cursor.row, cursor.col);
        break;
      case 'Delete':
      case 'Backspace':
        e.preventDefault();
        if (selection) {
          pushUndo();
          const range = normalizeRange(selection);
          updateSheet(s => {
            const cells = { ...s.cells };
            for (let r = range.start.row; r <= range.end.row; r++) {
              for (let c = range.start.col; c <= range.end.col; c++) {
                const k = cellKey(r, c);
                if (cells[k]?.s) {
                  cells[k] = { s: cells[k].s };
                } else {
                  delete cells[k];
                }
              }
            }
            return { ...s, cells };
          });
        }
        break;
      case 'Escape':
        setContextMenu(null);
        setTabMenu(null);
        break;
      default:
        if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
          e.preventDefault();
          startEditing(cursor.row, cursor.col, e.key);
        }
    }
  }, [editing, cursor, selection, data, selectCell, startEditing, pushUndo, updateSheet, title, saveDocument, toggleStyle, handleCopy, handleCut, handleUndo, handleRedo]);

  // ─── Sheet tab operations ───
  const addSheet = useCallback(() => {
    pushUndo();
    setData(prev => {
      const newSheets = [...prev.sheets, emptySheet(`Sheet ${prev.sheets.length + 1}`)];
      const newData = { ...prev, sheets: newSheets, activeSheet: newSheets.length - 1 };
      debouncedSave(newData, title);
      return newData;
    });
  }, [pushUndo, debouncedSave, title]);

  const switchSheet = useCallback((index: number) => {
    commitEdit();
    setData(prev => ({ ...prev, activeSheet: index }));
    setCursor({ row: 0, col: 0 });
    setSelection({ start: { row: 0, col: 0 }, end: { row: 0, col: 0 } });
  }, [commitEdit]);

  const renameSheet = useCallback((index: number) => {
    const current = data.sheets[index].name;
    const newName = window.prompt('Rename sheet:', current);
    if (newName === null || newName.trim() === '' || newName.trim() === current) return;
    pushUndo();
    setData(prev => {
      const newSheets = [...prev.sheets];
      newSheets[index] = { ...newSheets[index], name: newName.trim() };
      const newData = { ...prev, sheets: newSheets };
      debouncedSave(newData, title);
      return newData;
    });
    setTabMenu(null);
  }, [data.sheets, pushUndo, debouncedSave, title]);

  const deleteSheet = useCallback((index: number) => {
    if (data.sheets.length <= 1) return;
    if (!window.confirm(`Delete "${data.sheets[index].name}"?`)) return;
    pushUndo();
    setData(prev => {
      const newSheets = prev.sheets.filter((_, i) => i !== index);
      const newActive = prev.activeSheet >= newSheets.length ? newSheets.length - 1 : prev.activeSheet > index ? prev.activeSheet - 1 : prev.activeSheet;
      const newData = { ...prev, sheets: newSheets, activeSheet: newActive };
      debouncedSave(newData, title);
      return newData;
    });
    setTabMenu(null);
  }, [data.sheets, pushUndo, debouncedSave, title]);

  const duplicateSheet = useCallback((index: number) => {
    pushUndo();
    setData(prev => {
      const src = prev.sheets[index];
      const copy: SheetData = JSON.parse(JSON.stringify(src));
      copy.name = `${src.name} (copy)`;
      const newSheets = [...prev.sheets];
      newSheets.splice(index + 1, 0, copy);
      const newData = { ...prev, sheets: newSheets, activeSheet: index + 1 };
      debouncedSave(newData, title);
      return newData;
    });
    setTabMenu(null);
  }, [pushUndo, debouncedSave, title]);

  const setTabColor = useCallback((index: number, color?: string) => {
    pushUndo();
    setData(prev => {
      const newSheets = [...prev.sheets];
      newSheets[index] = { ...newSheets[index], tabColor: color };
      const newData = { ...prev, sheets: newSheets };
      debouncedSave(newData, title);
      return newData;
    });
    setTabMenu(null);
  }, [pushUndo, debouncedSave, title]);

  // ─── Cell insertion & deletion ───
  const insertRow = useCallback((above: boolean) => {
    pushUndo();
    const targetRow = above ? cursor.row : cursor.row + 1;
    updateSheet(s => {
      const cells: Record<string, CellData> = {};
      for (const [key, cell] of Object.entries(s.cells)) {
        const [r, c] = key.split(',').map(Number);
        if (r >= targetRow) {
          cells[cellKey(r + 1, c)] = cell;
        } else {
          cells[key] = cell;
        }
      }
      return { ...s, cells };
    });
    setContextMenu(null);
  }, [cursor.row, pushUndo, updateSheet]);

  const insertCol = useCallback((before: boolean) => {
    pushUndo();
    const targetCol = before ? cursor.col : cursor.col + 1;
    updateSheet(s => {
      const cells: Record<string, CellData> = {};
      for (const [key, cell] of Object.entries(s.cells)) {
        const [r, c] = key.split(',').map(Number);
        if (c >= targetCol) {
          cells[cellKey(r, c + 1)] = cell;
        } else {
          cells[key] = cell;
        }
      }
      return { ...s, cells };
    });
    setContextMenu(null);
  }, [cursor.col, pushUndo, updateSheet]);

  const deleteRow = useCallback(() => {
    pushUndo();
    const targetRow = cursor.row;
    updateSheet(s => {
      const cells: Record<string, CellData> = {};
      for (const [key, cell] of Object.entries(s.cells)) {
        const [r, c] = key.split(',').map(Number);
        if (r === targetRow) continue;
        if (r > targetRow) {
          cells[cellKey(r - 1, c)] = cell;
        } else {
          cells[key] = cell;
        }
      }
      return { ...s, cells };
    });
    setContextMenu(null);
  }, [cursor.row, pushUndo, updateSheet]);

  const deleteCol = useCallback(() => {
    pushUndo();
    const targetCol = cursor.col;
    updateSheet(s => {
      const cells: Record<string, CellData> = {};
      for (const [key, cell] of Object.entries(s.cells)) {
        const [r, c] = key.split(',').map(Number);
        if (c === targetCol) continue;
        if (c > targetCol) {
          cells[cellKey(r, c - 1)] = cell;
        } else {
          cells[key] = cell;
        }
      }
      return { ...s, cells };
    });
    setContextMenu(null);
  }, [cursor.col, pushUndo, updateSheet]);

  const clearContents = useCallback(() => {
    if (!selection) return;
    pushUndo();
    const range = normalizeRange(selection);
    updateSheet(s => {
      const cells = { ...s.cells };
      for (let r = range.start.row; r <= range.end.row; r++)
        for (let c = range.start.col; c <= range.end.col; c++) {
          const k = cellKey(r, c);
          if (cells[k]?.s) cells[k] = { s: cells[k].s };
          else delete cells[k];
        }
      return { ...s, cells };
    });
  }, [selection, pushUndo, updateSheet]);

  const clearFormats = useCallback(() => {
    if (!selection) return;
    pushUndo();
    const range = normalizeRange(selection);
    updateSheet(s => {
      const cells = { ...s.cells };
      for (let r = range.start.row; r <= range.end.row; r++)
        for (let c = range.start.col; c <= range.end.col; c++) {
          const k = cellKey(r, c);
          if (cells[k]) {
            const nextCell = { ...cells[k] };
            delete nextCell.s;
            cells[k] = nextCell;
          }
        }
      return { ...s, cells };
    });
  }, [selection, pushUndo, updateSheet]);

  // ─── Sorting ───
  const handleSort = useCallback((ascending: boolean) => {
    if (!selection) return;
    pushUndo();
    const range = normalizeRange(selection);
    const colToSort = cursor.col;

    const rowIndices: number[] = [];
    for (let r = range.start.row; r <= range.end.row; r++) rowIndices.push(r);

    rowIndices.sort((a, b) => {
      const valA = sheet.cells[cellKey(a, colToSort)]?.v ?? '';
      const valB = sheet.cells[cellKey(b, colToSort)]?.v ?? '';
      const numA = typeof valA === 'number' ? valA : parseFloat(String(valA));
      const numB = typeof valB === 'number' ? valB : parseFloat(String(valB));
      const isNumA = !isNaN(numA);
      const isNumB = !isNaN(numB);

      const cmp = (isNumA && isNumB) ? (numA - numB) : String(valA).localeCompare(String(valB));
      return ascending ? cmp : -cmp;
    });

    updateSheet(s => {
      const cells = { ...s.cells };
      const snapshot: Record<string, CellData> = {};
      for (let r = range.start.row; r <= range.end.row; r++) {
        for (let c = range.start.col; c <= range.end.col; c++) {
          const k = cellKey(r, c);
          if (cells[k]) snapshot[k] = { ...cells[k] };
          delete cells[k];
        }
      }
      rowIndices.forEach((sourceRow, i) => {
        const targetRow = range.start.row + i;
        for (let c = range.start.col; c <= range.end.col; c++) {
          const srcCell = snapshot[cellKey(sourceRow, c)];
          if (srcCell) cells[cellKey(targetRow, c)] = srcCell;
        }
      });
      return { ...s, cells };
    });
  }, [selection, cursor.col, pushUndo, sheet.cells, updateSheet]);

  // ─── AutoSum & Formula Helpers ───
  const handleAutoSum = useCallback(() => {
    if (!selection) return;
    const range = normalizeRange(selection);
    if (range.start.row === range.end.row && range.start.col === range.end.col) {
      let topRow = cursor.row - 1;
      while (topRow >= 0 && sheet.cells[cellKey(topRow, cursor.col)]?.v !== undefined) {
        topRow--;
      }
      topRow++;
      if (topRow < cursor.row) {
        const f = `SUM(${cellLabel(topRow, cursor.col)}:${cellLabel(cursor.row - 1, cursor.col)})`;
        setCellValue(cursor.row, cursor.col, `=${f}`);
      } else {
        setCellValue(cursor.row, cursor.col, '=SUM()');
      }
    } else {
      const targetRow = range.end.row + 1;
      const targetCol = range.end.col;
      const f = `SUM(${cellLabel(range.start.row, range.start.col)}:${cellLabel(range.end.row, range.end.col)})`;
      setCellValue(targetRow, targetCol, `=${f}`);
      selectCell(targetRow, targetCol);
    }
  }, [selection, cursor, sheet.cells, setCellValue, selectCell]);

  const handleInsertFormula = useCallback((formulaName: string) => {
    setCellValue(cursor.row, cursor.col, `=${formulaName}()`);
    startEditing(cursor.row, cursor.col);
  }, [cursor, setCellValue, startEditing]);

  // ─── Find & Replace Logic ───
  const handleFindNext = useCallback((query: string, matchCase: boolean): boolean => {
    const startRow = cursor.row;
    const startCol = cursor.col;

    for (let pass = 0; pass < 2; pass++) {
      for (let r = 0; r < VISIBLE_ROWS; r++) {
        for (let c = 0; c < VISIBLE_COLS; c++) {
          if (pass === 0 && (r < startRow || (r === startRow && c <= startCol))) continue;
          if (pass === 1 && (r > startRow || (r === startRow && c >= startCol))) break;

          const cell = sheet.cells[cellKey(r, c)];
          const text = cell?.f ? `=${cell.f}` : String(cell?.v ?? '');
          const matches = matchCase ? text.includes(query) : text.toLowerCase().includes(query.toLowerCase());

          if (matches) {
            selectCell(r, c);
            setCursor({ row: r, col: c });
            return true;
          }
        }
      }
    }
    return false;
  }, [cursor, sheet.cells, selectCell]);

  const handleReplace = useCallback((query: string, replaceWith: string, matchCase: boolean): boolean => {
    const cell = sheet.cells[cellKey(cursor.row, cursor.col)];
    const text = cell?.f ? `=${cell.f}` : String(cell?.v ?? '');
    const matches = matchCase ? text.includes(query) : text.toLowerCase().includes(query.toLowerCase());

    if (matches) {
      const nextText = matchCase ? text.replaceAll(query, replaceWith) : text.replace(new RegExp(query, 'gi'), replaceWith);
      setCellValue(cursor.row, cursor.col, nextText);
      handleFindNext(query, matchCase);
      return true;
    }
    return handleFindNext(query, matchCase);
  }, [sheet.cells, cursor, setCellValue, handleFindNext]);

  const handleReplaceAll = useCallback((query: string, replaceWith: string, matchCase: boolean): number => {
    pushUndo();
    let count = 0;
    updateSheet(s => {
      const cells = { ...s.cells };
      for (const [key, cell] of Object.entries(cells)) {
        const text = cell.f ? `=${cell.f}` : String(cell.v ?? '');
        const matches = matchCase ? text.includes(query) : text.toLowerCase().includes(query.toLowerCase());
        if (matches) {
          const nextText = matchCase ? text.replaceAll(query, replaceWith) : text.replace(new RegExp(query, 'gi'), replaceWith);
          if (nextText.startsWith('=')) {
            cells[key] = { ...cell, f: nextText.slice(1), v: undefined };
          } else {
            const num = parseFloat(nextText);
            const val = !isNaN(num) && nextText.trim() === String(num) ? num : nextText;
            cells[key] = { ...cell, v: val, f: undefined };
          }
          count++;
        }
      }
      return { ...s, cells };
    });
    return count;
  }, [pushUndo, updateSheet]);

  // ─── Charts ───
  const handleInsertChart = useCallback((type: ChartType) => {
    const range = selection ? normalizeRange(selection) : { start: { row: 0, col: 0 }, end: { row: 3, col: 1 } };
    const labels: string[] = [];
    const seriesData: { name: string; data: number[] }[] = [];

    for (let r = range.start.row; r <= range.end.row; r++) {
      const labelVal = getCellDisplayValue(r, range.start.col);
      labels.push(String(labelVal || `Row ${r + 1}`));
    }

    const numSeriesCols = range.end.col - range.start.col;
    if (numSeriesCols === 0) {
      const dataCol: number[] = [];
      for (let r = range.start.row; r <= range.end.row; r++) {
        const v = parseFloat(String(getCellDisplayValue(r, range.start.col)));
        dataCol.push(isNaN(v) ? 0 : v);
      }
      seriesData.push({ name: 'Series 1', data: dataCol });
    } else {
      for (let c = range.start.col + 1; c <= range.end.col; c++) {
        const dataCol: number[] = [];
        for (let r = range.start.row; r <= range.end.row; r++) {
          const v = parseFloat(String(getCellDisplayValue(r, c)));
          dataCol.push(isNaN(v) ? 0 : v);
        }
        seriesData.push({ name: `Col ${colLabel(c)}`, data: dataCol });
      }
    }

    const newChart: ChartItem = {
      id: `chart-${Date.now()}`,
      type,
      title: `${sheet.name} ${type.toUpperCase()} Chart`,
      labels,
      series: seriesData,
      x: 80,
      y: 60,
      width: 420,
      height: 260,
    };

    updateSheet(s => ({
      ...s,
      charts: [...(s.charts || []), newChart],
    }));
  }, [selection, sheet.name, getCellDisplayValue, updateSheet]);

  const handleUpdateChart = useCallback((updated: ChartItem) => {
    updateSheet(s => ({
      ...s,
      charts: (s.charts || []).map(c => c.id === updated.id ? updated : c),
    }));
  }, [updateSheet]);

  const handleDeleteChart = useCallback((id: string) => {
    updateSheet(s => ({
      ...s,
      charts: (s.charts || []).filter(c => c.id !== id),
    }));
  }, [updateSheet]);

  // ─── Import / Export ───
  const exportXlsx = useCallback(async () => {
    try {
      const buffer = await exportWorkbookXlsx(data);
      const blob = new Blob([buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${title.replace(/[^a-zA-Z0-9 _-]/g, '')}.xlsx`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Export XLSX failed:', err);
      alert('Failed to export XLSX.');
    }
  }, [data, title]);

  const exportCsv = useCallback(() => {
    const s = sheet;
    let maxRow = 0, maxCol = 0;
    for (const key of Object.keys(s.cells)) {
      const [r, c] = key.split(',').map(Number);
      if (r > maxRow) maxRow = r;
      if (c > maxCol) maxCol = c;
    }
    const rows: string[] = [];
    for (let r = 0; r <= maxRow; r++) {
      const cols: string[] = [];
      for (let c = 0; c <= maxCol; c++) {
        const display = String(getCellDisplayValue(r, c));
        if (display.includes(',') || display.includes('"') || display.includes('\n')) {
          cols.push(`"${display.replace(/"/g, '""')}"`);
        } else {
          cols.push(display);
        }
      }
      rows.push(cols.join(','));
    }
    const blob = new Blob([rows.join('\n')], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${title.replace(/[^a-zA-Z0-9 _-]/g, '')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }, [sheet, getCellDisplayValue, title]);

  const importFile = useCallback(async (file: File) => {
    const ext = file.name.split('.').pop()?.toLowerCase();
    pushUndo();

    if (ext === 'xlsx' || ext === 'xls') {
      try {
        const buffer = await file.arrayBuffer();
        const newData = await importXlsx(buffer);
        setData(newData);
        setTitle(file.name.replace(/\.(xlsx|xls)$/i, ''));
        void saveDocument(newData, file.name.replace(/\.(xlsx|xls)$/i, ''));
      } catch (err) {
        console.error('XLSX import failed:', err);
        alert('Failed to import the XLSX file.');
      }
    } else if (ext === 'csv') {
      try {
        const text = await file.text();
        const s = emptySheet('Sheet 1');
        parseCsv(text).forEach((row, ri) => {
          row.forEach((val, ci) => {
            if (val === '') return;
            const num = parseFloat(val);
            const v = !isNaN(num) && val.trim() === String(num) ? num : val;
            s.cells[cellKey(ri, ci)] = { v };
          });
        });
        const newData: SpreadsheetData = { sheets: [s], activeSheet: 0 };
        setData(newData);
        setTitle(file.name.replace(/\.csv$/i, ''));
        void saveDocument(newData, file.name.replace(/\.csv$/i, ''));
      } catch (err) {
        console.error('CSV import failed:', err);
        alert('Failed to import the CSV file.');
      }
    }
  }, [pushUndo, saveDocument]);

  // ─── Status bar computations ───
  const statusInfo = useMemo(() => {
    if (!selection) return null;
    const range = normalizeRange(selection);
    const isSingle = range.start.row === range.end.row && range.start.col === range.end.col;
    if (isSingle) return null;

    let sum = 0, count = 0, numCount = 0;
    for (let r = range.start.row; r <= range.end.row; r++) {
      for (let c = range.start.col; c <= range.end.col; c++) {
        const v = getCellDisplayValue(r, c);
        if (v !== '') {
          count++;
          const n = parseFloat(v.replace(/[^0-9.-]/g, ''));
          if (!isNaN(n)) { sum += n; numCount++; }
        }
      }
    }
    return {
      sum: Math.round(sum * 1e10) / 1e10,
      count,
      average: numCount > 0 ? Math.round(sum / numCount * 1e10) / 1e10 : 0,
    };
  }, [selection, getCellDisplayValue]);

  // ─── Mouse selection ───
  const isSelectingRef = useRef(false);

  const handleCellMouseDown = useCallback((row: number, col: number, e: React.MouseEvent) => {
    if (e.button === 2) {
      selectCell(row, col);
      return;
    }
    if (editing) commitEdit();
    selectCell(row, col, e.shiftKey);
    if (!e.shiftKey) {
      setCursor({ row, col });
      setSelection({ start: { row, col }, end: { row, col } });
    }
    isSelectingRef.current = true;
  }, [editing, commitEdit, selectCell]);

  const handleCellMouseEnter = useCallback((row: number, col: number) => {
    if (isSelectingRef.current && selection) {
      setSelection(prev => prev ? { start: prev.start, end: { row, col } } : null);
    }
  }, [selection]);

  useEffect(() => {
    const up = () => { isSelectingRef.current = false; };
    window.addEventListener('mouseup', up);
    return () => window.removeEventListener('mouseup', up);
  }, []);

  // ─── Column resize ───
  const resizingCol = useRef<{ col: number; startX: number; startWidth: number } | null>(null);

  const handleColResizeStart = useCallback((col: number, e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    const startWidth = sheet.colWidths[col] ?? DEFAULT_COL_WIDTH;
    resizingCol.current = { col, startX: e.clientX, startWidth };

    const onMove = (ev: MouseEvent) => {
      if (!resizingCol.current) return;
      const delta = ev.clientX - resizingCol.current.startX;
      const newWidth = Math.max(40, resizingCol.current.startWidth + delta);
      updateSheet(s => ({
        ...s,
        colWidths: { ...s.colWidths, [resizingCol.current!.col]: newWidth },
      }));
    };
    const onUp = () => {
      resizingCol.current = null;
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  }, [sheet.colWidths, updateSheet]);

  // ─── Namebox navigation ───
  const handleNameboxKeyDown = useCallback((e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      const ref = parseCellRef(e.currentTarget.value.trim());
      if (ref) {
        selectCell(ref.row, ref.col);
        setCursor(ref);
        gridRef.current?.focus();
      }
    }
  }, [selectCell]);

  // ─── Formula bar editing ───
  const handleFormulaBarFocus = useCallback(() => {
    if (!editing) {
      startEditing(cursor.row, cursor.col, undefined, 'formula');
    }
  }, [editing, cursor, startEditing]);

  const handleFormulaBarChange = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    if (!editing) {
      startEditing(cursor.row, cursor.col, e.target.value, 'formula');
    } else {
      dispatchEdit({ type: 'update', value: e.target.value });
    }
  }, [editing, cursor, startEditing]);

  const handleFormulaBarKeyDown = useCallback((e: React.KeyboardEvent) => {
    const action = editKeyAction(e.key);
    if (action === 'commit') {
      e.preventDefault();
      commitEdit();
      const newRow = Math.min(VISIBLE_ROWS - 1, cursor.row + 1);
      selectCell(newRow, cursor.col);
      setCursor(prev => ({ ...prev, row: newRow }));
    } else if (action === 'cancel') {
      cancelEdit();
    }
  }, [commitEdit, cancelEdit, cursor, selectCell]);

  // ─── Context menu ───
  const handleContextMenu = useCallback((e: React.MouseEvent) => {
    e.preventDefault();
    setContextMenu({ x: e.clientX, y: e.clientY });
  }, []);

  useEffect(() => {
    const handler = () => { setContextMenu(null); setTabMenu(null); };
    if (contextMenu || tabMenu !== null) {
      document.addEventListener('click', handler);
      return () => document.removeEventListener('click', handler);
    }
  }, [contextMenu, tabMenu]);

  const cursorCell = sheet.cells[cellKey(cursor.row, cursor.col)];
  const cursorStyle = cursorCell?.s;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const gridlinesVisible = sheet.showGridLines ?? showGridlines;
  const mergedCells = useMemo(() => {
    const ranges = new Map<string, { rowSpan: number; colSpan: number } | null>();
    for (const range of sheet.mergedCells ?? []) {
      const [startAddress, endAddress = startAddress] = range.split(':');
      const start = parseCellRef(startAddress);
      const end = parseCellRef(endAddress);
      if (!start || !end) continue;
      const rowSpan = Math.min(VISIBLE_ROWS - start.row, Math.abs(end.row - start.row) + 1);
      const colSpan = Math.min(VISIBLE_COLS - start.col, Math.abs(end.col - start.col) + 1);
      if (rowSpan < 1 || colSpan < 1) continue;
      ranges.set(cellKey(start.row, start.col), { rowSpan, colSpan });
      for (let row = start.row; row < start.row + rowSpan; row++) {
        for (let col = start.col; col < start.col + colSpan; col++) {
          if (row !== start.row || col !== start.col) ranges.set(cellKey(row, col), null);
        }
      }
    }
    return ranges;
  }, [sheet.mergedCells]);

  const rowOffset = (row: number) => {
    let offset = showHeadings ? 24 : 0;
    for (let index = 0; index < row; index++) offset += sheet.rowHeights[index] ?? DEFAULT_ROW_HEIGHT;
    return offset;
  };
  const colOffset = (col: number) => {
    let offset = showHeadings ? 40 : 0;
    for (let index = 0; index < col; index++) offset += sheet.colWidths[index] ?? DEFAULT_COL_WIDTH;
    return offset;
  };

  if (!loaded) {
    return (
      <div className="spreadsheet-app" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: '#888' }}>Loading spreadsheet…</span>
      </div>
    );
  }

  return (
    <div className="spreadsheet-app">
      {/* ─── Topbar ─── */}
      <div className="ss-topbar">
        <button className="ss-topbar-back" onClick={onBack}>
          <ArrowLeft size={16} /> Back
        </button>
        <div className="ss-topbar-title">
          <FileSpreadsheet size={18} style={{ color: 'var(--ss-accent)', flexShrink: 0 }} />
          <input
            value={title}
            onChange={e => { setTitle(e.target.value); debouncedSave(data, e.target.value); }}
            onBlur={() => void saveDocument(data, title)}
            spellCheck={false}
          />
          {saveStatus && <span className="ss-save-status">{saveStatus}</span>}
        </div>
        <div className="ss-topbar-actions">
          <button onClick={() => void saveDocument(data, title)} title="Save (Ctrl+S)"><Save size={16} /> Save</button>
          <button onClick={() => fileInputRef.current?.click()} title="Import XLSX/CSV"><Upload size={16} /> Import</button>
          <input
            ref={fileInputRef}
            type="file"
            accept=".xlsx,.xls,.csv"
            style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) void importFile(f); e.target.value = ''; }}
          />
          <button className="ss-btn-export" onClick={() => void exportXlsx()} title="Export as XLSX"><Download size={16} /> Export XLSX</button>
          <button onClick={exportCsv} title="Export as CSV"><Download size={16} /> CSV</button>
        </div>
      </div>

      {/* ─── Excel-Style Ribbon ─── */}
      <Ribbon
        activeTab={activeRibbonTab}
        onSelectTab={setActiveRibbonTab}
        canUndo={undoStack.length > 0}
        canRedo={redoStack.length > 0}
        onUndo={handleUndo}
        onRedo={handleRedo}
        onCopy={handleCopy}
        onCut={handleCut}
        onPaste={() => void handlePaste()}
        cursorStyle={cursorStyle ? {
          ...cursorStyle,
          align: cursorStyle.align === 'left' || cursorStyle.align === 'center' || cursorStyle.align === 'right'
            ? cursorStyle.align
            : undefined,
          color: cellColorToCss(cursorStyle.color),
          bg: cellColorToCss(cursorStyle.bg),
          border: typeof cursorStyle.border === 'string' ? cursorStyle.border : undefined,
        } : undefined}
        onToggleStyle={toggleStyle}
        onSetAlignment={setAlignment}
        onSetFontSize={setFontSize}
        onSetColor={setColor}
        onSetBg={setBg}
        onSetBorder={setBorder}
        onSetNumberFormat={setNumberFormat}
        onAdjustDecimals={adjustDecimals}
        onInsertRow={insertRow}
        onInsertCol={insertCol}
        onDeleteRow={deleteRow}
        onDeleteCol={deleteCol}
        onClearContents={clearContents}
        onClearFormats={clearFormats}
        onAutoSum={handleAutoSum}
        onInsertFormula={handleInsertFormula}
        onSort={handleSort}
        onOpenFindReplace={() => setFindReplaceOpen(true)}
        onInsertChart={handleInsertChart}
        showFormulaBar={showFormulaBar}
        onToggleFormulaBar={() => setShowFormulaBar(!showFormulaBar)}
        showGridlines={gridlinesVisible}
        onToggleGridlines={() => {
          const next = !gridlinesVisible;
          setShowGridlines(next);
          updateSheet(current => ({ ...current, showGridLines: next }));
        }}
        showHeadings={showHeadings}
        onToggleHeadings={() => setShowHeadings(!showHeadings)}
        freezeRow={freezeRow}
        onToggleFreezeRow={() => setFreezeRow(!freezeRow)}
        freezeCol={freezeCol}
        onToggleFreezeCol={() => setFreezeCol(!freezeCol)}
        zoom={zoom}
        onSetZoom={setZoom}
      />

      {/* ─── Formula Bar ─── */}
      {showFormulaBar && (
        <div className="ss-formulabar">
          <input
            className="ss-namebox"
            value={cellLabel(cursor.row, cursor.col)}
            onKeyDown={handleNameboxKeyDown}
            onChange={() => {}}
            spellCheck={false}
          />
          <span className="ss-fx-label">fx</span>
          <input
            ref={formulaInputRef}
            className="ss-formulabar-input"
            value={editing ? editValue : getCellRawDisplay(cursor.row, cursor.col)}
            onFocus={handleFormulaBarFocus}
            onChange={handleFormulaBarChange}
            onKeyDown={handleFormulaBarKeyDown}
            onBlur={commitEdit}
            spellCheck={false}
          />
        </div>
      )}

      {/* ─── Grid Container & Chart Layer ─── */}
      <div
        className="ss-grid-wrapper"
        ref={gridRef}
        tabIndex={0}
        onKeyDown={handleGridKeyDown}
        onContextMenu={handleContextMenu}
        onPaste={handleGridPaste}
      >
        {/* Render Interactive Charts */}
        {(sheet.charts || []).map(chart => (
          <ChartOverlay
            key={chart.id}
            chart={chart}
            onUpdate={handleUpdateChart}
            onDelete={handleDeleteChart}
          />
        ))}

        <div className="ss-grid-scroller" style={{ transform: zoom !== 1 ? `scale(${zoom})` : undefined, transformOrigin: 'top left' }}>
          <table className={`ss-grid ${!gridlinesVisible ? 'no-gridlines' : ''}`}>
            {showHeadings && (
              <thead>
                <tr>
                  <th
                    className="ss-corner"
                    onClick={() => {
                      setSelection({ start: { row: 0, col: 0 }, end: { row: VISIBLE_ROWS - 1, col: VISIBLE_COLS - 1 } });
                    }}
                  />
                  {Array.from({ length: VISIBLE_COLS }, (_, c) => (
                    <th
                      key={c}
                      className={`ss-col-header ${selection && c >= normalizeRange(selection).start.col && c <= normalizeRange(selection).end.col ? 'selected' : ''}`}
                      style={{
                        width: sheet.colWidths[c] ?? DEFAULT_COL_WIDTH,
                        position: 'sticky',
                        top: 0,
                        zIndex: 10,
                        display: sheet.hiddenCols?.[c] ? 'none' : undefined,
                      }}
                      onClick={() => {
                        setSelection({ start: { row: 0, col: c }, end: { row: VISIBLE_ROWS - 1, col: c } });
                        setCursor({ row: 0, col: c });
                      }}
                    >
                      {colLabel(c)}
                      <div className="ss-col-resize" onMouseDown={e => handleColResizeStart(c, e)} />
                    </th>
                  ))}
                </tr>
              </thead>
            )}
            <tbody>
              {Array.from({ length: VISIBLE_ROWS }, (_, r) => (
                <tr key={r} style={{
                  height: sheet.rowHeights[r] ?? DEFAULT_ROW_HEIGHT,
                  display: sheet.hiddenRows?.[r] ? 'none' : undefined,
                }}>
                  {showHeadings && (
                    <td
                      className={`ss-row-header ${selection && r >= normalizeRange(selection).start.row && r <= normalizeRange(selection).end.row ? 'selected' : ''}`}
                      style={{
                        position: 'sticky',
                        left: 0,
                        zIndex: 9,
                        display: sheet.hiddenRows?.[r] ? 'none' : undefined,
                      }}
                      onClick={() => {
                        setSelection({ start: { row: r, col: 0 }, end: { row: r, col: VISIBLE_COLS - 1 } });
                        setCursor({ row: r, col: 0 });
                      }}
                    >
                      {r + 1}
                    </td>
                  )}
                  {Array.from({ length: VISIBLE_COLS }, (_, c) => {
                    const cell = sheet.cells[cellKey(r, c)];
                    const style = cell?.s;
                    const merge = mergedCells.get(cellKey(r, c));
                    if (mergedCells.has(cellKey(r, c)) && merge === null) return null;
                    const isEditing = editSource === 'cell' && editing?.row === r && editing?.col === c;
                    const isSelected = cursor.row === r && cursor.col === c;
                    const inRange = selection ? isInRange(r, c, selection) : false;
                    const displayValue = getCellDisplayValue(r, c);
                    const tableAppearance = getTableCellAppearance(sheet, r, c);

                    const cellStyle: React.CSSProperties = {
                      width: sheet.colWidths[c] ?? DEFAULT_COL_WIDTH,
                      minWidth: sheet.colWidths[c] ?? DEFAULT_COL_WIDTH,
                    };
                    const fontColor = cellColorToCss(style?.color) ?? tableAppearance?.color;
                    const backgroundColor = cellColorToCss(style?.bg) ??
                      cellColorToCss(style?.fill?.fgColor) ?? tableAppearance?.background;
                    if (fontColor) cellStyle.color = fontColor;
                    if (backgroundColor) cellStyle.backgroundColor = backgroundColor;
                    if (style?.fill?.type === 'gradient' && style.fill.stops?.length) {
                      const stops = style.fill.stops.map(stop => {
                        const color = cellColorToCss(stop.color);
                        return color ? `${color} ${stop.position * 100}%` : '';
                      }).filter(Boolean);
                      if (stops.length) {
                        cellStyle.background = style.fill.gradient === 'path'
                          ? `radial-gradient(circle, ${stops.join(', ')})`
                          : `linear-gradient(${style.fill.degree ?? 0}deg, ${stops.join(', ')})`;
                      }
                    }
                    if (style?.fontSize) cellStyle.fontSize = style.fontSize;
                    if (style?.fontFamily) cellStyle.fontFamily = style.fontFamily;
                    if (style?.verticalAlign) {
                      cellStyle.verticalAlign = style.verticalAlign === 'top' || style.verticalAlign === 'bottom'
                        ? style.verticalAlign
                        : 'middle';
                    }
                    if (style?.indent) cellStyle.paddingLeft = `${4 + style.indent * 10}px`;
                    if (typeof style?.border === 'object') {
                      for (const side of ['top', 'right', 'bottom', 'left'] as const) {
                        const edge = style.border[side];
                        if (!edge?.style) continue;
                        const widths: Record<string, string> = { hair: '1px', thin: '1px', medium: '2px', thick: '3px', double: '3px' };
                        const lineStyle = edge.style === 'double' ? 'double' :
                          edge.style.toLowerCase().includes('dash') || edge.style === 'dotted' ? 'dashed' : 'solid';
                        const css = `${widths[edge.style] ?? '1px'} ${lineStyle} ${cellColorToCss(edge.color) ?? '#777'}`;
                        const property = `border${side[0].toUpperCase()}${side.slice(1)}` as 'borderTop' | 'borderRight' | 'borderBottom' | 'borderLeft';
                        cellStyle[property] = css;
                      }
                    }
                    if (sheet.hiddenCols?.[c]) cellStyle.display = 'none';

                    // Sticky freeze support
                    const frozenRows = Math.max(freezeRow ? 1 : 0, sheet.frozenRows ?? 0);
                    const frozenCols = Math.max(freezeCol ? 1 : 0, sheet.frozenCols ?? 0);
                    if (r < frozenRows) {
                      cellStyle.position = 'sticky';
                      cellStyle.top = rowOffset(r);
                      cellStyle.zIndex = 4;
                    }
                    if (c < frozenCols) {
                      cellStyle.position = 'sticky';
                      cellStyle.left = colOffset(c);
                      cellStyle.zIndex = r < frozenRows ? 6 : 4;
                    }

                    const classes = ['ss-cell'];
                    if (isSelected && !isEditing) classes.push('selected');
                    if (inRange && !isSelected) classes.push('in-range');
                    if (isEditing) classes.push('editing');
                    if (style?.bold) classes.push('bold');
                    if (style?.italic) classes.push('italic');
                    if (style?.underline) classes.push('underline');
                    if (style?.strikethrough) classes.push('strikethrough');
                    if (style?.wrapText) classes.push('wrap-text');
                    if (style?.border && typeof style.border === 'string') classes.push(`border-${style.border}`);
                    if (style?.align) {
                      const textAlignment: Record<NonNullable<CellStyle['align']>, React.CSSProperties['textAlign']> = {
                        left: 'left',
                        center: 'center',
                        right: 'right',
                        fill: 'right',
                        justify: 'justify',
                        centerContinuous: 'center',
                        distributed: 'justify',
                      };
                      cellStyle.textAlign = textAlignment[style.align];
                      if (['left', 'center', 'right'].includes(style.align)) classes.push(`align-${style.align}`);
                    }
                    if (tableAppearance?.bold) classes.push('bold');
                    if (!style?.align && !tableAppearance && (typeof cell?.v === 'number' || (displayValue && !isNaN(parseFloat(displayValue))))) classes.push('align-right');

                    return (
                      <td
                        key={c}
                        className={classes.join(' ')}
                        style={cellStyle}
                        colSpan={merge?.colSpan}
                        rowSpan={merge?.rowSpan}
                        onMouseDown={e => handleCellMouseDown(r, c, e)}
                        onMouseEnter={() => handleCellMouseEnter(r, c)}
                        onDoubleClick={() => startEditing(r, c)}
                      >
                        {isEditing ? (
                          <input
                            ref={editInputRef}
                            className="ss-cell-input"
                            value={editValue}
                            onChange={e => dispatchEdit({ type: 'update', value: e.target.value })}
                            onKeyDown={e => {
                              const action = editKeyAction(e.key);
                              if (action === 'commit') {
                                e.preventDefault();
                                commitEdit();
                                const newRow = Math.min(VISIBLE_ROWS - 1, cursor.row + 1);
                                selectCell(newRow, cursor.col);
                                setCursor(prev => ({ ...prev, row: newRow }));
                              } else if (e.key === 'Tab') {
                                e.preventDefault();
                                commitEdit();
                                const dir = e.shiftKey ? -1 : 1;
                                const newCol = Math.max(0, Math.min(VISIBLE_COLS - 1, cursor.col + dir));
                                selectCell(cursor.row, newCol);
                                setCursor(prev => ({ ...prev, col: newCol }));
                              } else if (action === 'cancel') {
                                cancelEdit();
                              }
                            }}
                            onBlur={commitEdit}
                            spellCheck={false}
                            autoFocus
                          />
                        ) : (
                          displayValue
                        )}
                        {isSelected && !isEditing && <div className="ss-fill-handle" />}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* ─── Sheet Tabs ─── */}
      <div className="ss-sheet-tabs">
        {data.sheets.map((s, i) => (
          <button
            key={i}
            className={`ss-sheet-tab ${i === data.activeSheet ? 'active' : ''}`}
            style={{ borderBottomColor: cellColorToCss(s.tabColor) || (i === data.activeSheet ? 'var(--ss-accent)' : 'transparent') }}
            onClick={() => switchSheet(i)}
            onContextMenu={e => { e.preventDefault(); e.stopPropagation(); setTabMenu(i); }}
            onDoubleClick={() => renameSheet(i)}
          >
            {s.name}
          </button>
        ))}
        <button className="ss-add-sheet" onClick={addSheet} title="Add sheet">
          <Plus size={16} />
        </button>
        {tabMenu !== null && (
          <div className="ss-tab-menu" style={{ left: tabMenu * 100 + 10 }} onClick={e => e.stopPropagation()}>
            <button onClick={() => renameSheet(tabMenu)}>Rename</button>
            <button onClick={() => duplicateSheet(tabMenu)}>Duplicate</button>
            <button onClick={() => {
              const color = prompt('Tab color hex (e.g. #ef4444, #3b82f6):', '#22c55e');
              if (color) setTabColor(tabMenu, color);
            }}>
              Tab Color
            </button>
            {data.sheets.length > 1 && <button onClick={() => deleteSheet(tabMenu)}>Delete</button>}
          </div>
        )}
      </div>

      {/* ─── Status Bar ─── */}
      <div className="ss-statusbar">
        <span className="ss-statusbar-item">{cellLabel(cursor.row, cursor.col)}</span>
        {statusInfo && (
          <>
            <span className="ss-statusbar-item">Sum: {statusInfo.sum}</span>
            <span className="ss-statusbar-item">Average: {statusInfo.average}</span>
            <span className="ss-statusbar-item">Count: {statusInfo.count}</span>
          </>
        )}
        <span className="ss-statusbar-item" style={{ marginLeft: 'auto' }}>
          {data.sheets.length} sheet{data.sheets.length > 1 ? 's' : ''} | {Math.round(zoom * 100)}%
        </span>
      </div>

      {/* ─── Context Menu ─── */}
      {contextMenu && (
        <div className="ss-context-menu" style={{ top: contextMenu.y, left: contextMenu.x }} onClick={e => e.stopPropagation()}>
          <button onClick={handleCopy}><Copy size={14} /> Copy</button>
          <button onClick={handleCut}><Scissors size={14} /> Cut</button>
          <button onClick={() => { void handlePaste(); setContextMenu(null); }}><ClipboardPaste size={14} /> Paste</button>
          <div className="ss-context-menu-sep" />
          <button onClick={() => insertRow(true)}><Plus size={14} /> Insert row above</button>
          <button onClick={() => insertRow(false)}><Plus size={14} /> Insert row below</button>
          <button onClick={() => insertCol(true)}><Plus size={14} /> Insert column left</button>
          <button onClick={() => insertCol(false)}><Plus size={14} /> Insert column right</button>
          <div className="ss-context-menu-sep" />
          <button onClick={deleteRow}><Trash2 size={14} /> Delete row</button>
          <button onClick={deleteCol}><Trash2 size={14} /> Delete column</button>
          <div className="ss-context-menu-sep" />
          <button onClick={clearContents}><Trash2 size={14} /> Clear contents</button>
          <button onClick={clearFormats}>Clear formats</button>
        </div>
      )}

      {/* ─── Find & Replace Dialog ─── */}
      <FindReplaceModal
        isOpen={findReplaceOpen}
        onClose={() => setFindReplaceOpen(false)}
        onFindNext={handleFindNext}
        onReplace={handleReplace}
        onReplaceAll={handleReplaceAll}
      />
    </div>
  );
}
