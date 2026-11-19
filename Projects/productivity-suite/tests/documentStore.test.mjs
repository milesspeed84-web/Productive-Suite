import test from 'node:test';
import assert from 'node:assert/strict';
import { indexedDB } from 'fake-indexeddb';
import { documentStore } from '../src/documents/documentStore.ts';

const legacyMap = new Map();
globalThis.window = {
  indexedDB,
  localStorage: {
    getItem: key => legacyMap.get(key) ?? null,
    setItem: (key, value) => legacyMap.set(key, String(value)),
    removeItem: key => legacyMap.delete(key),
  },
};

test('multiple Writer documents persist independently through rename, reload reads, and delete', async () => {
  window.localStorage.setItem('nexus-writer-document', JSON.stringify({
    title: 'Legacy draft', content: '<p>Imported from the earlier Writer version.</p>',
  }));

  const imported = await documentStore.list('writer');
  assert.equal(imported.length, 1);
  assert.equal(imported[0].title, 'Legacy draft');
  assert.match(imported[0].content, /earlier Writer version/);
  assert.equal(window.localStorage.getItem('nexus-writer-document'), null);

  const docA = await documentStore.create('writer', 'Document A');
  const docB = await documentStore.create('writer', 'Document B');
  assert.notEqual(docA.id, docB.id);
  const documentLayout = { paper: 'A4', orientation: 'landscape', margins: { top: 0.75, right: 0.75, bottom: 0.75, left: 0.75 } };
  await documentStore.save(docA.id, { title: 'Document A', content: '<p>Unique content A</p>', layout: documentLayout });
  await documentStore.save(docB.id, { title: 'Document B', content: '<p>Different content B</p>' });

  const reopenedA = await documentStore.get(docA.id);
  const reopenedB = await documentStore.get(docB.id);
  assert.equal(reopenedA.content, '<p>Unique content A</p>');
  assert.deepEqual(reopenedA.layout, documentLayout);
  assert.equal(reopenedB.content, '<p>Different content B</p>');

  const renamed = await documentStore.rename(docA.id, 'Renamed A');
  assert.equal(renamed.id, docA.id);
  assert.equal(renamed.content, '<p>Unique content A</p>');
  assert.equal((await documentStore.get(docA.id)).title, 'Renamed A');

  const copy = await documentStore.duplicate(docB.id, 'Document B copy');
  assert.notEqual(copy.id, docB.id);
  assert.equal(copy.content, '<p>Different content B</p>');
  assert.deepEqual(copy.layout, docB.layout);

  const empty = await documentStore.create('writer');
  assert.equal(empty.content, '<p></p>');
  const duplicateTitle = await documentStore.create('writer', 'Renamed A');
  assert.notEqual(duplicateTitle.id, docA.id);

  await documentStore.delete(docA.id);
  assert.equal(await documentStore.get(docA.id), undefined);
  assert.equal((await documentStore.get(docB.id)).content, '<p>Different content B</p>');
  assert.equal((await documentStore.get(copy.id)).content, '<p>Different content B</p>');
  const recent = await documentStore.recent();
  assert.ok(recent.every(record => record.id !== docA.id));
  assert.ok(recent.some(record => record.id === docB.id));
});

test('storage access errors reject instead of reporting success', async () => {
  const original = window.localStorage;
  window.localStorage = { getItem() { throw new Error('Storage denied'); }, removeItem() {} };
  await assert.rejects(documentStore.list('writer'), /Storage denied/);
  window.localStorage = original;
});

test('recovery drafts persist independently and clear atomically when a document is saved or deleted', async () => {
  const record = await documentStore.create('writer', 'Recovery test');
  const draft = {
    documentId: record.id,
    title: record.title,
    content: '<p>unsaved recovery content</p>',
    layout: record.layout,
    updatedAt: new Date(Date.now() + 10_000).toISOString(),
  };

  await documentStore.saveRecovery(draft);
  assert.deepEqual(await documentStore.getRecovery(record.id), draft);

  await documentStore.save(record.id, { content: '<p>saved replacement</p>' });
  assert.equal(await documentStore.getRecovery(record.id), undefined);

  await documentStore.saveRecovery(draft);
  await documentStore.delete(record.id);
  assert.equal(await documentStore.getRecovery(record.id), undefined);
});
