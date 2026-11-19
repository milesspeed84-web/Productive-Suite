import test from 'node:test';
import assert from 'node:assert/strict';
import { parseCsv, stringifyCsv } from '../src/spreadsheet/csv.ts';

 test('CSV parser handles quotes, commas, escaped quotes and embedded newlines', () => {
  const parsed = parseCsv('Name,Note\r\n"Ada, Lovelace","Said ""hello"""\r\n"Line one\nLine two",ok');
  assert.deepEqual(parsed, [
    ['Name', 'Note'],
    ['Ada, Lovelace', 'Said "hello"'],
    ['Line one\nLine two', 'ok'],
  ]);
});

test('CSV serializer quotes commas, quotes and line breaks', () => {
  assert.equal(
    stringifyCsv([['Name', 'Note'], ['Ada, Lovelace', 'Said "hello"'], ['Line one\nLine two', 'ok']]),
    'Name,Note\r\n"Ada, Lovelace","Said ""hello"""\r\n"Line one\nLine two",ok',
  );
});
