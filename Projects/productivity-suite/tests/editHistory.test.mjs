import test from 'node:test';
import assert from 'node:assert/strict';
import { EditHistory } from '../src/documents/editHistory.ts';

test('groups rapid repeated deletion into one undo step and supports redo', () => {
  const history = new EditHistory(80, 650, value => value.length, 1024);
  history.checkpoint({ state: 'start', bookmark: null }, 'delete', 0);
  history.checkpoint({ state: 'start', bookmark: null }, 'delete', 100);
  history.checkpoint({ state: 'start', bookmark: null }, 'delete', 200);

  const afterDeletion = { state: '', bookmark: null };
  const undone = history.undo(afterDeletion);
  assert.equal(undone?.state, 'start');
  assert.equal(history.canUndo, false);
  assert.equal(history.canRedo, true);

  const redone = history.redo(undone);
  assert.equal(redone?.state, '');
  assert.equal(history.canRedo, false);
});

test('starts a new history entry after the group timeout and clears redo on new edits', () => {
  const history = new EditHistory(80, 650, value => value.length, 1024);
  history.checkpoint({ state: 'one', bookmark: null }, 'insert', 0);
  history.checkpoint({ state: 'one', bookmark: null }, 'insert', 700);
  assert.equal(history.undo({ state: 'two', bookmark: null })?.state, 'one');
  history.checkpoint({ state: 'fresh', bookmark: null }, 'insert', 900);
  assert.equal(history.canRedo, false);
});

test('bounds history memory while preserving the newest undo state', () => {
  const history = new EditHistory(10, 650, value => value.length, 6);
  history.checkpoint({ state: 'aaa', bookmark: null });
  history.breakGroup();
  history.checkpoint({ state: 'bbb', bookmark: null });
  history.breakGroup();
  history.checkpoint({ state: 'ccc', bookmark: null });
  assert.equal(history.undo({ state: 'current', bookmark: null })?.state, 'ccc');
});
