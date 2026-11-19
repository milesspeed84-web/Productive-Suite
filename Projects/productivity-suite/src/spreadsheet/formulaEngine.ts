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

/** Shift a formula by a relative row/column offset, preserving $-anchored references. */
export function copyFormulaRelative(formula: string, rowOffset: number, colOffset: number): string {
  if (!formula) return formula;
  let inString = false;
  let out = '';
  const referencePattern = /(^|[^A-Za-z0-9_])((?:'[^']+'|[A-Za-z_][A-Za-z0-9_]*)!)?(\$?)([A-Za-z]{1,3})(\$?)([0-9]+)(?![A-Za-z0-9_])/g;

  for (let i = 0; i < formula.length;) {
    if (formula[i] === '"') {
      inString = !inString;
      out += formula[i++];
      continue;
    }
    if (inString) {
      out += formula[i++];
      continue;
    }

    const rest = formula.slice(i);
    referencePattern.lastIndex = 0;
    const match = referencePattern.exec(rest);
    if (!match || match.index !== 0) {
      out += formula[i++];
      continue;
    }

    const prefix = match[1];
    const sheetQualifier = match[2];
    const absoluteCol = match[3] === '$';
    const colLetters = match[4];
    const absoluteRow = match[5] === '$';
    const rowNumber = Number(match[6]);

    let col = 0;
    for (const char of colLetters.toUpperCase()) col = col * 26 + char.charCodeAt(0) - 64;
    col--;

    const nextCol = absoluteCol ? col : col + colOffset;
    const nextRow = absoluteRow ? rowNumber - 1 : rowNumber - 1 + rowOffset;

    if (nextCol < 0 || nextRow < 0) {
      out += prefix + (sheetQualifier ?? '') + match[3] + colLetters + match[5] + match[6];
    } else {
      let letters = '';
      let value = nextCol + 1;
      while (value > 0) {
        value--;
        letters = String.fromCharCode(65 + (value % 26)) + letters;
        value = Math.floor(value / 26);
      }
      out += prefix + (sheetQualifier ?? '') + (absoluteCol ? '$' : '') + letters + (absoluteRow ? '$' : '') + (nextRow + 1);
    }

    i += match[0].length;
  }

  return out;
}

export class SpreadsheetFormulaEngine {
  private hf: HyperFormula | null = null;
  private sheetIdMap: Map<string, number> = new Map();

  constructor() {
    this.init();
  }

  private init() {
    try {
      this.hf = HyperFormula.buildEmpty({ licenseKey: 'gpl-v3', useColumnIndex: true });
    } catch (error) {
      console.warn('HyperFormula initialization failed, falling back to basic evaluation', error);
      this.hf = null;
    }
  }

  public syncWorkbook(sheets: SheetRawData[], maxRows = 100, maxCols = 26) {
    if (!this.hf) return;

    try {
      // Rebuild is intentional: it removes stale sheet IDs, recalculates the complete
      // dependency graph, and guarantees formulas after add/delete/rename are consistent.
      this.hf = HyperFormula.buildEmpty({ licenseKey: 'gpl-v3', useColumnIndex: true });
      this.sheetIdMap.clear();

      for (const sheet of sheets) {
        this.hf.addSheet(sheet.name);
        const sheetId = this.hf.getSheetId(sheet.name);
        if (sheetId === undefined) continue;
        this.sheetIdMap.set(sheet.name, sheetId);

        let sheetMaxRow = 0;
        let sheetMaxCol = 0;
        for (const key of Object.keys(sheet.cells)) {
          const [row, col] = key.split(',').map(Number);
          sheetMaxRow = Math.max(sheetMaxRow, row);
          sheetMaxCol = Math.max(sheetMaxCol, col);
        }

        const effectiveRows = Math.max(1, Math.min(maxRows, sheetMaxRow + 1));
        const effectiveCols = Math.max(1, Math.min(maxCols, sheetMaxCol + 1));
        const grid: (string | number | boolean | null)[][] = [];

        for (let row = 0; row < effectiveRows; row++) {
          const rowValues: (string | number | boolean | null)[] = [];
          for (let col = 0; col < effectiveCols; col++) {
            const cell = sheet.cells[`${row},${col}`];
            if (cell?.f) rowValues.push(`=${cell.f}`);
            else if (cell?.v !== undefined && cell?.v !== '') rowValues.push(cell.v);
            else rowValues.push(null);
          }
          grid.push(rowValues);
        }

        this.hf.setSheetContent(sheetId, grid);
      }
    } catch (error) {
      console.warn('HyperFormula sync error:', error);
    }
  }

  public getCellValue(sheetName: string, row: number, col: number): string | number | boolean | undefined {
    if (!this.hf) return undefined;
    const sheetId = this.sheetIdMap.get(sheetName);
    if (sheetId === undefined) return undefined;

    try {
      const value = this.hf.getCellValue({ sheet: sheetId, row, col });
      if (value === null || value === undefined) return '';
      if (typeof value === 'object') {
        if ('value' in value && typeof value.value === 'string') return value.value;
        return '#ERROR!';
      }
      return value;
    } catch {
      return '#ERROR!';
    }
  }

  public isAvailable(): boolean {
    return this.hf !== null;
  }
}

export const formulaEngine = new SpreadsheetFormulaEngine();
