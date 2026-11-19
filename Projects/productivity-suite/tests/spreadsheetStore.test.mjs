import test from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB } from 'fake-indexeddb';
import { documentStore } from '../src/documents/documentStore.ts';

if (!globalThis.window) {
  const map = new Map();
  globalThis.window = {
    indexedDB,
    localStorage: {
      getItem: key => map.get(key) ?? null,
      setItem: (key, value) => map.set(key, String(value)),
      removeItem: key => map.delete(key),
    },
  };
}

test('spreadsheet creation, persistence, multi-sheet updates and deletion', async () => {
  // 1. Create a spreadsheet with default title
  const sheetDoc = await documentStore.create('spreadsheet');
  assert.equal(sheetDoc.app, 'spreadsheet');
  assert.equal(sheetDoc.title, 'Untitled spreadsheet');
  
  const parsedContent = JSON.parse(sheetDoc.content);
  assert.equal(Array.isArray(parsedContent.sheets), true);
  assert.equal(parsedContent.sheets.length, 1);
  assert.equal(parsedContent.sheets[0].name, 'Sheet 1');

  // 2. Save data with multiple sheets and formula cells
  const updatedData = {
    sheets: [
      {
        name: 'Financials',
        cells: {
          '0,0': { v: 'Revenue', s: { bold: true } },
          '0,1': { v: 15000 },
          '1,0': { v: 'Expenses', s: { bold: true } },
          '1,1': { v: 9000 },
          '2,0': { v: 'Net', s: { bold: true } },
          '2,1': { f: 'B1-B2' },
        },
        colWidths: { 0: 120, 1: 100 },
        rowHeights: {},
      },
      {
        name: 'Summary',
        cells: {
          '0,0': { v: 'Q1 Status' },
          '0,1': { v: 'On Track' },
        },
        colWidths: {},
        rowHeights: {},
      },
    ],
    activeSheet: 0,
  };

  await documentStore.save(sheetDoc.id, {
    title: 'Q1 Financial Model',
    content: JSON.stringify(updatedData),
  });

  // 3. Re-read and assert persistence
  const reloaded = await documentStore.get(sheetDoc.id);
  assert.ok(reloaded);
  assert.equal(reloaded.title, 'Q1 Financial Model');
  assert.equal(reloaded.app, 'spreadsheet');

  const reloadedData = JSON.parse(reloaded.content);
  assert.equal(reloadedData.sheets.length, 2);
  assert.equal(reloadedData.sheets[0].name, 'Financials');
  assert.equal(reloadedData.sheets[0].cells['0,0'].v, 'Revenue');
  assert.equal(reloadedData.sheets[0].cells['0,0'].s.bold, true);
  assert.equal(reloadedData.sheets[0].cells['0,1'].v, 15000);
  assert.equal(reloadedData.sheets[0].cells['2,1'].f, 'B1-B2');
  assert.equal(reloadedData.sheets[1].name, 'Summary');

  // 4. Duplicate the spreadsheet
  const duplicate = await documentStore.duplicate(sheetDoc.id, 'Q1 Financial Model (Copy)');
  assert.notEqual(duplicate.id, sheetDoc.id);
  assert.equal(duplicate.title, 'Q1 Financial Model (Copy)');
  assert.equal(duplicate.content, reloaded.content);

  // 5. List spreadsheets
  const list = await documentStore.list('spreadsheet');
  assert.ok(list.length >= 2);
  assert.ok(list.some(d => d.id === sheetDoc.id));
  assert.ok(list.some(d => d.id === duplicate.id));

  // 6. Delete original and verify clean removal
  await documentStore.delete(sheetDoc.id);
  const deletedCheck = await documentStore.get(sheetDoc.id);
  assert.equal(deletedCheck, undefined);

  // 7. Duplicate still exists
  const duplicateCheck = await documentStore.get(duplicate.id);
  assert.ok(duplicateCheck);
  assert.equal(duplicateCheck.title, 'Q1 Financial Model (Copy)');
});
