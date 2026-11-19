import type {
  Cell as ExcelCell,
  Color,
  Fill,
  FillPatterns,
  TableColumnProperties,
  TableProperties,
  Worksheet,
} from 'exceljs';
import type {
  CellBorders,
  CellColor,
  CellData,
  CellFill,
  CellStyle,
  SheetData,
  SpreadsheetData,
  TableData,
} from './types';

type CellColorValue = Partial<Color>;

function keepColor(color?: CellColorValue): CellColor | undefined {
  if (!color || (color.argb === undefined && color.theme === undefined)) return undefined;
  return {
    ...(color.argb !== undefined ? { argb: color.argb } : {}),
    ...(color.theme !== undefined ? { theme: color.theme } : {}),
  };
}

function keepFill(fill: Fill | undefined): CellFill | undefined {
  if (!fill) return undefined;
  if (fill.type === 'pattern') {
    return {
      type: fill.type,
      pattern: fill.pattern,
      ...(fill.fgColor ? { fgColor: keepColor(fill.fgColor) } : {}),
      ...(fill.bgColor ? { bgColor: keepColor(fill.bgColor) } : {}),
    };
  }
  if (fill.type === 'gradient') {
    return {
      type: fill.type,
      gradient: fill.gradient,
      ...('degree' in fill ? { degree: fill.degree } : {}),
      ...('center' in fill ? { center: fill.center } : {}),
      stops: fill.stops.map(stop => ({
        position: stop.position,
        color: keepColor(stop.color) ?? {},
      })),
    };
  }
  return undefined;
}

function keepBorders(cell: ExcelCell): CellBorders | undefined {
  const result: CellBorders = {};
  const borders = cell.border ?? {};
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const borderSide = borders[side];
    if (!borderSide?.style && !borderSide?.color) continue;
    result[side] = {
      ...(borderSide.style ? { style: borderSide.style } : {}),
      ...(borderSide.color ? { color: keepColor(borderSide.color) } : {}),
    };
  }
  return Object.keys(result).length ? result : undefined;
}

function keepCellStyle(cell: ExcelCell): CellStyle | undefined {
  const style: CellStyle = {};
  const font = cell.font ?? {};
  if (font.bold) style.bold = true;
  if (font.italic) style.italic = true;
  if (font.underline && font.underline !== 'none') style.underline = true;
  if (font.strike) style.strikethrough = true;
  if (font.color) style.color = keepColor(font.color);
  if (font.name) style.fontFamily = font.name;
  if (font.size) style.fontSize = font.size;

  const alignment = cell.alignment ?? {};
  if (alignment.horizontal) style.align = alignment.horizontal;
  if (alignment.vertical) style.verticalAlign = alignment.vertical;
  if (alignment.wrapText) style.wrapText = true;
  if (alignment.shrinkToFit) style.shrinkToFit = true;
  if (alignment.indent) style.indent = alignment.indent;
  if (alignment.textRotation !== undefined && alignment.textRotation !== 0) {
    style.textRotation = alignment.textRotation;
  }

  const fill = keepFill(cell.fill);
  if (fill) {
    style.fill = fill;
    if (fill.type === 'pattern' && fill.pattern === 'solid') style.bg = fill.fgColor;
  }
  const border = keepBorders(cell);
  if (border) style.border = border;
  if (cell.numFmt && cell.numFmt !== 'General') style.numberFormat = cell.numFmt;
  return Object.keys(style).length ? style : undefined;
}

function excelDateSerial(value: Date): number {
  return (value.getTime() - Date.UTC(1899, 11, 30)) / 86_400_000;
}

function scalarValue(value: unknown): string | number | boolean | undefined {
  if (value === null || value === undefined) return undefined;
  if (value instanceof Date) return excelDateSerial(value);
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') return value;
  return undefined;
}

interface ExcelTableModel {
  name: string;
  displayName?: string;
  ref?: string;
  tableRef?: string;
  headerRow: boolean;
  totalsRow: boolean;
  style?: {
    theme?: string;
    showFirstColumn?: boolean;
    showLastColumn?: boolean;
    showRowStripes?: boolean;
    showColumnStripes?: boolean;
  };
  columns: TableColumnProperties[];
}

function isExcelTableModel(value: unknown): value is ExcelTableModel {
  if (typeof value !== 'object' || value === null) return false;
  return 'name' in value && typeof value.name === 'string' &&
    (('ref' in value && typeof value.ref === 'string') ||
      ('tableRef' in value && typeof value.tableRef === 'string')) &&
    'headerRow' in value && typeof value.headerRow === 'boolean' &&
    'totalsRow' in value && typeof value.totalsRow === 'boolean' &&
    'columns' in value && Array.isArray(value.columns);
}

function tableMetadata(worksheet: Worksheet): TableData[] {
  const entries: unknown[] = worksheet.getTables();
  const tables: TableData[] = [];
  for (const entry of entries) {
    if (typeof entry !== 'object' || entry === null || !('model' in entry)) continue;
    const model = entry.model;
    if (!isExcelTableModel(model)) continue;
    const style = model.style
      ? {
        ...(model.style.theme ? { theme: model.style.theme as NonNullable<TableData['style']>['theme'] } : {}),
        ...(model.style.showFirstColumn !== undefined ? { showFirstColumn: model.style.showFirstColumn } : {}),
        ...(model.style.showLastColumn !== undefined ? { showLastColumn: model.style.showLastColumn } : {}),
        ...(model.style.showRowStripes !== undefined ? { showRowStripes: model.style.showRowStripes } : {}),
        ...(model.style.showColumnStripes !== undefined ? { showColumnStripes: model.style.showColumnStripes } : {}),
      }
      : undefined;
    tables.push({
      name: model.name,
      ...(model.displayName ? { displayName: model.displayName } : {}),
      ref: model.ref ?? model.tableRef ?? '',
      headerRow: model.headerRow,
      totalsRow: model.totalsRow,
      ...(style ? { style } : {}),
      columns: model.columns.map(column => ({ ...column })),
    });
  }
  return tables;
}

function importWorksheet(worksheet: Worksheet): SheetData {
  const sheet: SheetData = {
    name: worksheet.name,
    cells: {},
    colWidths: {},
    rowHeights: {},
    hiddenRows: {},
    hiddenCols: {},
    mergedCells: [...(worksheet.model.merges ?? [])],
    tables: tableMetadata(worksheet),
    state: worksheet.state,
  };
  const tabColor = keepColor(worksheet.properties.tabColor);
  if (tabColor) sheet.tabColor = tabColor;
  const views = worksheet.views ?? [];
  const view = views.find(item => item.state === 'frozen');
  if (view?.state === 'frozen') {
    if (view.ySplit) sheet.frozenRows = view.ySplit;
    if (view.xSplit) sheet.frozenCols = view.xSplit;
  }
  const activeView = views[0];
  if (activeView?.showGridLines !== undefined) sheet.showGridLines = activeView.showGridLines;

  worksheet.columns.forEach((column, index) => {
    if (!column) return;
    if (column.width !== undefined) sheet.colWidths[index] = column.width * 7;
    if (column.hidden) sheet.hiddenCols[index] = true;
  });
  worksheet.eachRow({ includeEmpty: true }, row => {
    const rowIndex = row.number - 1;
    if (row.height !== undefined) sheet.rowHeights[rowIndex] = row.height * 96 / 72;
    if (row.hidden) sheet.hiddenRows[rowIndex] = true;
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const style = keepCellStyle(cell);
      const value = cell.value;
      const cellData: CellData = {};
      if (value && typeof value === 'object' && ('formula' in value || 'sharedFormula' in value)) {
        const formulaCell = value as { formula?: string; sharedFormula?: string; result?: unknown };
        const formula = formulaCell.formula ?? cell.formula;
        if (formula) cellData.f = formula;
        const result = scalarValue(formulaCell.result);
        if (result !== undefined) cellData.v = result;
      } else {
        const scalar = scalarValue(value);
        if (scalar !== undefined) {
          cellData.v = scalar;
        } else if (value !== null && value !== undefined) {
          cellData.v = cell.text || String(value);
        }
      }
      if (style) cellData.s = style;
      if (Object.keys(cellData).length) {
        sheet.cells[`${rowIndex},${colNumber - 1}`] = cellData;
      }
    });
  });
  return sheet;
}

export async function importXlsx(buffer: ArrayBuffer | Uint8Array): Promise<SpreadsheetData> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  const input: ArrayBuffer = buffer instanceof Uint8Array
    ? (() => {
      const copy = new ArrayBuffer(buffer.byteLength);
      new Uint8Array(copy).set(buffer);
      return copy;
    })()
    : buffer;
  await workbook.xlsx.load(input);
  const sheets: SheetData[] = [];
  workbook.eachSheet(worksheet => sheets.push(importWorksheet(worksheet)));
  const activeSheet = workbook.views?.[0]?.activeTab ?? 0;
  return {
    sheets: sheets.length ? sheets : [{ name: 'Sheet 1', cells: {}, colWidths: {}, rowHeights: {} }],
    activeSheet: Math.max(0, Math.min(sheets.length - 1, activeSheet)),
  };
}

function colorForExcel(color?: CellColor): Partial<Color> | undefined {
  if (!color) return undefined;
  if (typeof color === 'string') {
    const hex = color.replace(/^#/, '');
    return { argb: hex.length === 6 ? `FF${hex}` : hex };
  }
  return {
    ...(color.argb ? { argb: color.argb } : {}),
    ...(color.theme !== undefined ? { theme: color.theme } : {}),
  };
}

function fillForExcel(fill?: CellFill): Fill | undefined {
  if (!fill) return undefined;
  if (fill.type === 'pattern' && fill.pattern) {
    return {
      type: 'pattern',
      pattern: fill.pattern as FillPatterns,
      ...(fill.fgColor ? { fgColor: colorForExcel(fill.fgColor) } : {}),
      ...(fill.bgColor ? { bgColor: colorForExcel(fill.bgColor) } : {}),
    };
  }
  if (fill.type === 'gradient' && fill.gradient && fill.stops) {
    if (fill.gradient === 'angle' && fill.degree !== undefined) {
      return {
        type: 'gradient',
        gradient: 'angle',
        degree: fill.degree,
        stops: fill.stops.map(stop => ({ position: stop.position, color: colorForExcel(stop.color) ?? {} })),
      };
    }
    if (fill.gradient === 'path' && fill.center) {
      return {
        type: 'gradient',
        gradient: 'path',
        center: fill.center,
        stops: fill.stops.map(stop => ({ position: stop.position, color: colorForExcel(stop.color) ?? {} })),
      };
    }
  }
  return undefined;
}

function excelBorder(border?: string | CellBorders): Partial<ExcelJSBorder> | undefined {
  if (!border || typeof border === 'string') return undefined;
  const result: Partial<ExcelJSBorder> = {};
  for (const side of ['top', 'right', 'bottom', 'left'] as const) {
    const value = border[side];
    if (value?.style) {
      const borderStyles: import('exceljs').BorderStyle[] = [
        'thin', 'dotted', 'hair', 'medium', 'double', 'thick', 'dashed', 'dashDot',
        'dashDotDot', 'slantDashDot', 'mediumDashed', 'mediumDashDotDot', 'mediumDashDot',
      ];
      const lineStyle = borderStyles.find(style => style === value.style);
      if (!lineStyle) continue;
      result[side] = {
        style: lineStyle,
        ...(value.color ? { color: colorForExcel(value.color) } : {}),
      };
    }
  }
  return Object.keys(result).length ? result : undefined;
}

type ExcelJSBorder = import('exceljs').Borders;

function writeCellStyle(cell: import('exceljs').Cell, style: CellStyle): void {
  if (style.bold || style.italic || style.underline || style.strikethrough || style.color || style.fontFamily || style.fontSize) {
    cell.font = {
      ...(style.bold ? { bold: style.bold } : {}),
      ...(style.italic ? { italic: style.italic } : {}),
      ...(style.underline ? { underline: true } : {}),
      ...(style.strikethrough ? { strike: true } : {}),
      ...(style.color ? { color: colorForExcel(style.color) } : {}),
      ...(style.fontFamily ? { name: style.fontFamily } : {}),
      ...(style.fontSize ? { size: style.fontSize } : {}),
    };
  }
  if (style.align || style.verticalAlign || style.wrapText || style.shrinkToFit || style.indent || style.textRotation !== undefined) {
    cell.alignment = {
      ...(style.align ? { horizontal: style.align } : {}),
      ...(style.verticalAlign ? { vertical: style.verticalAlign } : {}),
      ...(style.wrapText ? { wrapText: style.wrapText } : {}),
      ...(style.shrinkToFit ? { shrinkToFit: style.shrinkToFit } : {}),
      ...(style.indent ? { indent: style.indent } : {}),
      ...(style.textRotation !== undefined ? { textRotation: style.textRotation } : {}),
    };
  }
  const fill = fillForExcel(style.fill);
  if (fill) cell.fill = fill;
  else if (style.bg) cell.fill = { type: 'pattern', pattern: 'solid', fgColor: colorForExcel(style.bg) };
  const border = excelBorder(style.border);
  if (border) cell.border = border;
  if (style.numberFormat) cell.numFmt = style.numberFormat;
}

function parseCellAddress(address: string): { row: number; col: number } | undefined {
  const match = address.match(/^([A-Z]+)(\d+)$/i);
  if (!match) return undefined;
  let col = 0;
  for (const char of match[1].toUpperCase()) col = col * 26 + char.charCodeAt(0) - 64;
  const row = Number(match[2]);
  return row > 0 ? { row, col } : undefined;
}

function tableRows(sheet: SheetData, table: TableData): Array<Array<string | number | boolean | null>> {
  const [startAddress, endAddress = startAddress] = table.ref.split(':');
  const start = parseCellAddress(startAddress);
  const end = parseCellAddress(endAddress);
  if (!start || !end) return [];
  const firstDataRow = start.row + (table.headerRow ? 1 : 0);
  const lastDataRow = end.row - (table.totalsRow ? 1 : 0);
  const rows: Array<Array<string | number | boolean | null>> = [];
  for (let row = firstDataRow; row <= lastDataRow; row++) {
    const values: Array<string | number | boolean | null> = [];
    for (let col = start.col; col <= end.col; col++) {
      const cell = sheet.cells[`${row - 1},${col - 1}`];
      values.push(cell?.v ?? null);
    }
    rows.push(values);
  }
  return rows;
}

function writeTable(worksheet: Worksheet, sheet: SheetData, table: TableData): void {
  const properties: TableProperties = {
    name: table.name,
    ref: table.ref,
    headerRow: table.headerRow,
    totalsRow: table.totalsRow,
    columns: table.columns.map(column => ({ ...column })),
    rows: tableRows(sheet, table),
    ...(table.displayName ? { displayName: table.displayName } : {}),
    ...(table.style ? { style: { ...table.style } } : {}),
  };
  worksheet.addTable(properties);
}

export async function exportXlsx(data: SpreadsheetData): Promise<ArrayBuffer> {
  const { default: ExcelJS } = await import('exceljs');
  const workbook = new ExcelJS.Workbook();
  workbook.views = [{
    x: 0,
    y: 0,
    width: 28800,
    height: 15000,
    firstSheet: 0,
    activeTab: data.activeSheet,
    visibility: 'visible',
  }];
  for (const sheet of data.sheets) {
    const worksheet = workbook.addWorksheet(sheet.name);
    if (sheet.state) worksheet.state = sheet.state;
    const tabColor = colorForExcel(sheet.tabColor);
    if (tabColor) worksheet.properties.tabColor = tabColor;
    const hasFrozenPanes = (sheet.frozenRows ?? 0) > 0 || (sheet.frozenCols ?? 0) > 0;
    worksheet.views = [{
      state: hasFrozenPanes ? 'frozen' : 'normal',
      ...(sheet.frozenRows ? { ySplit: sheet.frozenRows } : {}),
      ...(sheet.frozenCols ? { xSplit: sheet.frozenCols } : {}),
      ...(sheet.showGridLines !== undefined ? { showGridLines: sheet.showGridLines } : {}),
    }];
    for (const [index, width] of Object.entries(sheet.colWidths)) {
      const columnIndex = Number(index);
      worksheet.getColumn(columnIndex + 1).width = width / 7;
      if (sheet.hiddenCols?.[columnIndex]) worksheet.getColumn(columnIndex + 1).hidden = true;
    }
    for (const [index, hidden] of Object.entries(sheet.hiddenCols ?? {})) {
      if (hidden) worksheet.getColumn(Number(index) + 1).hidden = true;
    }
    for (const table of sheet.tables ?? []) writeTable(worksheet, sheet, table);
    for (const [key, cellData] of Object.entries(sheet.cells)) {
      const [row, col] = key.split(',').map(Number);
      const cell = worksheet.getCell(row + 1, col + 1);
      if (cellData.f) {
        cell.value = { formula: cellData.f, ...(cellData.v !== undefined ? { result: cellData.v } : {}) };
      } else if (cellData.v !== undefined) {
        cell.value = cellData.v;
      }
      if (cellData.s) writeCellStyle(cell, cellData.s);
    }
    for (const [index, height] of Object.entries(sheet.rowHeights)) {
      const rowIndex = Number(index);
      worksheet.getRow(rowIndex + 1).height = height * 72 / 96;
      if (sheet.hiddenRows?.[rowIndex]) worksheet.getRow(rowIndex + 1).hidden = true;
    }
    for (const [index, hidden] of Object.entries(sheet.hiddenRows ?? {})) {
      if (hidden) worksheet.getRow(Number(index) + 1).hidden = true;
    }
    for (const range of sheet.mergedCells ?? []) worksheet.mergeCells(range);
  }
  return workbook.xlsx.writeBuffer();
}
