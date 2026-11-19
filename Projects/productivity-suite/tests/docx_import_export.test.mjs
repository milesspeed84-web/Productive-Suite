import test from 'node:test';
import assert from 'node:assert/strict';
import { Document, Paragraph, TextRun, HeadingLevel } from 'docx';
import { Packer } from 'docx';
import mammoth from 'mammoth';
import { documentStore } from '../src/documents/documentStore.ts';
import { DEFAULT_WRITER_LAYOUT } from '../src/documents/documentStore.ts';
import { indexedDB } from 'fake-indexeddb';
const legacyMap = new Map();
globalThis.window = {
  indexedDB,
  localStorage: {
    getItem: key => legacyMap.get(key) ?? null,
    setItem: (key, value) => legacyMap.set(key, String(value)),
    removeItem: key => legacyMap.delete(key),
  },
};

test('DOCX import preserves heading and bold formatting', async () => {
  const doc = new Document({
    sections: [{
      children: [
        new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun('Test Heading')] }),
        new Paragraph({ children: [new TextRun({ text: 'Bold text', bold: true })] })
      ]
    }]
  });
  const blob = await Packer.toBlob(doc);
  const arrayBuffer = await blob.arrayBuffer();
  const { value } = await mammoth.convertToHtml({ arrayBuffer, buffer: arrayBuffer });
  // Verify HTML contains heading and bold
  assert.match(value, /Test Heading/);
  // mammoth uses <strong> for bold
  assert.match(value, /<strong>Bold text<\/strong>/);

  const imported = await documentStore.create('writer', 'ImportedDoc');
  await documentStore.save(imported.id, { title: imported.title, content: value, layout: DEFAULT_WRITER_LAYOUT });
  const saved = await documentStore.get(imported.id);
  assert.ok(saved);
  assert.match(saved?.content ?? '', /Test Heading/);
  assert.match(saved?.content ?? '', /<strong>Bold text<\/strong>/);
});
