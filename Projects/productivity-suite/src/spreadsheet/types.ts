import type { TableColumnProperties, TableStyleProperties } from 'exceljs';
import type { ChartItem } from './ChartOverlay';

export type CellColor = string | { argb?: string; theme?: number };

export interface CellBorderSide {
  style?: string;
  color?: CellColor;
}

export interface CellBorders {
  top?: CellBorderSide;
  right?: CellBorderSide;
  bottom?: CellBorderSide;
  left?: CellBorderSide;
}

export interface CellFill {
  type: string;
  pattern?: string;
  fgColor?: CellColor;
  bgColor?: CellColor;
  gradient?: string;
  degree?: number;
  center?: { left: number; top: number };
  stops?: Array<{ position: number; color: CellColor }>;
}

export interface CellStyle {
  bold?: boolean;
  italic?: boolean;
  underline?: boolean;
  strikethrough?: boolean;
  align?: 'left' | 'center' | 'right' | 'fill' | 'justify' | 'centerContinuous' | 'distributed';
  verticalAlign?: 'top' | 'middle' | 'bottom' | 'distributed' | 'justify';
  wrapText?: boolean;
  shrinkToFit?: boolean;
  indent?: number;
  textRotation?: number | 'vertical';
  color?: CellColor;
  bg?: CellColor;
  fill?: CellFill;
  fontFamily?: string;
  fontSize?: number;
  numberFormat?: string;
  border?: string | CellBorders;
}

export interface CellData {
  v?: string | number | boolean;
  f?: string;
  s?: CellStyle;
}

export interface TableData {
  name: string;
  displayName?: string;
  ref: string;
  headerRow: boolean;
  totalsRow: boolean;
  style?: Partial<TableStyleProperties>;
  columns: TableColumnProperties[];
}

export interface SheetData {
  name: string;
  tabColor?: CellColor;
  cells: Record<string, CellData>;
  colWidths: Record<number, number>;
  rowHeights: Record<number, number>;
  hiddenRows?: Record<number, boolean>;
  hiddenCols?: Record<number, boolean>;
  mergedCells?: string[];
  tables?: TableData[];
  charts?: ChartItem[];
  frozenRows?: number;
  frozenCols?: number;
  showGridLines?: boolean;
  state?: 'visible' | 'hidden' | 'veryHidden';
}

export interface SpreadsheetData {
  sheets: SheetData[];
  activeSheet: number;
}

const TABLE_ACCENTS = [
  '#4472C4', '#5B9BD5', '#ED7D31', '#A5A5A5', '#FFC000', '#70AD47',
  '#264478', '#9E480E', '#636363', '#997300', '#255E91', '#43682B',
  '#7F7F7F', '#C55A11',
];

export function cellColorToCss(color?: CellColor): string | undefined {
  if (!color) return undefined;
  if (typeof color === 'string') return color;
  if (color.argb) return `#${color.argb.length === 8 ? color.argb.slice(2) : color.argb}`;
  if (color.theme !== undefined) {
    const themeColors = ['#FFFFFF', '#000000', '#E7E6E6', '#44546A', '#4472C4', '#ED7D31', '#A5A5A5', '#FFC000', '#5B9BD5', '#70AD47'];
    return themeColors[color.theme] ?? themeColors[0];
  }
  return undefined;
}

function tintColor(color: string, tint: number): string {
  const hex = color.slice(1);
  const channels = [0, 2, 4].map(offset => parseInt(hex.slice(offset, offset + 2), 16));
  const tinted = channels.map(channel => Math.round(tint < 0 ? channel * (1 + tint) : channel + (255 - channel) * tint));
  return `#${tinted.map(channel => channel.toString(16).padStart(2, '0')).join('')}`;
}

function tableAccent(style?: Partial<TableStyleProperties>): string {
  const theme = style?.theme ?? 'TableStyleMedium2';
  const number = Number(theme.match(/\d+$/)?.[0] ?? 2);
  const accent = TABLE_ACCENTS[(number - 1) % TABLE_ACCENTS.length];
  if (theme.startsWith('TableStyleLight')) return tintColor(accent, 0.62);
  if (theme.startsWith('TableStyleDark')) return tintColor(accent, -0.3);
  return accent;
}

export function getTableCellAppearance(
  sheet: SheetData,
  row: number,
  col: number,
): { background?: string; color?: string; bold?: boolean } | undefined {
  for (const table of sheet.tables ?? []) {
    const [startAddress, endAddress = startAddress] = table.ref.split(':');
    const startMatch = startAddress.match(/^([A-Z]+)(\d+)$/i);
    const endMatch = endAddress.match(/^([A-Z]+)(\d+)$/i);
    if (!startMatch || !endMatch) continue;
    const columnNumber = (letters: string) => [...letters.toUpperCase()]
      .reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
    const startRow = Number(startMatch[2]) - 1;
    const endRow = Number(endMatch[2]) - 1;
    const startCol = columnNumber(startMatch[1]);
    const endCol = columnNumber(endMatch[1]);
    if (row < startRow || row > endRow || col < startCol || col > endCol) continue;

    const accent = tableAccent(table.style);
    if (table.headerRow && row === startRow) {
      return {
        background: accent,
        color: table.style?.theme?.startsWith('TableStyleLight') ? '#000000' : '#FFFFFF',
        bold: true,
      };
    }
    if (table.totalsRow && row === endRow) return { background: tintColor(accent, 0.78), bold: true };
    if (table.style?.showRowStripes === false) return undefined;

    const relativeDataRow = row - startRow - (table.headerRow ? 1 : 0);
    if (relativeDataRow >= 0 && relativeDataRow % 2 === 0) {
      return { background: tintColor(accent, 0.88) };
    }
  }
  return undefined;
}

function columnLettersToNumber(letters: string): number {
  return [...letters.toUpperCase()].reduce((total, letter) => total * 26 + letter.charCodeAt(0) - 64, 0) - 1;
}

function columnNumberToLetters(column: number): string {
  let value = column + 1;
  let letters = '';
  while (value > 0) {
    value -= 1;
    letters = String.fromCharCode(65 + value % 26) + letters;
    value = Math.floor(value / 26);
  }
  return letters;
}

export function extendTableForCell(tables: TableData[] | undefined, row: number, col: number): TableData[] | undefined {
  if (!tables?.length) return tables;
  let changed = false;
  const updatedTables = tables.map(table => {
    if (table.totalsRow) return table;
    const [startAddress, endAddress = startAddress] = table.ref.split(':');
    const startMatch = startAddress.match(/^([A-Z]+)(\d+)$/i);
    const endMatch = endAddress.match(/^([A-Z]+)(\d+)$/i);
    if (!startMatch || !endMatch) return table;
    const startCol = columnLettersToNumber(startMatch[1]);
    const endCol = columnLettersToNumber(endMatch[1]);
    const endRow = Number(endMatch[2]);
    if (row !== endRow || col < startCol || col > endCol) return table;
    changed = true;
    return { ...table, ref: `${startAddress}:${columnNumberToLetters(endCol)}${row + 1}` };
  });
  return changed ? updatedTables : tables;
}

export function getCellRawContent(cell?: CellData): string {
  if (!cell) return '';
  if (cell.f !== undefined) return `=${cell.f}`;
  return String(cell.v ?? '');
}

export function applyCellInput(cell: CellData | undefined, rawValue: string): CellData | undefined {
  if (rawValue === '') {
    return cell?.s ? { s: cell.s } : undefined;
  }
  if (rawValue.startsWith('=')) {
    return { ...cell, f: rawValue.slice(1), v: undefined };
  }
  const num = parseFloat(rawValue);
  const value = !isNaN(num) && rawValue.trim() === String(num) ? num : rawValue;
  return { ...cell, v: value, f: undefined };
}
