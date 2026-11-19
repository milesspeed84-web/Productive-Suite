import test from 'node:test';
import assert from 'node:assert/strict';
import ExcelJS from 'exceljs';
import { formatCellValue } from '../src/spreadsheet/formatters.ts';
import { cellEditReducer, editKeyAction } from '../src/spreadsheet/editSession.ts';
import { applyCellInput, extendTableForCell, getCellRawContent, getTableCellAppearance } from '../src/spreadsheet/types.ts';
import { exportXlsx, importXlsx } from '../src/spreadsheet/xlsx.ts';

test('formula bar values are raw, edits preserve styles, and formulas remain formulas', () => {
  const styled = { v: 12, s: { bold: true, bg: '#d9ead3' } };
  assert.equal(getCellRawContent(styled), '12');
  assert.equal(getCellRawContent({ f: 'SUM(A1:A10)' }), '=SUM(A1:A10)');
  assert.equal(getCellRawContent(), '');
  assert.deepEqual(applyCellInput(styled, '=A1+B1'), {
    s: styled.s,
    f: 'A1+B1',
    v: undefined,
  });
  assert.equal(getCellRawContent(applyCellInput(styled, '=SUM(A1:A10)')), '=SUM(A1:A10)');
  assert.deepEqual(applyCellInput(styled, ''), { s: styled.s });
  assert.equal(styled.v, 12);
  const table = { name: 'Data', ref: 'A1:B2', headerRow: true, totalsRow: false, columns: [{ name: 'A' }, { name: 'B' }] };
  assert.equal(extendTableForCell([table], 2, 1)[0].ref, 'A1:B3');
  assert.equal(extendTableForCell([table], 3, 1)[0].ref, 'A1:B2');
});

test('formula edit sessions commit on Enter and discard draft changes on Escape', () => {
  const original = { v: 'Original', s: { italic: true } };
  let session = cellEditReducer(null, {
    type: 'start',
    cell: { row: 0, col: 0 },
    value: getCellRawContent(original),
    source: 'formula',
  });
  session = cellEditReducer(session, { type: 'update', value: '=A1+B1' });
  assert.equal(editKeyAction('Enter'), 'commit');
  const committed = applyCellInput(original, session.value);
  session = cellEditReducer(session, { type: 'finish' });
  assert.equal(session, null);
  assert.equal(getCellRawContent(committed), '=A1+B1');
  assert.deepEqual(committed.s, original.s);

  session = cellEditReducer(null, {
    type: 'start',
    cell: { row: 0, col: 0 },
    value: getCellRawContent(committed),
    source: 'formula',
  });
  session = cellEditReducer(session, { type: 'update', value: 'discard this draft' });
  assert.equal(editKeyAction('Escape'), 'cancel');
  session = cellEditReducer(session, { type: 'finish' });
  assert.equal(session, null);
  assert.equal(getCellRawContent(original), 'Original');
  assert.equal(editKeyAction('Tab'), undefined);
});

test('Excel number formats render currency, percentages, and dates', () => {
  assert.equal(formatCellValue(1234.5, '$#,##0.00'), '$1,234.50');
  assert.equal(formatCellValue(0.125, '0.0%'), '12.5%');
  assert.equal(formatCellValue(46000, 'mm/dd/yyyy'), '12/09/2025');
});

test('XLSX import and export preserve cell styles, tables, and worksheet structure', async () => {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet('Sales Data');
  sheet.columns = [{ width: 22 }, { width: 14 }, { width: 18 }];
  sheet.views = [{ state: 'frozen', xSplit: 1, ySplit: 1, showGridLines: false }];
  sheet.getRow(1).height = 30;
  sheet.getCell('A7').value = 'Hidden row';
  sheet.getRow(7).hidden = true;
  sheet.getColumn(3).hidden = true;
  sheet.properties.tabColor = { argb: 'FF4472C4' };
  sheet.addTable({
    name: 'SalesTable',
    ref: 'A1:C5',
    headerRow: true,
    totalsRow: true,
    style: { theme: 'TableStyleMedium2', showRowStripes: true },
    columns: [
      { name: 'Product', totalsRowLabel: 'Total' },
      { name: 'Units', totalsRowFunction: 'sum' },
      { name: 'Price', totalsRowFunction: 'sum' },
    ],
    rows: [
      ['Widget', 3, 19.95],
      ['Gadget', 5, 8.5],
      ['Cable', 2, 4.25],
    ],
  });

  const header = sheet.getCell('A1');
  header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F4E78' } };
  header.font = { name: 'Aptos Display', size: 14, bold: true, color: { argb: 'FFFFFFFF' } };
  header.alignment = { horizontal: 'center', vertical: 'middle', wrapText: true };
  header.border = { bottom: { style: 'medium', color: { argb: 'FF000000' } } };
  sheet.getCell('C2').numFmt = '$#,##0.00';
  sheet.getCell('C3').numFmt = '0.0%';
  sheet.getCell('A5').value = 'Total';
  sheet.getCell('B5').value = 10;
  sheet.getCell('C5').value = 32.7;
  sheet.getCell('E2').value = { formula: 'B2+C2', result: 22.95 };
  sheet.getCell('E2').font = { italic: true };
  sheet.mergeCells('A6:B6');
  sheet.getCell('A6').value = 'Merged note';

  const summary = workbook.addWorksheet('Summary');
  workbook.views = [{ activeTab: 1 }];
  summary.getCell('A1').value = 'Total';
  summary.getCell('A1').font = { bold: true };
  summary.getCell('A2').value = { formula: "'Sales Data'!E2", result: 22.95 };

  const source = await workbook.xlsx.writeBuffer();
  const imported = await importXlsx(source);
  const sales = imported.sheets[0];
  assert.equal(imported.sheets.length, 2);
  assert.equal(imported.activeSheet, 1);
  assert.equal(sales.name, 'Sales Data');
  assert.equal(sales.cells['0,0'].v, 'Product');
  assert.deepEqual(sales.cells['0,0'].s.bg, { argb: 'FF1F4E78' });
  assert.equal(sales.cells['0,0'].s.fontFamily, 'Aptos Display');
  assert.equal(sales.cells['0,0'].s.fontSize, 14);
  assert.equal(sales.cells['0,0'].s.bold, true);
  assert.equal(sales.cells['0,0'].s.align, 'center');
  assert.equal(sales.cells['0,0'].s.verticalAlign, 'middle');
  assert.equal(sales.cells['0,0'].s.wrapText, true);
  assert.equal(sales.cells['0,0'].s.border.bottom.style, 'medium');
  assert.equal(sales.cells['1,2'].s.numberFormat, '$#,##0.00');
  assert.equal(sales.cells['1,4'].f, 'B2+C2');
  assert.equal(sales.cells['1,4'].v, 22.95);
  assert.equal(sales.colWidths[0], 154);
  assert.equal(sales.rowHeights[0], 40);
  assert.equal(sales.hiddenRows[6], true);
  assert.equal(sales.hiddenCols[2], true);
  assert.equal(sales.frozenRows, 1);
  assert.equal(sales.frozenCols, 1);
  assert.equal(sales.showGridLines, false);
  assert.ok(sales.mergedCells.includes('A6:B6'));
  assert.equal(sales.tables[0].name, 'SalesTable');
  assert.equal(sales.tables[0].ref, 'A1:C5');
  assert.equal(sales.tables[0].totalsRow, true);
  assert.equal(sales.tables[0].columns[2].totalsRowFunction, 'sum');
  assert.equal(sales.tables[0].style.theme, 'TableStyleMedium2');
  assert.equal(sales.tables[0].style.showRowStripes, true);
  assert.ok(getTableCellAppearance(sales, 1, 0).background);
  assert.equal(getTableCellAppearance(sales, 2, 0), undefined);

  const roundTrip = await importXlsx(await exportXlsx(imported));
  const roundTrippedSales = roundTrip.sheets[0];
  assert.equal(roundTrippedSales.tables[0].name, 'SalesTable');
  assert.equal(roundTrippedSales.tables[0].style.theme, 'TableStyleMedium2');
  assert.equal(roundTrippedSales.tables[0].totalsRow, true);
  assert.equal(roundTrippedSales.cells['0,0'].s.bg.argb, 'FF1F4E78');
  assert.equal(roundTrippedSales.cells['1,2'].s.numberFormat, '$#,##0.00');
  assert.equal(roundTrippedSales.cells['1,4'].f, 'B2+C2');
  assert.ok(roundTrippedSales.mergedCells.includes('A6:B6'));
  assert.equal(roundTrip.sheets[1].name, 'Summary');
  assert.equal(roundTrip.activeSheet, 1);
  assert.equal(roundTrip.sheets[1].cells['1,0'].f, "'Sales Data'!E2");
});
