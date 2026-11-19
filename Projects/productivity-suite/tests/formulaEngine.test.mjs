import test from 'node:test';
import assert from 'node:assert/strict';
import { formulaEngine } from '../src/spreadsheet/formulaEngine.ts';

test('HyperFormula engine calculates core Excel functions and cross-sheet references', () => {
  assert.equal(formulaEngine.isAvailable(), true);

  const sheets = [
    {
      name: 'Sales',
      cells: {
        '0,0': { v: 'Product' },
        '0,1': { v: 'Price' },
        '0,2': { v: 'Qty' },
        '0,3': { v: 'Total' },

        '1,0': { v: 'Nexus Writer' },
        '1,1': { v: 50 },
        '1,2': { v: 4 },
        '1,3': { f: 'B2*C2' },

        '2,0': { v: 'Nexus Calc' },
        '2,1': { v: 80 },
        '2,2': { v: 2 },
        '2,3': { f: 'B3*C3' },

        // AutoSum & Statistics
        '3,0': { v: 'Grand Total' },
        '3,3': { f: 'SUM(D2:D3)' },
        '4,0': { v: 'Average Price' },
        '4,1': { f: 'AVERAGE(B2:B3)' },

        // VLOOKUP
        '5,0': { v: 'Lookup Calc Price' },
        '5,1': { f: 'VLOOKUP("Nexus Calc", A2:B3, 2, FALSE())' },

        // Text function
        '6,0': { f: 'CONCATENATE("Product: ", A2)' },

        // Math function
        '7,0': { f: 'ROUND(123.456, 1)' },
      },
    },
    {
      name: 'Summary',
      cells: {
        // Cross-sheet reference
        '0,0': { v: 'Imported Total' },
        '0,1': { f: 'Sales!D4' },
        '1,0': { v: 'Tax (10%)' },
        '1,1': { f: 'B1 * 0.1' },
      },
    },
  ];

  formulaEngine.syncWorkbook(sheets, 20, 10);

  // Line item totals
  assert.equal(formulaEngine.getCellValue('Sales', 1, 3), 200); // 50 * 4
  assert.equal(formulaEngine.getCellValue('Sales', 2, 3), 160); // 80 * 2

  // SUM and AVERAGE
  assert.equal(formulaEngine.getCellValue('Sales', 3, 3), 360); // 200 + 160
  assert.equal(formulaEngine.getCellValue('Sales', 4, 1), 65);  // (50 + 80) / 2

  // VLOOKUP
  assert.equal(formulaEngine.getCellValue('Sales', 5, 1), 80);

  // Text functions
  assert.equal(formulaEngine.getCellValue('Sales', 6, 0), 'Product: Nexus Writer');

  // Math functions
  assert.equal(formulaEngine.getCellValue('Sales', 7, 0), 123.5);

  // Cross-sheet calculations
  assert.equal(formulaEngine.getCellValue('Summary', 0, 1), 360);
  assert.equal(formulaEngine.getCellValue('Summary', 1, 1), 36);
});

test('HyperFormula handles circular references cleanly without crashing', () => {
  const sheets = [
    {
      name: 'Sheet1',
      cells: {
        '0,0': { f: 'B1 + 1' },
        '0,1': { f: 'A1 + 1' },
      },
    },
  ];

  formulaEngine.syncWorkbook(sheets, 5, 5);
  const val = formulaEngine.getCellValue('Sheet1', 0, 0);
  assert.match(String(val), /#CYCLE|#REF|#ERROR/);
});
