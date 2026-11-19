import test from 'node:test';
import assert from 'node:assert/strict';
import { clearRange, makeRangeBuffer, pasteRangeBuffer } from '../src/spreadsheet/clipboard.ts';

test('range buffer copies and pastes cells to a new location', () => {
  const source = { '0,0': 'A', '0,1': 'B', '1,0': 'C', '1,1': 'D' };
  const buffer = makeRangeBuffer(source, 0, 0, 1, 1);
  assert.deepEqual(pasteRangeBuffer({}, buffer, 3, 4), {
    '3,4': 'A', '3,5': 'B', '4,4': 'C', '4,5': 'D',
  });
});

test('cut range is cleared only after the cut paste operation', () => {
  const source = { '0,0': 'A', '0,1': 'B', '1,0': 'C' };
  const buffer = makeRangeBuffer(source, 0, 0, 1, 1, true);
  const pasted = pasteRangeBuffer({}, buffer, 2, 2);
  assert.equal(pasted['2,2'], 'A');

  const cleared = clearRange(source, 0, 0, 1, 1);
  assert.deepEqual(cleared, {});
});
