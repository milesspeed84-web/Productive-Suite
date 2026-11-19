import { HyperFormula } from 'hyperformula';

export interface SheetCellValues {
  [rowColKey: string]: {
    v?: string | number;
    f?: string;
  };
}

export interface SheetRawData {
  name: string;
  cells: SheetCellValues;
}

export class SpreadsheetFormulaEngine {
  private hf: HyperFormula | null = null;
  private sheetIdMap: Map<string, number> = new Map();

  constructor() {
    this.init();
  }

  private init() {
    try {
      this.hf = HyperFormula.buildEmpty({
        licenseKey: 'gpl-v3',
        useColumnIndex: true,
      });
    } catch (e) {
      console.warn('HyperFormula initialization failed, falling back to basic evaluation', e);
      this.hf = null;
    }
  }

  public syncWorkbook(sheets: SheetRawData[], maxRows = 100, maxCols = 26) {
    if (!this.hf) return;

    try {
      const currentSheets = this.hf.getSheetNames();
      for (const name of currentSheets) {
        try {
          const id = this.hf.getSheetId(name);
          if (id !== undefined) {
            this.hf.removeSheet(id);
          }
        } catch { /* ignore */ }
      }
      this.sheetIdMap.clear();

      for (const s of sheets) {
        this.hf.addSheet(s.name);
        const sheetId = this.hf.getSheetId(s.name);
        if (sheetId === undefined) continue;
        this.sheetIdMap.set(s.name, sheetId);

        let sheetMaxRow = 0;
        let sheetMaxCol = 0;
        for (const key of Object.keys(s.cells)) {
          const [r, c] = key.split(',').map(Number);
          if (r > sheetMaxRow) sheetMaxRow = r;
          if (c > sheetMaxCol) sheetMaxCol = c;
        }
        const effectiveRows = Math.max(1, Math.min(maxRows, sheetMaxRow + 1));
        const effectiveCols = Math.max(1, Math.min(maxCols, sheetMaxCol + 1));

        const grid: (string | number | boolean | null)[][] = [];
        for (let r = 0; r < effectiveRows; r++) {
          const row: (string | number | boolean | null)[] = [];
          for (let c = 0; c < effectiveCols; c++) {
            const cell = s.cells[`${r},${c}`];
            if (cell?.f) {
              row.push(`=${cell.f}`);
            } else if (cell?.v !== undefined && cell?.v !== '') {
              row.push(cell.v);
            } else {
              row.push(null);
            }
          }
          grid.push(row);
        }

        this.hf.setSheetContent(sheetId, grid);
      }
    } catch (err) {
      console.warn('HyperFormula sync error:', err);
    }
  }

  public getCellValue(sheetName: string, row: number, col: number): string | number | boolean | undefined {
    if (!this.hf) return undefined;
    const sheetId = this.sheetIdMap.get(sheetName);
    if (sheetId === undefined) return undefined;

    try {
      const val = this.hf.getCellValue({ sheet: sheetId, row, col });
      if (val === null || val === undefined) return '';
      if (typeof val === 'object') {
        return (val as { value?: string }).value ?? '#ERROR!';
      }
      return val;
    } catch {
      return '#ERROR!';
    }
  }

  public isAvailable(): boolean {
    return this.hf !== null;
  }
}

export const formulaEngine = new SpreadsheetFormulaEngine();
