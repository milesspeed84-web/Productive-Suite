import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { AlignmentType, Document, HeadingLevel, ImageRun, LevelFormat, PageOrientation, Packer, Paragraph, Table, TableCell, TableRow, TextRun } from 'docx';
import {
  ArrowLeft, Save, Download, Bold, Italic, Underline, Strikethrough, Printer, Copy, Trash2,
  List, ListOrdered, AlignLeft, AlignCenter, AlignRight, AlignJustify, Undo2, Redo2, FileText,
  Link2, ImagePlus, Table2, Search, Replace, RemoveFormatting, Plus,
} from 'lucide-react';
import { DEFAULT_WRITER_LAYOUT, documentStore, type WorkspaceDocument, type WriterLayout, type WriterRecoveryDraft } from './documents/documentStore';
import { EditHistory, type HistoryEntry } from './documents/editHistory';
import './Writer.css';

const PAPER_DIMENSIONS_IN: Record<WriterLayout['paper'], [number, number]> = {
  A3: [11.69, 16.54], A4: [8.27, 11.69], A5: [5.83, 8.27],
  Letter: [8.5, 11], Legal: [8.5, 14], Tabloid: [11, 17],
};

interface WriterProps {
  documentId: string;
  onBack: () => void;
  onSwitchDocument: (id: string) => void;
}

function safeDocumentHtml(html: string): string {
  const template = window.document.createElement('template');
  template.innerHTML = html;
  template.content.querySelectorAll('script, iframe, object, embed').forEach(element => element.remove());
  template.content.querySelectorAll('*').forEach(element => {
    Array.from(element.attributes).forEach(attribute => {
      if (attribute.name.toLowerCase().startsWith('on')) element.removeAttribute(attribute.name);
      if ((attribute.name === 'href' || attribute.name === 'src') && /^\s*javascript:/i.test(attribute.value)) {
        element.removeAttribute(attribute.name);
      }
    });
  });
  return template.innerHTML || '<p></p>';
}

function htmlColor(value: string): string | undefined {
  const hex = value.match(/^#?([\da-f]{6})$/i)?.[1];
  if (hex) return hex.toUpperCase();
  const rgb = value.match(/^rgb\(\s*(\d+)\s*,\s*(\d+)\s*,\s*(\d+)\s*\)$/i);
  return rgb ? rgb.slice(1).map(channel => Number(channel).toString(16).padStart(2, '0')).join('').toUpperCase() : undefined;
}

function runsFromNode(node: Node, inherited: Record<string, unknown> = {}): Array<TextRun | ImageRun> {
  if (node.nodeType === Node.TEXT_NODE) {
    return node.textContent ? [new TextRun({ text: node.textContent, ...inherited })] : [];
  }
  if (!(node instanceof HTMLElement)) return [];
  const tag = node.tagName.toLowerCase();
  const style: Record<string, unknown> = { ...inherited };
  if (['b', 'strong'].includes(tag) || node.style.fontWeight === 'bold' || Number(node.style.fontWeight) >= 600) style.bold = true;
  if (['i', 'em'].includes(tag) || node.style.fontStyle === 'italic') style.italics = true;
  if (tag === 'u' || node.style.textDecorationLine.includes('underline')) style.underline = {};
  if (tag === 's' || tag === 'strike' || tag === 'del' || node.style.textDecorationLine.includes('line-through')) style.strike = true;
  if (tag === 'sup') style.superScript = true;
  if (tag === 'sub') style.subScript = true;
  const color = htmlColor(node.style.color || node.getAttribute('color') || '');
  if (color) style.color = color;
  const face = node.style.fontFamily || node.getAttribute('face');
  if (face) style.font = face.split(',')[0].replace(/['"]/g, '').trim();
  const points = node.style.fontSize.match(/[\d.]+(pt|px)/i);
  if (points) style.size = Math.round(Number(points[0].replace(/[a-z]/ig, '')) * (points[1].toLowerCase() === 'px' ? 1.5 : 2));
  if (tag === 'img') {
    const source = node.getAttribute('src') ?? '';
    const image = source.match(/^data:image\/(png|jpe?g|gif|bmp);base64,[a-z\d+/=]+$/i);
    if (image) {
      const type = image[1].toLowerCase().replace('jpeg', 'jpg') as 'png' | 'jpg' | 'gif' | 'bmp';
      const imageElement = node as HTMLImageElement;
      const requestedWidth = Number(imageElement.getAttribute('width')) || 0;
      const requestedHeight = Number(imageElement.getAttribute('height')) || 0;
      const styleWidth = imageElement.style.width;
      let calculatedWidth = requestedWidth;
      if (!calculatedWidth && styleWidth) {
        if (styleWidth.endsWith('%')) {
          calculatedWidth = Math.round(560 * (Number.parseFloat(styleWidth) / 100));
        } else if (styleWidth.endsWith('px')) {
          calculatedWidth = Math.round(Number.parseFloat(styleWidth));
        }
      }
      const ratio = requestedWidth && requestedHeight ? requestedWidth / requestedHeight : 1.5;
      const width = Math.max(1, Math.min(560, calculatedWidth || 420));
      const height = Math.max(1, Math.min(720, requestedHeight || Math.round(width / ratio)));
      const alt = imageElement.getAttribute('alt') || 'Document image';
      return [new ImageRun({ data: source, type, transformation: { width, height }, altText: { name: alt, description: alt } })];
    }
    return node.getAttribute('alt') ? [new TextRun({ text: `[Image: ${node.getAttribute('alt')}]` })] : [];
  }
  return Array.from(node.childNodes).flatMap(child => runsFromNode(child, style));
}

function paragraphFromElement(element: Element, options: { bullet?: boolean; numbered?: boolean } = {}): Paragraph {
  const htmlElement = element as HTMLElement;
  const tag = element.tagName.toLowerCase();
  const customStyle = htmlElement.dataset.nexusStyle;
  const customHeading = customStyle?.match(/^heading([1-9])$/)?.[1];
  const heading = customStyle === 'title' ? HeadingLevel.TITLE
    : tag === 'h1' ? HeadingLevel.HEADING_1 : tag === 'h2' ? HeadingLevel.HEADING_2 : tag === 'h3' ? HeadingLevel.HEADING_3 : tag === 'h4' ? HeadingLevel.HEADING_4 : tag === 'h5' ? HeadingLevel.HEADING_5 : tag === 'h6' ? HeadingLevel.HEADING_6 : tag === 'title' ? HeadingLevel.TITLE : undefined;
  const alignment = element.getAttribute('align')?.toLowerCase() ?? htmlElement.style.textAlign.toLowerCase();
  const marginLeft = Number.parseFloat(htmlElement.style.marginLeft);
  const marginRight = Number.parseFloat(htmlElement.style.marginRight);
  const marginBottom = Number.parseFloat(htmlElement.style.marginBottom);
  const lineHeight = Number.parseFloat(htmlElement.style.lineHeight);
  return new Paragraph({
    children: Array.from(element.childNodes).flatMap(child => runsFromNode(child)),
    ...(heading ? { heading } : {}),
    ...(customHeading && Number(customHeading) >= 7 ? { style: `Heading${customHeading}` } : {}),
    ...(alignment === 'center' ? { alignment: AlignmentType.CENTER } : alignment === 'right' ? { alignment: AlignmentType.RIGHT } : alignment === 'justify' ? { alignment: AlignmentType.JUSTIFIED } : {}),
    ...(Number.isFinite(marginLeft) || Number.isFinite(marginRight) ? { indent: { ...(Number.isFinite(marginLeft) ? { left: Math.round(marginLeft * 15) } : {}), ...(Number.isFinite(marginRight) ? { right: Math.round(marginRight * 15) } : {}) } } : {}),
    ...(options.bullet ? { bullet: { level: 0 } } : {}),
    ...(options.numbered ? { numbering: { reference: 'nexus-numbered-list', level: 0 } } : {}),
    ...(element instanceof HTMLElement && /page-break-before:\s*always|break-before:\s*page/i.test(element.getAttribute('style') ?? '') ? { pageBreakBefore: true } : {}),
    spacing: { after: Number.isFinite(marginBottom) ? Math.round(marginBottom * 15) : 160, ...(Number.isFinite(lineHeight) ? { line: Math.round(lineHeight * 240) } : {}) },
  });
}

function htmlToDocxChildren(html: string): Array<Paragraph | Table> {
  const root = window.document.createElement('div');
  root.innerHTML = safeDocumentHtml(html);
  const output: Array<Paragraph | Table> = [];
  const addBlocks = (nodes: Element[]) => {
    nodes.forEach(element => {
      const tag = element.tagName.toLowerCase();
      if (element instanceof HTMLElement && element.hasAttribute('data-nexus-toc')) {
        output.push(new Paragraph({ text: element.querySelector('[data-nexus-toc-title]')?.textContent || 'Contents', heading: HeadingLevel.HEADING_1 }));
        element.querySelectorAll<HTMLElement>('[data-nexus-toc-entries] > p').forEach(item => {
          const indent = Number.parseInt(item.style.marginLeft, 10) || 0;
          output.push(new Paragraph({ text: item.textContent?.trim() || '', indent: { left: indent * 20 }, spacing: { after: 80 } }));
        });
      } else if (tag === 'ul' || tag === 'ol') {
        element.querySelectorAll(':scope > li').forEach(item => output.push(paragraphFromElement(item, { bullet: tag === 'ul', numbered: tag === 'ol' })));
      } else if (tag === 'table') {
        const rows = Array.from(element.querySelectorAll(':scope > tbody > tr, :scope > tr')).map(row => new TableRow({
          children: Array.from(row.querySelectorAll(':scope > td, :scope > th')).map(cell => new TableCell({ children: [paragraphFromElement(cell)] })),
        }));
        if (rows.length) output.push(new Table({ rows }));
      } else if (['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote'].includes(tag)) {
        output.push(paragraphFromElement(element));
      } else if (tag === 'hr') {
        output.push(new Paragraph({ text: '────────────────────────────────' }));
      } else {
        output.push(paragraphFromElement(element));
      }
    });
  };
  const blocks = Array.from(root.children);
  if (!blocks.length && root.textContent) output.push(new Paragraph({ text: root.textContent }));
  else addBlocks(blocks);
  if (!output.length) output.push(new Paragraph({ text: '' }));
  return output;
}

function splitOverflowingParagraph(block: HTMLElement, pageEditor: HTMLElement): HTMLElement | null {
  if (!['P', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6'].includes(block.tagName)) return null;
  const walker = window.document.createTreeWalker(block, NodeFilter.SHOW_TEXT);
  const textNodes: Text[] = [];
  let total = 0;
  while (walker.nextNode()) {
    const node = walker.currentNode as Text;
    textNodes.push(node);
    total += node.length;
  }
  if (total < 2) return null;
  const pointAt = (offset: number) => {
    let remaining = offset;
    for (const node of textNodes) {
      if (remaining <= node.length) return { node, offset: remaining };
      remaining -= node.length;
    }
    const node = textNodes.at(-1)!;
    return { node, offset: node.length };
  };
  const editorBottom = pageEditor.getBoundingClientRect().bottom - 4;
  const fits = (offset: number) => {
    const point = pointAt(offset);
    const range = window.document.createRange();
    range.selectNodeContents(block);
    range.setEnd(point.node, point.offset);
    const rect = range.getBoundingClientRect();
    return rect.height > 0 && rect.bottom <= editorBottom;
  };
  let low = 1;
  let high = total - 1;
  let best = 0;
  while (low <= high) {
    const middle = Math.floor((low + high) / 2);
    if (fits(middle)) { best = middle; low = middle + 1; }
    else high = middle - 1;
  }
  if (!best) return null;
  const text = textNodes.map(node => node.data).join('');
  const boundary = text.slice(0, best).search(/\s(?=\S*$)/u);
  const splitAt = boundary > 0 ? boundary + 1 : best;
  const point = pointAt(splitAt);
  const tailRange = window.document.createRange();
  tailRange.selectNodeContents(block);
  tailRange.setStart(point.node, point.offset);
  const tail = tailRange.extractContents();
  const continuation = block.cloneNode(false) as HTMLElement;
  continuation.append(tail);
  return continuation.textContent ? continuation : null;
}

function documentTextOffset(editors: HTMLElement[], node: Node, offset: number): number | null {
  let preceding = 0;
  for (const editor of editors) {
    if (editor === node || editor.contains(node)) {
      const range = window.document.createRange();
      range.selectNodeContents(editor);
      try {
        range.setEnd(node, offset);
        return preceding + range.toString().length;
      } catch {
        return null;
      }
    }
    preceding += (editor.textContent?.length ?? 0) + 1;
  }
  return null;
}

function textPositionAt(editors: HTMLElement[], requestedOffset: number): { node: Node; offset: number } | null {
  let remaining = Math.max(0, requestedOffset);
  for (const editor of editors) {
    const walker = window.document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
    let foundText = false;
    while (walker.nextNode()) {
      const text = walker.currentNode as Text;
      foundText = true;
      if (remaining <= text.length) return { node: text, offset: remaining };
      remaining -= text.length;
    }
    if (!foundText && remaining === 0) return { node: editor, offset: 0 };
    remaining = Math.max(0, remaining - 1);
  }
  const lastEditor = editors.at(-1);
  return lastEditor ? { node: lastEditor, offset: lastEditor.childNodes.length } : null;
}

function edgeTextNode(editor: HTMLElement, fromEnd: boolean): Text | null {
  const walker = window.document.createTreeWalker(editor, NodeFilter.SHOW_TEXT);
  const nodes: Text[] = [];
  while (walker.nextNode()) nodes.push(walker.currentNode as Text);
  return fromEnd ? nodes.at(-1) ?? null : nodes[0] ?? null;
}

function Writer({ documentId, onBack, onSwitchDocument }: WriterProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const workspaceRef = useRef<HTMLDivElement>(null);
  const savedSelectionRef = useRef<Range | null>(null);
  const selectionBookmarkRef = useRef<{ anchor: number; focus: number } | null>(null);
  const pendingPageGroupsRef = useRef<Node[][] | null>(null);
  const pendingSelectionBookmarkRef = useRef<{ anchor: number; focus: number } | null>(null);
  const activeImageRef = useRef<HTMLImageElement | null>(null);
  const paginationTimerRef = useRef<number | null>(null);
  const findInputRef = useRef<HTMLInputElement>(null);
  const replaceInputRef = useRef<HTMLInputElement>(null);
  const saveChain = useRef<Promise<void>>(Promise.resolve());
  const revisionRef = useRef(0);
  const loadedRef = useRef(false);
  const historyRef = useRef(new EditHistory<string>(80, 650, html => html.length * 2, 16 * 1024 * 1024));
  const historyGroupTimerRef = useRef<number | null>(null);
  const [recoveryDraft, setRecoveryDraft] = useState<WriterRecoveryDraft | null>(null);
  const [canUndo, setCanUndo] = useState(false);
  const [canRedo, setCanRedo] = useState(false);
  const [record, setRecord] = useState<WorkspaceDocument | null>(null);
  const [title, setTitle] = useState('Untitled document');
  const [savedStatus, setSavedStatus] = useState('Loading document…');
  const [editRevision, setEditRevision] = useState(0);
  const [loadError, setLoadError] = useState('');
  const [ribbonTab, setRibbonTab] = useState<'Home' | 'Insert' | 'Layout' | 'References' | 'Review' | 'View'>('Home');
  const [fontFamily, setFontFamily] = useState('Arial');
  const [fontSize, setFontSize] = useState('3');
  const [zoom, setZoom] = useState(100);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [editorText, setEditorText] = useState('');
  const [layout, setLayout] = useState<WriterLayout>(DEFAULT_WRITER_LAYOUT);
  const [pageCount, setPageCount] = useState(1);
  const [pageSnippets, setPageSnippets] = useState<string[]>([]);
  const [bookView, setBookView] = useState(false);
  const [showPageNav, setShowPageNav] = useState(true);
  const [showOutline, setShowOutline] = useState(false);
  const [outline, setOutline] = useState<Array<{ id: string; text: string; level: number }>>([]);
  const [tableContext, setTableContext] = useState(false);
  const [tableHasHeader, setTableHasHeader] = useState(false);
  const [hasActiveImage, setHasActiveImage] = useState(false);
  const [selectedImageElement, setSelectedImageElement] = useState<HTMLImageElement | null>(null);
  const [imageOverlayRect, setImageOverlayRect] = useState<{ top: number; left: number; width: number; height: number } | null>(null);
  const [imageLayoutMode, setImageLayoutMode] = useState<'inline' | 'center' | 'left' | 'right' | 'float-left' | 'float-right'>('center');
  const [reviewReport, setReviewReport] = useState('');

  const pageEditors = useCallback(() => Array.from(editorRef.current?.querySelectorAll<HTMLDivElement>('.writer-editor') ?? []), []);
  const serializeContent = useCallback(() => pageEditors().map(editor => editor.innerHTML).join('') || '<p></p>', [pageEditors]);
  const readEditorText = useCallback(() => pageEditors().map(editor => editor.innerText).join('\n'), [pageEditors]);
  const readPageSnippets = useCallback(() => pageEditors().map(editor => editor.innerText.trim().slice(0, 110)), [pageEditors]);
  const restoreSelectionBookmark = useCallback((bookmark: { anchor: number; focus: number } | null) => {
    if (!bookmark) return;
    const editors = pageEditors();
    const length = editors.reduce((total, page) => total + (page.textContent?.length ?? 0), 0) + Math.max(0, editors.length - 1);
    const anchor = textPositionAt(editors, Math.min(bookmark.anchor, length));
    const focus = textPositionAt(editors, Math.min(bookmark.focus, length));
    const selection = window.getSelection();
    if (!anchor || !focus || !selection) return;
    try {
      selection.removeAllRanges();
      if (selection.setBaseAndExtent) selection.setBaseAndExtent(anchor.node, anchor.offset, focus.node, focus.offset);
      else {
        const range = window.document.createRange();
        range.setStart(anchor.node, anchor.offset);
        range.setEnd(focus.node, focus.offset);
        selection.addRange(range);
      }
      selectionBookmarkRef.current = bookmark;
      savedSelectionRef.current = selection.getRangeAt(0).cloneRange();
    } catch {
      selection.removeAllRanges();
    }
  }, [pageEditors]);

  const paginateDocument = useCallback(() => {
    const pages = Array.from(editorRef.current?.querySelectorAll<HTMLDivElement>('.writer-page') ?? []);
    const realEditors = pageEditors();
    if (!pages.length || !realEditors.length) return;
    const selection = window.getSelection();
    const selectionRoot = editorRef.current;
    const bookmark = selection?.rangeCount && selectionRoot?.contains(selection.anchorNode) && selection.focusNode
      ? {
          anchor: documentTextOffset(realEditors, selection.anchorNode, selection.anchorOffset),
          focus: documentTextOffset(realEditors, selection.focusNode, selection.focusOffset),
        }
      : null;
    const selectionRange = selection?.rangeCount && selectionRoot?.contains(selection.getRangeAt(0).commonAncestorContainer)
      ? selection.getRangeAt(0).cloneRange()
      : null;
    const isPageBreak = (node: Node) => node instanceof HTMLElement && /page-break-before:\s*always|break-before:\s*page/i.test(node.getAttribute('style') ?? '');
    const nodeHasContent = (node: Node) => node.nodeType === Node.TEXT_NODE
      ? Boolean(node.textContent?.trim())
      : node instanceof HTMLElement && Boolean(node.innerText.trim() || node.querySelector('img,table,hr,svg,video,canvas'));
    const hasVisibleContent = (editor: HTMLElement) => Array.from(editor.childNodes).some(nodeHasContent);
    const pageOverflows = (editor: HTMLElement) => {
      const lastBlock = editor.lastElementChild;
      return Boolean(lastBlock && lastBlock.getBoundingClientRect().bottom > editor.getBoundingClientRect().bottom + 2);
    };
    const allBlocks = realEditors.flatMap(editor => Array.from(editor.childNodes));
    const hasPendingBreak = realEditors.some(editor => {
      let contentBeforeBreak = false;
      for (const node of Array.from(editor.childNodes)) {
        if (isPageBreak(node)) {
          const hasContentAfter = allBlocks.slice(allBlocks.indexOf(node) + 1).some(nodeHasContent);
          if (contentBeforeBreak && hasContentAfter) return true;
        } else if (nodeHasContent(node)) contentBeforeBreak = true;
      }
      return false;
    });
    const trailingEmptyPage = realEditors.length > 1 && !hasVisibleContent(realEditors.at(-1)!);
    const overflowingPage = realEditors.some(pageOverflows);
    if (!trailingEmptyPage && !overflowingPage && !hasPendingBreak) return;
    const blocks: Node[] = [];
    realEditors.forEach(editor => Array.from(editor.childNodes).forEach(node => {
      if (node.nodeType === Node.TEXT_NODE && !node.textContent?.trim()) return;
      if (node.nodeType === Node.TEXT_NODE) {
        const paragraph = window.document.createElement('p');
        paragraph.textContent = node.textContent;
        blocks.push(paragraph);
      } else blocks.push(node);
    }));
    realEditors.forEach(editor => editor.replaceChildren());

    const workingEditors = [...realEditors];
    const ghostPages: HTMLDivElement[] = [];
    const addMeasurePage = () => {
      const ghost = pages[0].cloneNode(false) as HTMLDivElement;
      ghost.style.position = 'fixed';
      ghost.style.left = '-20000px';
      ghost.style.top = '0';
      ghost.style.visibility = 'hidden';
      ghost.style.pointerEvents = 'none';
      const content = realEditors[0].cloneNode(false) as HTMLDivElement;
      ghost.append(content);
      window.document.body.append(ghost);
      ghostPages.push(ghost);
      workingEditors.push(content);
    };

    let pageIndex = 0;
    let requiredPages = 1;
    const pending = [...blocks];
    while (pending.length) {
      const block = pending.shift()!;
      const hasContentAfterBreak = isPageBreak(block) && pending.some(nodeHasContent);
      if (isPageBreak(block) && hasContentAfterBreak && workingEditors[pageIndex]?.childElementCount && hasVisibleContent(workingEditors[pageIndex])) pageIndex += 1;
      while (pageIndex >= workingEditors.length) addMeasurePage();
      const target = workingEditors[pageIndex];
      target.append(block);
      if (pageOverflows(target)) {
        if (target.childElementCount > 1) {
          target.removeChild(block);
          pageIndex += 1;
          pending.unshift(block);
        } else {
          const continuation = block instanceof HTMLElement ? splitOverflowingParagraph(block, target) : null;
          if (continuation) {
            pageIndex += 1;
            pending.unshift(continuation);
          }
        }
      }
      requiredPages = Math.max(requiredPages, pageIndex + 1);
    }

    const pageCountChanged = requiredPages !== realEditors.length;
    if (pageCountChanged) {
      pendingPageGroupsRef.current = workingEditors.slice(0, requiredPages).map(editor => Array.from(editor.childNodes));
      pendingSelectionBookmarkRef.current = bookmark?.anchor !== null && bookmark?.focus !== null ? bookmark : selectionBookmarkRef.current;
      realEditors.forEach(editor => editor.replaceChildren());
      setPageCount(requiredPages);
    }
    ghostPages.forEach(page => page.remove());
    if (!pageCountChanged) {
      setPageSnippets(readPageSnippets());
      if (bookmark && bookmark.anchor !== null && bookmark.focus !== null) restoreSelectionBookmark(bookmark);
      else if (selectionRange && selectionRoot?.contains(selectionRange.commonAncestorContainer)) {
        selection?.removeAllRanges();
        selection?.addRange(selectionRange);
      }
    }
  }, [pageEditors, readPageSnippets, restoreSelectionBookmark, setPageSnippets]);

  const schedulePagination = useCallback(() => {
    if (paginationTimerRef.current !== null) window.clearTimeout(paginationTimerRef.current);
    paginationTimerRef.current = window.setTimeout(() => {
      paginationTimerRef.current = null;
      paginateDocument();
    }, 160);
  }, [paginateDocument]);

  const refreshOutline = () => {
    const editor = editorRef.current;
    if (!editor) return;
    const headings = Array.from(editor.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6,[data-nexus-style^="heading"]'))
      .filter(heading => !heading.closest('[data-nexus-toc]'));
    const items = headings.map((heading, index) => {
      const id = heading.id || `nexus-heading-${index}`;
      heading.id = id;
      heading.setAttribute('data-nexus-outline-id', id);
      const customLevel = heading.dataset.nexusStyle?.match(/^heading([1-9])$/)?.[1];
      return { id, text: heading.textContent?.trim() || `Untitled heading ${index + 1}`, level: customLevel ? Number(customLevel) : Number(heading.tagName.slice(1)) };
    });
    const signature = items.map(item => `${item.id}:${item.level}:${item.text}`).join('\u001f');
    const escape = (value: string) => value.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
    editor.querySelectorAll<HTMLElement>('[data-nexus-toc]').forEach(toc => {
      if (toc.dataset.nexusSignature === signature) return;
      const entries = toc.querySelector<HTMLElement>('[data-nexus-toc-entries]');
      if (!entries) return;
      entries.innerHTML = items.map(item => `<p style="margin-left:${Math.max(0, item.level - 1) * 18}px"><a href="#${item.id}">${escape(item.text)}</a></p>`).join('') || '<p>No headings in this document.</p>';
      toc.dataset.nexusSignature = signature;
    });
    setOutline(items);
  };

  const jumpToHeading = (id: string) => {
    const heading = editorRef.current?.querySelector<HTMLElement>(`[data-nexus-outline-id="${id}"]`);
    if (!heading) return;
    heading.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const range = window.document.createRange();
    range.selectNodeContents(heading);
    range.collapse(true);
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    editorRef.current?.focus();
    rememberSelection();
  };

  const jumpToPage = (index: number) => {
    const page = pageEditors()[index];
    if (!page) return;
    page.parentElement?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const range = window.document.createRange();
    const lastText = edgeTextNode(page, true);
    if (lastText) {
      range.setStart(lastText, lastText.length);
      range.collapse(true);
    } else {
      range.selectNodeContents(page);
      range.collapse(true);
    }
    const selection = window.getSelection();
    selection?.removeAllRanges();
    selection?.addRange(range);
    editorRef.current?.focus();
    rememberSelection();
  };

  const deletePageContent = (index: number) => {
    const editors = pageEditors();
    const page = editors[index];
    if (!page || !editorRef.current) return;
    const breakNode = page.querySelector<HTMLElement>('[style*="break-before"], [style*="page-break-before"]')
      ?? (index > 0 ? editors[index - 1].querySelector<HTMLElement>('[style*="break-before"], [style*="page-break-before"]') : null);
    const range = window.document.createRange();
    if (breakNode && !page.innerText.trim()) range.selectNode(breakNode);
    else range.selectNodeContents(page);
    const selection = window.getSelection();
    editorRef.current.focus();
    selection?.removeAllRanges();
    selection?.addRange(range);
    checkpointHistory();
    window.document.execCommand('delete');
    rememberSelection();
    updateEditorAfterStructureChange();
  };

  const handlePageBoundaryDelete = (event: ReactKeyboardEvent<HTMLDivElement>) => {
    if ((event.key !== 'Backspace' && event.key !== 'Delete') || event.ctrlKey || event.metaKey || event.altKey || event.shiftKey) return false;
    const editors = pageEditors();
    const selection = window.getSelection();
    const focusElement = selection?.focusNode instanceof HTMLElement ? selection.focusNode : selection?.focusNode?.parentElement;
    const page = (focusElement?.closest('.writer-editor') ?? null) as HTMLDivElement | null;
    const pageIndex = page ? editors.indexOf(page) : -1;
    if (!page || pageIndex < 0 || !selection?.isCollapsed || !selection.rangeCount || !selection.focusNode) return false;
    const offset = documentTextOffset([page], selection.focusNode, selection.focusOffset);
    if (offset === null) return false;
    const backwards = event.key === 'Backspace';
    const atBoundary = backwards ? offset === 0 && pageIndex > 0 : offset === (page.textContent?.length ?? 0) && pageIndex < editors.length - 1;
    if (!atBoundary) return false;

    event.preventDefault();
    const adjacent = editors[pageIndex + (backwards ? -1 : 1)];
    const boundaryBreak = backwards
      ? page.firstElementChild?.matches('[style*="break-before"], [style*="page-break-before"]') ? page.firstElementChild as HTMLElement : null
      : adjacent.firstElementChild?.matches('[style*="break-before"], [style*="page-break-before"]') ? adjacent.firstElementChild as HTMLElement : null;
    if (boundaryBreak) {
      const range = window.document.createRange();
      range.selectNode(boundaryBreak);
      selection.removeAllRanges();
      selection.addRange(range);
      checkpointHistory();
      window.document.execCommand('delete');
      updateEditorAfterStructureChange();
      rememberSelection();
      return true;
    }

    const textNode = edgeTextNode(adjacent, backwards);
    if (!textNode) {
      const range = window.document.createRange();
      range.selectNodeContents(adjacent);
      range.collapse(!backwards);
      selection.removeAllRanges();
      selection.addRange(range);
      rememberSelection();
      schedulePagination();
      return true;
    }
    const character = backwards ? Array.from(textNode.data).at(-1) : Array.from(textNode.data)[0];
    if (!character) return true;
    const range = window.document.createRange();
    if (backwards) {
      range.setStart(textNode, textNode.length - character.length);
      range.setEnd(textNode, textNode.length);
    } else {
      range.setStart(textNode, 0);
      range.setEnd(textNode, character.length);
    }
    selection.removeAllRanges();
    selection.addRange(range);
    checkpointHistory();
    window.document.execCommand('delete');
    updateEditorAfterStructureChange();
    rememberSelection();
    return true;
  };

  const updateLayout = (changes: Partial<WriterLayout>) => {
    setLayout(current => ({ ...current, ...changes }));
    markChanged();
  };

  const updateEditorAfterStructureChange = () => {
    setEditorText(readEditorText());
    setPageSnippets(readPageSnippets());
    refreshOutline();
    markChanged();
    schedulePagination();
  };

  const getSelectedCells = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return [];
    const range = selection.getRangeAt(0);
    return Array.from(editor.querySelectorAll<HTMLTableCellElement>('td,th')).filter(cell => {
      try { return range.intersectsNode(cell); } catch { return false; }
    });
  };

  const updateTableContext = () => {
    const cells = getSelectedCells();
    setTableContext(cells.length > 0);
    setTableHasHeader(Boolean(cells[0]?.closest('table')?.tHead));
  };

  const insertTable = () => {
    const rows = Number(window.prompt('Number of rows (1–20)', '3'));
    if (!Number.isInteger(rows) || rows < 1 || rows > 20) return;
    const columns = Number(window.prompt('Number of columns (1–12)', '3'));
    if (!Number.isInteger(columns) || columns < 1 || columns > 12) return;
    const tableRows = Array.from({ length: rows }, () => `<tr>${Array.from({ length: columns }, () => '<td><br></td>').join('')}</tr>`).join('');
    insertHtml(`<table><tbody>${tableRows}</tbody></table><p><br></p>`);
  };

  const insertStaticContents = () => {
    const headings = Array.from(editorRef.current?.querySelectorAll<HTMLElement>('h1,h2,h3,h4,h5,h6') ?? []);
    if (!headings.length) {
      setLoadError('Add heading styles before inserting a table of contents.');
      return;
    }
    if (!headings.length) return;
    insertHtml(`<div class="nexus-toc" data-nexus-toc="true" contenteditable="false"><strong data-nexus-toc-title="true">Contents</strong><div data-nexus-toc-entries="true"></div></div><p><br></p>`);
    refreshOutline();
    setLoadError('');
  };

  const addTableRow = (position: 'above' | 'below') => {
    const cell = getSelectedCells()[0];
    const row = cell?.closest('tr');
    if (!row) return;
    checkpointHistory();
    const nextRow = window.document.createElement('tr');
    for (let index = 0; index < row.cells.length; index += 1) {
      const nextCell = window.document.createElement('td');
      nextCell.innerHTML = '<br>';
      nextRow.append(nextCell);
    }
    row.insertAdjacentElement(position === 'above' ? 'beforebegin' : 'afterend', nextRow);
    updateEditorAfterStructureChange();
  };

  const addTableColumn = (position: 'left' | 'right') => {
    const cell = getSelectedCells()[0];
    const table = cell?.closest('table');
    if (!table) return;
    checkpointHistory();
    const insertionIndex = cell.cellIndex + (position === 'right' ? 1 : 0);
    Array.from(table.rows).forEach(row => {
      const isHeader = row.parentElement?.tagName === 'THEAD';
      const nextCell = window.document.createElement(isHeader ? 'th' : 'td');
      if (isHeader) nextCell.setAttribute('scope', 'col');
      nextCell.innerHTML = '<br>';
      row.insertBefore(nextCell, row.cells[insertionIndex] ?? null);
    });
    updateEditorAfterStructureChange();
  };

  const alignSelectedCells = (alignment: 'left' | 'center' | 'right', vertical: 'top' | 'middle' | 'bottom') => {
    const cells = getSelectedCells();
    if (!cells.length) return;
    checkpointHistory();
    cells.forEach(cell => {
      cell.style.textAlign = alignment;
      cell.style.verticalAlign = vertical;
    });
    updateEditorAfterStructureChange();
  };

  const shadeSelectedCells = (color: string) => {
    const cells = getSelectedCells();
    if (!cells.length) return;
    checkpointHistory();
    cells.forEach(cell => { cell.style.backgroundColor = color; });
    updateEditorAfterStructureChange();
  };

  const toggleHeaderRow = () => {
    const table = getSelectedCells()[0]?.closest('table');
    if (!table) return;
    checkpointHistory();
    if (table.tHead) {
      const header = table.tHead;
      const firstRow = header.rows[0];
      const body = table.tBodies[0] ?? table.createTBody();
      if (firstRow) {
        Array.from(firstRow.cells).forEach(cell => {
          const regular = window.document.createElement('td');
          regular.innerHTML = cell.innerHTML;
          regular.style.cssText = cell.style.cssText;
          cell.replaceWith(regular);
        });
        body.insertBefore(firstRow, body.firstChild);
      }
      header.remove();
      setTableHasHeader(false);
    } else {
      const firstRow = table.rows[0];
      if (!firstRow) return;
      const header = table.createTHead();
      header.append(firstRow);
      Array.from(firstRow.cells).forEach(cell => {
        const heading = window.document.createElement('th');
        heading.scope = 'col';
        heading.innerHTML = cell.innerHTML;
        heading.style.cssText = cell.style.cssText;
        cell.replaceWith(heading);
      });
      setTableHasHeader(true);
    }
    updateEditorAfterStructureChange();
  };

  const deleteTableRow = () => {
    const cell = getSelectedCells()[0];
    const row = cell?.closest('tr');
    if (!row) return;
    const table = row.closest('table');
    checkpointHistory();
    row.remove();
    if (table && !table.rows.length) { table.remove(); setTableContext(false); }
    updateEditorAfterStructureChange();
  };

  const deleteTableColumn = () => {
    const cell = getSelectedCells()[0];
    const table = cell?.closest('table');
    if (!cell || !table) return;
    const index = cell.cellIndex;
    checkpointHistory();
    Array.from(table.rows).forEach(row => row.cells[index]?.remove());
    if (table.rows.length && table.rows[0].cells.length === 0) { table.remove(); setTableContext(false); }
    updateEditorAfterStructureChange();
  };

  const deleteTable = () => {
    const table = getSelectedCells()[0]?.closest('table');
    if (!table) return;
    checkpointHistory();
    table.remove();
    setTableContext(false);
    updateEditorAfterStructureChange();
  };

  const mergeSelectedCells = () => {
    const cells = getSelectedCells();
    if (cells.length < 2 || cells.some(cell => cell.parentElement !== cells[0].parentElement)) {
      setLoadError('Select two or more cells in the same row to merge them.');
      return;
    }
    const [first, ...rest] = cells;
    checkpointHistory();
    rest.forEach(cell => {
      if (cell.textContent?.trim()) {
        const paragraph = window.document.createElement('p');
        paragraph.innerHTML = cell.innerHTML;
        first.append(paragraph);
      }
      cell.remove();
    });
    first.colSpan = cells.reduce((sum, cell) => sum + cell.colSpan, 0);
    updateEditorAfterStructureChange();
  };

  const splitCell = () => {
    const cell = getSelectedCells()[0];
    if (!cell || cell.colSpan < 2) {
      setLoadError('Choose a merged cell to split.');
      return;
    }
    checkpointHistory();
    const extra = cell.colSpan - 1;
    cell.colSpan = 1;
    for (let index = 0; index < extra; index += 1) {
      const next = window.document.createElement('td');
      next.innerHTML = '<br>';
      cell.after(next);
    }
    updateEditorAfterStructureChange();
  };

  const updateImageOverlay = useCallback((target?: HTMLImageElement | null) => {
    const img = target ?? activeImageRef.current;
    if (!img || !editorRef.current || !workspaceRef.current) {
      setImageOverlayRect(null);
      return;
    }
    if (!editorRef.current.contains(img)) {
      activeImageRef.current = null;
      setSelectedImageElement(null);
      setHasActiveImage(false);
      setImageOverlayRect(null);
      return;
    }
    const imgRect = img.getBoundingClientRect();
    const wsRect = workspaceRef.current.getBoundingClientRect();
    setImageOverlayRect({
      top: imgRect.top - wsRect.top + workspaceRef.current.scrollTop,
      left: imgRect.left - wsRect.left + workspaceRef.current.scrollLeft,
      width: imgRect.width,
      height: imgRect.height,
    });
  }, []);

  const setPresetImageWidth = (percentage: number) => {
    const activeImage = activeImageRef.current;
    if (!activeImage || !editorRef.current?.contains(activeImage)) return;
    checkpointHistory();
    activeImage.style.width = `${percentage}%`;
    activeImage.style.maxWidth = '100%';
    activeImage.style.height = 'auto';
    updateEditorAfterStructureChange();
    setTimeout(() => updateImageOverlay(), 20);
  };

  const resizeImage = (amount: number) => {
    const activeImage = activeImageRef.current;
    if (!activeImage || !editorRef.current?.contains(activeImage)) return;
    checkpointHistory();
    const current = Number.parseFloat(activeImage.style.width) || 50;
    activeImage.style.width = `${Math.max(10, Math.min(100, current + amount))}%`;
    activeImage.style.maxWidth = '100%';
    activeImage.style.height = 'auto';
    updateEditorAfterStructureChange();
    setTimeout(() => updateImageOverlay(), 20);
  };

  const setImageLayout = (mode: 'inline' | 'center' | 'left' | 'right' | 'float-left' | 'float-right') => {
    const img = activeImageRef.current;
    if (!img || !editorRef.current?.contains(img)) return;
    checkpointHistory();
    img.style.maxWidth = '100%';
    img.style.height = 'auto';
    if (mode === 'inline') {
      img.style.display = 'inline-block';
      img.style.float = 'none';
      img.style.clear = 'none';
      img.style.margin = '4px 8px';
      img.style.verticalAlign = 'middle';
    } else if (mode === 'center') {
      img.style.display = 'block';
      img.style.float = 'none';
      img.style.clear = 'both';
      img.style.marginInline = 'auto';
      img.style.marginBlock = '16px';
    } else if (mode === 'left') {
      img.style.display = 'block';
      img.style.float = 'none';
      img.style.clear = 'both';
      img.style.marginInline = '0 auto';
      img.style.marginBlock = '16px';
    } else if (mode === 'right') {
      img.style.display = 'block';
      img.style.float = 'none';
      img.style.clear = 'both';
      img.style.marginInline = 'auto 0';
      img.style.marginBlock = '16px';
    } else if (mode === 'float-left') {
      img.style.display = 'block';
      img.style.float = 'left';
      img.style.clear = 'none';
      img.style.margin = '8px 18px 12px 0';
    } else if (mode === 'float-right') {
      img.style.display = 'block';
      img.style.float = 'right';
      img.style.clear = 'none';
      img.style.margin = '8px 0 12px 18px';
    }
    setImageLayoutMode(mode);
    updateEditorAfterStructureChange();
    setTimeout(() => updateImageOverlay(), 20);
  };

  const moveImagePosition = (direction: 'up' | 'down') => {
    const img = activeImageRef.current;
    if (!img || !editorRef.current?.contains(img)) return;
    checkpointHistory();
    const parentBlock = img.closest('p, div, h1, h2, h3, h4, h5, h6, blockquote') ?? img;
    if (direction === 'up') {
      const prev = parentBlock.previousElementSibling;
      if (prev) {
        parentBlock.parentElement?.insertBefore(img, prev);
      }
    } else {
      const next = parentBlock.nextElementSibling;
      if (next) {
        next.insertAdjacentElement('afterend', img);
      }
    }
    updateEditorAfterStructureChange();
    setTimeout(() => updateImageOverlay(), 20);
  };

  const removeActiveImage = () => {
    const activeImage = activeImageRef.current;
    if (!activeImage || !editorRef.current?.contains(activeImage)) return;
    checkpointHistory();
    activeImage.remove();
    activeImageRef.current = null;
    setSelectedImageElement(null);
    setHasActiveImage(false);
    setImageOverlayRect(null);
    updateEditorAfterStructureChange();
  };

  const handleResizeMouseDown = (e: React.MouseEvent, corner: 'se' | 'sw' | 'ne' | 'nw') => {
    e.preventDefault();
    e.stopPropagation();
    const img = activeImageRef.current;
    if (!img) return;

    const startX = e.clientX;
    const startWidth = img.offsetWidth;
    const parent = img.closest('.writer-editor') as HTMLElement | null;
    const parentWidth = parent ? parent.clientWidth - 40 : 700;

    const onMouseMove = (moveEvent: MouseEvent) => {
      moveEvent.preventDefault();
      const deltaX = (corner === 'se' || corner === 'ne')
        ? moveEvent.clientX - startX
        : startX - moveEvent.clientX;
      const newWidthPx = Math.max(50, Math.min(parentWidth, startWidth + deltaX));
      const percentage = Math.round((newWidthPx / parentWidth) * 100);
      img.style.width = `${Math.min(100, Math.max(10, percentage))}%`;
      img.style.maxWidth = '100%';
      img.style.height = 'auto';
      updateImageOverlay(img);
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      checkpointHistory();
      updateEditorAfterStructureChange();
      setTimeout(() => updateImageOverlay(), 20);
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  useEffect(() => {
    const handleResize = () => updateImageOverlay();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [updateImageOverlay]);

  useEffect(() => {
    let cancelled = false;
    loadedRef.current = false;
    Promise.all([documentStore.get(documentId), documentStore.getRecovery(documentId)]).then(([saved, recovery]) => {
      if (cancelled) return;
      if (!saved || saved.app !== 'writer') {
        setLoadError('This document could not be found in local storage.');
        setSavedStatus('Could not open document');
        return;
      }
      setRecord(saved);
      setTitle(saved.title);
      setLayout(saved.layout ?? DEFAULT_WRITER_LAYOUT);
      const firstEditor = editorRef.current?.querySelector<HTMLDivElement>('.writer-editor');
      if (firstEditor) {
        firstEditor.innerHTML = safeDocumentHtml(saved.content);
        historyRef.current.reset();
        setEditorText(firstEditor.innerText);
        setPageSnippets([firstEditor.innerText.trim().slice(0, 110)]);
        refreshOutline();
        schedulePagination();
      }
      const recoveryDiffers = recovery && (
        recovery.content !== saved.content
        || recovery.title !== saved.title
        || JSON.stringify(recovery.layout) !== JSON.stringify(saved.layout ?? DEFAULT_WRITER_LAYOUT)
      );
      if (recovery && recoveryDiffers && recovery.updatedAt > saved.updatedAt) setRecoveryDraft(recovery);
      loadedRef.current = true;
      setSavedStatus('Saved on this device');
    }).catch(error => {
      if (!cancelled) {
        setLoadError(error instanceof Error ? error.message : 'Could not read local document storage.');
        setSavedStatus('Could not open document');
      }
    });
    return () => { cancelled = true; };
  }, [documentId, schedulePagination]);

  useEffect(() => {
    schedulePagination();
    return () => {
      if (paginationTimerRef.current !== null) window.clearTimeout(paginationTimerRef.current);
    };
  }, [layout, pageCount, schedulePagination]);

  useLayoutEffect(() => {
    const pageGroups = pendingPageGroupsRef.current;
    if (!pageGroups) return;
    const editors = pageEditors();
    editors.forEach((editor, index) => editor.replaceChildren(...(pageGroups[index] ?? [])));
    pendingPageGroupsRef.current = null;
    setPageSnippets(readPageSnippets());
    restoreSelectionBookmark(pendingSelectionBookmarkRef.current);
    pendingSelectionBookmarkRef.current = null;
  }, [pageCount, pageEditors, readPageSnippets, restoreSelectionBookmark]);

  const markChanged = () => {
    revisionRef.current += 1;
    setEditRevision(revisionRef.current);
    setCanUndo(historyRef.current.canUndo);
    setCanRedo(historyRef.current.canRedo);
    setSavedStatus('Unsaved changes');
    setReviewReport('');
  };

  const historyEntryAtSelection = (): HistoryEntry<string> => {
    const selection = window.getSelection();
    const editors = pageEditors();
    const bookmark = selection?.rangeCount && selection.anchorNode && selection.focusNode
      ? {
          anchor: documentTextOffset(editors, selection.anchorNode, selection.anchorOffset),
          focus: documentTextOffset(editors, selection.focusNode, selection.focusOffset),
        }
      : null;
    return {
      state: serializeContent(),
      bookmark: bookmark && bookmark.anchor !== null && bookmark.focus !== null ? bookmark : selectionBookmarkRef.current,
    };
  };

  const checkpointHistory = (inputType: string | null = null) => {
    historyRef.current.checkpoint(historyEntryAtSelection(), inputType);
    if (historyGroupTimerRef.current !== null) window.clearTimeout(historyGroupTimerRef.current);
    if (inputType !== null) {
      historyGroupTimerRef.current = window.setTimeout(() => {
        historyGroupTimerRef.current = null;
        historyRef.current.breakGroup();
      }, 650);
    } else historyGroupTimerRef.current = null;
  };

  const restoreHistoryEntry = (entry: HistoryEntry<string>) => {
    const editors = pageEditors();
    const firstEditor = editors[0];
    if (!firstEditor) return;
    if (paginationTimerRef.current !== null) window.clearTimeout(paginationTimerRef.current);
    firstEditor.innerHTML = safeDocumentHtml(entry.state);
    editors.slice(1).forEach(editor => editor.replaceChildren());
    setPageCount(1);
    setEditorText(readEditorText());
    setPageSnippets(readPageSnippets());
    refreshOutline();
    const bookmark = entry.bookmark ?? { anchor: readEditorText().length, focus: readEditorText().length };
    restoreSelectionBookmark(bookmark);
    selectionBookmarkRef.current = bookmark;
    markChanged();
    schedulePagination();
  };

  const undoEdit = () => {
    const previous = historyRef.current.undo(historyEntryAtSelection());
    if (previous) restoreHistoryEntry(previous);
  };

  const redoEdit = () => {
    const next = historyRef.current.redo(historyEntryAtSelection());
    if (next) restoreHistoryEntry(next);
  };

  const restoreRecoveryDraft = () => {
    if (!recoveryDraft) return;
    checkpointHistory();
    const firstEditor = pageEditors()[0];
    if (!firstEditor) return;
    firstEditor.innerHTML = safeDocumentHtml(recoveryDraft.content);
    pageEditors().slice(1).forEach(editor => editor.replaceChildren());
    setTitle(recoveryDraft.title);
    setLayout(recoveryDraft.layout ?? DEFAULT_WRITER_LAYOUT);
    setPageCount(1);
    setEditorText(readEditorText());
    setPageSnippets(readPageSnippets());
    refreshOutline();
    setRecoveryDraft(null);
    markChanged();
    schedulePagination();
  };

  const discardRecoveryDraft = async () => {
    try {
      await documentStore.clearRecovery(documentId);
      setRecoveryDraft(null);
      setSavedStatus('Saved on this device');
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not discard the recovery draft.');
    }
  };

  const rememberSelection = () => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount || !selection.anchorNode || !selection.focusNode) return;
    const range = selection.getRangeAt(0);
    if (editor.contains(range.commonAncestorContainer)) {
      savedSelectionRef.current = range.cloneRange();
      const editors = pageEditors();
      const anchor = documentTextOffset(editors, selection.anchorNode, selection.anchorOffset);
      const focus = documentTextOffset(editors, selection.focusNode, selection.focusOffset);
      if (anchor !== null && focus !== null) selectionBookmarkRef.current = { anchor, focus };
    }
  };

  const focusEditor = () => {
    const editor = editorRef.current;
    if (!editor) return;
    editor.focus();
    const saved = savedSelectionRef.current;
    if (saved && editor.contains(saved.commonAncestorContainer)) {
      const selection = window.getSelection();
      selection?.removeAllRanges();
      selection?.addRange(saved);
      return;
    }
    const bookmark = selectionBookmarkRef.current;
    restoreSelectionBookmark(bookmark);
  };

  const saveDocument = useCallback(async () => {
    if (!loadedRef.current || !record || !editorRef.current) return false;
    if (recoveryDraft) {
      setSavedStatus('Choose whether to recover the unsaved draft');
      return false;
    }
    const revision = revisionRef.current;
    const changes = { title: title.trim() || 'Untitled document', content: serializeContent(), layout };
    setSavedStatus('Saving…');
    const operation = saveChain.current.then(async () => {
      await documentStore.save(documentId, changes);
    });
    saveChain.current = operation.catch(() => undefined);
    try {
      await operation;
      if (revision === revisionRef.current) setSavedStatus('Saved on this device');
      return true;
    } catch (error) {
      if (revision === revisionRef.current) {
        setSavedStatus('Save failed');
        setLoadError(error instanceof Error ? error.message : 'Could not save this document.');
      }
      return false;
    }
  }, [documentId, layout, record, recoveryDraft, serializeContent, title]);

  useEffect(() => {
    if (!loadedRef.current) return;
    const timer = window.setTimeout(() => { void saveDocument(); }, 800);
    return () => window.clearTimeout(timer);
  }, [editRevision, saveDocument]);

  useEffect(() => {
    if (!loadedRef.current || !record || recoveryDraft || revisionRef.current === 0) return;
    const revision = revisionRef.current;
    const timer = window.setTimeout(() => {
      if (revision !== revisionRef.current) return;
      const draft: WriterRecoveryDraft = {
        documentId, title: title.trim() || 'Untitled document', content: serializeContent(), layout, updatedAt: new Date().toISOString(),
      };
      const operation = saveChain.current.then(async () => {
        if (revision === revisionRef.current) await documentStore.saveRecovery(draft);
      });
      saveChain.current = operation.catch(() => undefined);
      void operation.catch(error => {
        if (revision === revisionRef.current) setSavedStatus(error instanceof Error ? 'Recovery snapshot failed' : 'Recovery snapshot unavailable');
      });
    }, 300);
    return () => window.clearTimeout(timer);
  }, [documentId, editRevision, layout, record, recoveryDraft, serializeContent, title]);

  const returnToLibrary = async () => {
    if (!savedStatus.startsWith('Saved')) {
      const saved = await saveDocument();
      if (!saved) return;
    }
    onBack();
  };

  const format = (command: string, value?: string) => {
    focusEditor();
    if (command !== 'undo' && command !== 'redo') checkpointHistory();
    window.document.execCommand(command, false, value);
    markChanged();
  };

  const applyParagraphStyle = (style: string) => {
    focusEditor();
    checkpointHistory();
    const semanticTag = style.match(/^heading([1-6])$/)?.[1];
    const simpleTag = semanticTag ? `h${semanticTag}` : style === 'quote' ? 'blockquote' : 'p';
    window.document.execCommand('formatBlock', false, simpleTag);
    const selection = window.getSelection();
    const anchor = selection?.anchorNode instanceof HTMLElement ? selection.anchorNode : selection?.anchorNode?.parentElement;
    const block = anchor?.closest<HTMLElement>('p,h1,h2,h3,h4,h5,h6,blockquote,div');
    if (block && !block.classList.contains('writer-editor') && editorRef.current?.contains(block)) {
      block.classList.remove('nexus-title', 'nexus-subtitle', 'nexus-heading-7', 'nexus-heading-8', 'nexus-heading-9');
      delete block.dataset.nexusStyle;
      if (style === 'title' || style === 'subtitle' || /^heading[789]$/.test(style)) {
        block.dataset.nexusStyle = style;
        block.classList.add(style === 'title' ? 'nexus-title' : style === 'subtitle' ? 'nexus-subtitle' : `nexus-${style.replace('heading', 'heading-')}`);
      }
    }
    refreshOutline();
    markChanged();
    schedulePagination();
  };

  const selectedParagraphs = (): HTMLElement[] => {
    const editor = editorRef.current;
    const selection = window.getSelection();
    if (!editor || !selection?.rangeCount) return [];
    const range = selection.getRangeAt(0);
    const candidates = Array.from(editor.querySelectorAll<HTMLElement>('p,h1,h2,h3,h4,h5,h6,blockquote,li'));
    if (selection.isCollapsed) {
      const anchor = selection.anchorNode instanceof HTMLElement ? selection.anchorNode : selection.anchorNode?.parentElement;
      const block = anchor?.closest<HTMLElement>('p,h1,h2,h3,h4,h5,h6,blockquote,li');
      return block && editor.contains(block) ? [block] : [];
    }
    return candidates.filter(block => {
      try { return range.intersectsNode(block); } catch { return false; }
    });
  };

  const changeParagraphSpacing = (property: 'lineHeight' | 'marginBottom', value: string) => {
    focusEditor();
    const blocks = selectedParagraphs();
    if (!blocks.length) return;
    checkpointHistory();
    blocks.forEach(block => { block.style[property] = value; });
    updateEditorAfterStructureChange();
  };

  const changeParagraphIndent = (amount: number) => {
    focusEditor();
    const blocks = selectedParagraphs();
    if (!blocks.length) return;
    checkpointHistory();
    blocks.forEach(block => {
      const current = Number.parseFloat(block.style.marginLeft) || 0;
      block.style.marginLeft = `${Math.max(0, Math.min(360, current + amount))}px`;
    });
    updateEditorAfterStructureChange();
  };

  const insertHtml = (html: string) => {
    focusEditor();
    checkpointHistory();
    window.document.execCommand('insertHTML', false, html);
    markChanged();
  };

  const insertLink = () => {
    const url = window.prompt('Enter the link address');
    if (!url) return;
    format('createLink', url);
  };

  const insertImage = (file?: File) => {
    if (!file || !file.type.startsWith('image/')) return;
    const reader = new FileReader();
    reader.onload = () => insertHtml(`<img src="${String(reader.result)}" alt="${file.name.replace(/[&<>"']/g, '')}" draggable="true" style="max-width:100%;height:auto;display:block;margin:16px auto;width:60%;" />`);
    reader.onerror = () => setLoadError('Could not read this image file.');
    reader.readAsDataURL(file);
  };

  const findNext = () => {
    if (!findText || !editorRef.current) return;
    const nodes = pageEditors().flatMap(page => {
      const walker = window.document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
      const pageNodes: Text[] = [];
      while (walker.nextNode()) pageNodes.push(walker.currentNode as Text);
      return pageNodes;
    });
    if (!nodes.length) return;
    const selection = window.getSelection();
    const anchor = selection?.focusNode;
    const fromIndex = anchor ? nodes.findIndex(node => node === anchor || node.parentNode?.contains(anchor)) : -1;
    const startIndex = fromIndex >= 0 ? fromIndex : 0;
    const offset = anchor === nodes[startIndex] ? selection?.focusOffset ?? 0 : 0;
    const query = findText.toLocaleLowerCase();
    for (let pass = 0; pass < nodes.length; pass += 1) {
      const index = (startIndex + pass) % nodes.length;
      const node = nodes[index];
      const startAt = pass === 0 ? offset : 0;
      let match = node.data.toLocaleLowerCase().indexOf(query, startAt);
      if (match < 0 && pass === nodes.length - 1 && fromIndex >= 0) match = node.data.toLocaleLowerCase().indexOf(query, 0);
      if (match < 0) continue;
      const range = window.document.createRange();
      range.setStart(node, match);
      range.setEnd(node, match + findText.length);
      editorRef.current?.focus();
      selection?.removeAllRanges();
      selection?.addRange(range);
      setLoadError('');
      return;
    }
    setLoadError(`No more matches for “${findText}”.`);
  };

  const replaceCurrent = () => {
    const selection = window.getSelection();
    const currentRange = selection?.rangeCount ? selection.getRangeAt(0) : null;
    if (!selection || !currentRange || !editorRef.current?.contains(currentRange.commonAncestorContainer) || selection.isCollapsed || selection.toString().toLocaleLowerCase() !== findText.toLocaleLowerCase()) {
      findNext();
      return;
    }
    const range = currentRange;
    checkpointHistory();
    range.deleteContents();
    const replacement = window.document.createTextNode(replaceText);
    range.insertNode(replacement);
    range.setStartAfter(replacement);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
    markChanged();
  };

  const replaceAll = () => {
    if (!findText || !editorRef.current) return;
    const nodes = pageEditors().flatMap(page => {
      const walker = window.document.createTreeWalker(page, NodeFilter.SHOW_TEXT);
      const pageNodes: Text[] = [];
      while (walker.nextNode()) pageNodes.push(walker.currentNode as Text);
      return pageNodes;
    });
    const hasMatches = nodes.some(node => node.data.toLocaleLowerCase().includes(findText.toLocaleLowerCase()));
    if (hasMatches) checkpointHistory();
    let replaced = 0;
    nodes.forEach(node => {
      const expression = new RegExp(findText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
      const next = node.data.replace(expression, () => { replaced += 1; return replaceText; });
      if (next !== node.data) node.data = next;
    });
    setLoadError(`${replaced} occurrence${replaced === 1 ? '' : 's'} replaced.`);
    if (replaced) { setEditorText(readEditorText()); markChanged(); schedulePagination(); }
  };

  const exportDocx = async () => {
    try {
      const children = htmlToDocxChildren(serializeContent());
      const [paperWidth, paperHeight] = PAPER_DIMENSIONS_IN[layout.paper].map(inches => Math.round(inches * 1440));
      const portraitWidth = paperWidth;
      const portraitHeight = paperHeight;
      const pageWidth = layout.orientation === 'landscape' ? portraitHeight : portraitWidth;
      const pageHeight = layout.orientation === 'landscape' ? portraitWidth : portraitHeight;
      const doc = new Document({
        styles: { paragraphStyles: [
          { id: 'Heading7', name: 'Heading 7', basedOn: 'Heading6', uiPriority: 9, quickFormat: true, paragraph: { outlineLevel: 6 } },
          { id: 'Heading8', name: 'Heading 8', basedOn: 'Heading7', uiPriority: 10, quickFormat: true, paragraph: { outlineLevel: 7 } },
          { id: 'Heading9', name: 'Heading 9', basedOn: 'Heading8', uiPriority: 11, quickFormat: true, paragraph: { outlineLevel: 8 } },
        ] },
        numbering: { config: [{ reference: 'nexus-numbered-list', levels: [{ level: 0, format: LevelFormat.DECIMAL, text: '%1.', alignment: AlignmentType.LEFT }] }] },
        sections: [{ properties: { page: {
          size: { width: pageWidth, height: pageHeight, orientation: layout.orientation === 'landscape' ? PageOrientation.LANDSCAPE : PageOrientation.PORTRAIT },
          margin: { top: layout.margins.top * 1440, right: layout.margins.right * 1440, bottom: layout.margins.bottom * 1440, left: layout.margins.left * 1440 },
        } }, children }],
      });
      const blob = await Packer.toBlob(doc);
      const url = URL.createObjectURL(blob);
      const link = window.document.createElement('a');
      link.href = url;
      link.download = `${title.trim() || 'Untitled document'}.docx`;
      link.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch {
      setLoadError('DOCX export failed. Your local document is unchanged.');
    }
  };

  const exportPdf = async () => {
    if (!editorRef.current) return;
    setSavedStatus('Generating PDF…');
    const activeImg = activeImageRef.current;
    if (activeImg) activeImg.classList.remove('nexus-active-image');
    setImageOverlayRect(null);

    try {
      const { jsPDF } = await import('jspdf');
      const html2canvas = (await import('html2canvas')).default;

      const pages = Array.from(editorRef.current.querySelectorAll<HTMLDivElement>('.writer-page:not(.writer-page-preview)'));
      if (!pages.length) return;

      const [paperWidthIn, paperHeightIn] = PAPER_DIMENSIONS_IN[layout.paper];
      const pdfWidth = layout.orientation === 'landscape' ? paperHeightIn : paperWidthIn;
      const pdfHeight = layout.orientation === 'landscape' ? paperWidthIn : paperHeightIn;

      const pdf = new jsPDF({
        orientation: layout.orientation,
        unit: 'in',
        format: [pdfWidth, pdfHeight],
      });

      for (let i = 0; i < pages.length; i++) {
        const page = pages[i];
        if (i > 0) pdf.addPage([pdfWidth, pdfHeight], layout.orientation);

        const originalZoom = page.style.zoom;
        page.style.zoom = '1';

        try {
          const canvas = await html2canvas(page, {
            scale: 2,
            useCORS: true,
            logging: false,
            backgroundColor: '#ffffff',
          });
          const imgData = canvas.toDataURL('image/jpeg', 0.95);
          pdf.addImage(imgData, 'JPEG', 0, 0, pdfWidth, pdfHeight, undefined, 'FAST');
        } finally {
          page.style.zoom = originalZoom;
        }
      }

      const filename = `${title.trim() || 'Untitled document'}.pdf`;
      pdf.save(filename);
      setSavedStatus('Saved on this device');
    } catch (err) {
      setLoadError(err instanceof Error ? err.message : 'Could not generate PDF.');
      setSavedStatus('PDF export failed');
    } finally {
      if (activeImg && editorRef.current.contains(activeImg)) {
        activeImg.classList.add('nexus-active-image');
        updateImageOverlay(activeImg);
      }
    }
  };

  const saveAsCopy = async () => {
    const nextTitle = window.prompt('Save a copy as', `${title.trim() || 'Untitled document'} copy`);
    if (nextTitle === null) return;
    if (!(await saveDocument())) return;
    try {
      const copy = await documentStore.duplicate(documentId, nextTitle);
      onSwitchDocument(copy.id);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : 'Could not save a copy.');
    }
  };

  const exportText = () => {
    const blob = new Blob([readEditorText()], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = window.document.createElement('a');
    link.href = url;
    link.download = `${title.trim() || 'Untitled document'}.txt`;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 0);
  };

  const importDocFile = async (file?: File) => {
    if (!file) return;
    const ext = file.name.split('.').pop()?.toLowerCase();
    if (ext === 'docx') {
      try {
        const arrayBuffer = await file.arrayBuffer();
        const mammoth = await import('mammoth');
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const { value } = await mammoth.convertToHtml({ arrayBuffer, buffer: arrayBuffer } as any);
        const html = value || '<p></p>';
        const imported = await documentStore.create('writer', file.name.replace(/\.docx$/i, '') || 'Imported DOCX');
        await documentStore.save(imported.id, { title: imported.title, content: html, layout: DEFAULT_WRITER_LAYOUT });
        onSwitchDocument(imported.id);
      } catch (error) {
        setLoadError(error instanceof Error ? error.message : 'Could not import this DOCX file.');
      }
    } else if (ext === 'odt') {
      setLoadError('ODT import not supported yet.');
    } else {
      setLoadError('Unsupported file type for import.');
    }
  };
  const importTextFile = async (file?: File) => {
    if (!file) return;
    let importedId: string | undefined;
    try {
      const text = await file.text();
      const escaped = (line: string) => line.replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character] ?? character);
      const html = text.replace(/\r\n?/g, '\n').split('\n').map(line => `<p>${escaped(line) || '<br>'}</p>`).join('');
      const imported = await documentStore.create('writer', file.name.replace(/\.txt$/i, '') || 'Imported text');
      importedId = imported.id;
      await documentStore.save(imported.id, { title: imported.title, content: html, layout: DEFAULT_WRITER_LAYOUT });
      onSwitchDocument(imported.id);
    } catch (error) {
      if (importedId) await documentStore.delete(importedId).catch(() => undefined);
      setLoadError(error instanceof Error ? error.message : 'Could not import this text file.');
    }
  };

  const portraitSize = PAPER_DIMENSIONS_IN[layout.paper].map(inches => Math.round(inches * 96));
  const pageWidth = layout.orientation === 'landscape' ? portraitSize[1] : portraitSize[0];
  const pageHeight = layout.orientation === 'landscape' ? portraitSize[0] : portraitSize[1];
  const pageStyle = {
    zoom: `${zoom}%`, width: `${pageWidth}px`, height: `${pageHeight}px`, minHeight: `${pageHeight}px`, maxWidth: '100%',
    padding: `${layout.margins.top}in ${layout.margins.right}in ${layout.margins.bottom}in ${layout.margins.left}in`,
  };
  const printPageSize = `${layout.paper} ${layout.orientation}`;

  return (
    <div className="writer">
      <style>{`@media print { @page { size: ${printPageSize}; margin: 0; } }`}</style>
      <header className="writer-topbar">
        <button className="writer-back" onClick={() => void returnToLibrary()}>
          <ArrowLeft size={17} /> Back to Documents
        </button>
        <div className="writer-document-name">
          <FileText size={19} />
          <input value={title} onChange={event => { setTitle(event.target.value); markChanged(); }} aria-label="Document title" disabled={!record} />
          <span className="writer-status">{savedStatus}</span>
        </div>
        <div className="writer-actions">
          <button onClick={() => void saveDocument()} title="Save locally" disabled={!record}><Save size={17} /> Save</button>
          <button onClick={() => void saveAsCopy()} title="Save a separate copy" disabled={!record}><Copy size={16} /> Save As</button>
          <button onClick={() => window.print()} title="Print document" disabled={!record}><Printer size={16} /> Print</button>
          <button className="writer-export" onClick={() => void exportDocx()} disabled={!record}><Download size={17} /> Export DOCX</button>
          <button onClick={() => void exportPdf()} title="Export PDF" disabled={!record}><Download size={17} /> Export PDF</button>
        </div>
      </header>
      <nav className="writer-ribbon-tabs" aria-label="Writer ribbon">
        {(['Home', 'Insert', 'Layout', 'References', 'Review', 'View'] as const).map(tab => <button key={tab} className={ribbonTab === tab ? 'active' : ''} onClick={() => setRibbonTab(tab)}>{tab}</button>)}
      </nav>
      <div className="writer-toolbar" aria-label={`${ribbonTab} tools`}>
        {ribbonTab === 'Home' && <>
          <div className="writer-control-group"><label>Style<select aria-label="Paragraph style" defaultValue="normal" onChange={event => applyParagraphStyle(event.target.value)}><option value="normal">Normal</option><option value="title">Title</option><option value="subtitle">Subtitle</option>{Array.from({ length: 9 }, (_, index) => <option key={index} value={`heading${index + 1}`}>Heading {index + 1}</option>)}<option value="quote">Quote</option></select></label></div>
          <div className="writer-control-group"><label>Font<select aria-label="Font family" value={fontFamily} onChange={event => { setFontFamily(event.target.value); format('fontName', event.target.value); }}><option>Arial</option><option>Calibri</option><option>Georgia</option><option>Times New Roman</option><option>Verdana</option></select></label><label>Size<select aria-label="Font size" value={fontSize} onChange={event => { setFontSize(event.target.value); format('fontSize', event.target.value); }}><option value="2">10</option><option value="3">12</option><option value="4">14</option><option value="5">18</option><option value="6">24</option><option value="7">36</option></select></label></div>
          <div className="writer-control-group writer-icon-group"><button onMouseDown={event => event.preventDefault()} onClick={() => format('bold')} title="Bold"><Bold size={17} /></button><button onMouseDown={event => event.preventDefault()} onClick={() => format('italic')} title="Italic"><Italic size={17} /></button><button onMouseDown={event => event.preventDefault()} onClick={() => format('underline')} title="Underline"><Underline size={17} /></button><button onMouseDown={event => event.preventDefault()} onClick={() => format('strikeThrough')} title="Strikethrough"><Strikethrough size={17} /></button><button onMouseDown={event => event.preventDefault()} onClick={() => format('superscript')} title="Superscript">x²</button><button onMouseDown={event => event.preventDefault()} onClick={() => format('subscript')} title="Subscript">x₂</button><button onMouseDown={event => event.preventDefault()} onClick={() => format('removeFormat')} title="Clear formatting"><RemoveFormatting size={17} /></button></div>
          <div className="writer-control-group"><label className="writer-color-control" title="Text color">A<input type="color" aria-label="Text color" onChange={event => format('foreColor', event.target.value)} /></label><label className="writer-color-control" title="Text highlight">▰<input type="color" aria-label="Text highlight color" onChange={event => format('hiliteColor', event.target.value)} /></label></div>
          <div className="writer-control-group writer-icon-group"><button onMouseDown={event => event.preventDefault()} onClick={() => format('justifyLeft')} title="Align left"><AlignLeft size={17} /></button><button onMouseDown={event => event.preventDefault()} onClick={() => format('justifyCenter')} title="Center"><AlignCenter size={17} /></button><button onMouseDown={event => event.preventDefault()} onClick={() => format('justifyRight')} title="Align right"><AlignRight size={17} /></button><button onMouseDown={event => event.preventDefault()} onClick={() => format('justifyFull')} title="Justify"><AlignJustify size={17} /></button><button onMouseDown={event => event.preventDefault()} onClick={() => format('insertUnorderedList')} title="Bulleted list"><List size={17} /></button><button onMouseDown={event => event.preventDefault()} onClick={() => format('insertOrderedList')} title="Numbered list"><ListOrdered size={17} /></button></div>
          <div className="writer-control-group writer-paragraph-controls"><button onMouseDown={event => event.preventDefault()} onClick={() => changeParagraphIndent(-24)} title="Decrease indent">Indent −</button><button onMouseDown={event => event.preventDefault()} onClick={() => changeParagraphIndent(24)} title="Increase indent">Indent +</button><label>Line spacing<select aria-label="Line spacing" defaultValue="1.65" onChange={event => changeParagraphSpacing('lineHeight', event.target.value)}><option value="1">1.0</option><option value="1.15">1.15</option><option value="1.5">1.5</option><option value="1.65">1.65</option><option value="2">2.0</option></select></label><label>After<select aria-label="Paragraph spacing after" defaultValue="12" onChange={event => changeParagraphSpacing('marginBottom', `${event.target.value}px`)}><option value="0">0 pt</option><option value="8">6 pt</option><option value="12">9 pt</option><option value="16">12 pt</option><option value="24">18 pt</option></select></label></div>
        </>}
        {ribbonTab === 'Insert' && <>
          <label className="writer-tool-action writer-file-action"><FileText size={17} /> Import TXT<input type="file" accept="text/plain,.txt" onChange={event => { void importTextFile(event.target.files?.[0]); event.target.value = ''; }} /></label>
          <label className="writer-tool-action writer-file-action"><FileText size={17} /> Import DOCX<input type="file" accept=".docx,.odt" onChange={event => { void importDocFile(event.target.files?.[0]); event.target.value = ''; }} /></label>
          <button className="writer-tool-action" onClick={exportText}>Export TXT</button>
          <button className="writer-tool-action" onMouseDown={event => event.preventDefault()} onClick={insertLink}><Link2 size={17} /> Link</button>
          <label className="writer-tool-action writer-file-action"><ImagePlus size={17} /> Image<input type="file" accept="image/*" onChange={event => { insertImage(event.target.files?.[0]); event.target.value = ''; }} /></label>
          <button className="writer-tool-action" onMouseDown={event => event.preventDefault()} onClick={insertTable}><Table2 size={17} /> Insert table</button>
          <button className="writer-tool-action" onMouseDown={event => event.preventDefault()} onClick={() => insertHtml('<div style="break-before:page;page-break-before:always"></div>')}><FileText size={17} /> Page break</button>
          <button className="writer-tool-action" onMouseDown={event => event.preventDefault()} onClick={() => insertHtml('<hr />')}><Plus size={17} /> Divider</button>
        </>}
        {ribbonTab === 'Layout' && <>
          <label className="writer-layout-control">Paper<select aria-label="Paper size" value={layout.paper} onChange={event => updateLayout({ paper: event.target.value as WriterLayout['paper'] })}>{(['Letter', 'Legal', 'Tabloid', 'A3', 'A4', 'A5'] as const).map(paper => <option key={paper} value={paper}>{paper}</option>)}</select></label>
          <label className="writer-layout-control">Orientation<select aria-label="Page orientation" value={layout.orientation} onChange={event => updateLayout({ orientation: event.target.value as WriterLayout['orientation'] })}><option value="portrait">Portrait</option><option value="landscape">Landscape</option></select></label>
          <label className="writer-layout-control">Top margin (in)<input aria-label="Top margin" type="number" min="0" max="3" step="0.1" value={layout.margins.top} onChange={event => updateLayout({ margins: { ...layout.margins, top: Number(event.target.value) } })} /></label>
          <label className="writer-layout-control">Right margin (in)<input aria-label="Right margin" type="number" min="0" max="3" step="0.1" value={layout.margins.right} onChange={event => updateLayout({ margins: { ...layout.margins, right: Number(event.target.value) } })} /></label>
          <label className="writer-layout-control">Bottom margin (in)<input aria-label="Bottom margin" type="number" min="0" max="3" step="0.1" value={layout.margins.bottom} onChange={event => updateLayout({ margins: { ...layout.margins, bottom: Number(event.target.value) } })} /></label>
          <label className="writer-layout-control">Left margin (in)<input aria-label="Left margin" type="number" min="0" max="3" step="0.1" value={layout.margins.left} onChange={event => updateLayout({ margins: { ...layout.margins, left: Number(event.target.value) } })} /></label>
        </>}
        {ribbonTab === 'References' && <button className="writer-tool-action" onMouseDown={event => event.preventDefault()} onClick={insertStaticContents}>Insert/update Table of Contents</button>}
        {ribbonTab === 'Review' && <>
          <label className="writer-find"><Search size={16} /><input ref={findInputRef} value={findText} onChange={event => setFindText(event.target.value)} placeholder="Find in document" onKeyDown={event => { if (event.key === 'Enter') findNext(); }} /></label>
          <input ref={replaceInputRef} className="writer-replace-input" value={replaceText} onChange={event => setReplaceText(event.target.value)} placeholder="Replace with" />
          <button className="writer-tool-action" onMouseDown={event => event.preventDefault()} onClick={findNext}>Find next</button><button className="writer-tool-action" onMouseDown={event => event.preventDefault()} onClick={replaceCurrent}><Replace size={16} /> Replace</button><button className="writer-tool-action" onMouseDown={event => event.preventDefault()} onClick={replaceAll}>Replace all</button>
        </>}
        {ribbonTab === 'View' && <><label className="writer-zoom">Zoom {zoom}%<input type="range" min="60" max="160" step="10" value={zoom} onChange={event => setZoom(Number(event.target.value))} /></label><button className="writer-tool-action" onClick={() => setBookView(value => !value)}>{bookView ? 'Single page view' : 'Facing pages'}</button><button className="writer-tool-action" onClick={() => setShowPageNav(value => !value)}>{showPageNav ? 'Hide pages' : 'Show pages'}</button><button className="writer-tool-action" onClick={() => setShowOutline(value => !value)}>{showOutline ? 'Hide outline' : 'Show outline'}</button></>}
        {ribbonTab === 'Review' && <button className="writer-tool-action" onClick={() => {
          const editor = editorRef.current;
          if (!editor) return;
          const imagesWithoutAlt = editor.querySelectorAll('img:not([alt]), img[alt=""]').length;
          const headings = Array.from(editor.querySelectorAll('h1,h2,h3,h4,h5,h6')).map(item => Number(item.tagName.slice(1)));
          const skips = headings.some((level, index) => index > 0 && level > headings[index - 1] + 1);
          const issues = [imagesWithoutAlt ? `${imagesWithoutAlt} image(s) need alternative text.` : '', skips ? 'Heading levels skip one or more levels.' : ''].filter(Boolean);
          const message = issues.length ? `Accessibility review: ${issues.join(' ')}` : 'Accessibility review: no missing image descriptions or heading-level skips found.';
          setReviewReport(message);
        }}>Check accessibility</button>}
        {ribbonTab !== 'View' && <div className="writer-history-controls"><button onMouseDown={event => event.preventDefault()} onClick={undoEdit} title="Undo (Ctrl+Z)" disabled={!canUndo}><Undo2 size={17} /></button><button onMouseDown={event => event.preventDefault()} onClick={redoEdit} title="Redo (Ctrl+Y)" disabled={!canRedo}><Redo2 size={17} /></button></div>}
      </div>
      {tableContext && <div className="writer-table-tools writer-table-contextual" aria-label="Table layout tools"><strong>Table Layout</strong><button onMouseDown={event => event.preventDefault()} onClick={() => addTableRow('above')}>Row above</button><button onMouseDown={event => event.preventDefault()} onClick={() => addTableRow('below')}>Row below</button><button onMouseDown={event => event.preventDefault()} onClick={() => addTableColumn('left')}>Column left</button><button onMouseDown={event => event.preventDefault()} onClick={() => addTableColumn('right')}>Column right</button><button onMouseDown={event => event.preventDefault()} onClick={deleteTableRow}>Delete row</button><button onMouseDown={event => event.preventDefault()} onClick={deleteTableColumn}>Delete column</button><button onMouseDown={event => event.preventDefault()} onClick={mergeSelectedCells}>Merge cells</button><button onMouseDown={event => event.preventDefault()} onClick={splitCell}>Split cell</button><button onMouseDown={event => event.preventDefault()} onClick={deleteTable}>Delete table</button><button onMouseDown={event => event.preventDefault()} onClick={toggleHeaderRow}>{tableHasHeader ? 'Remove header row' : 'Set header row'}</button><label>Cell fill<input type="color" aria-label="Selected cell shading" defaultValue="#fff2cc" onChange={event => shadeSelectedCells(event.target.value)} /></label><label>Cell align<select aria-label="Selected cell alignment" defaultValue="center-middle" onChange={event => { const [horizontal, vertical] = event.target.value.split('-') as ['left' | 'center' | 'right', 'top' | 'middle' | 'bottom']; alignSelectedCells(horizontal, vertical); }}><option value="left-top">Top left</option><option value="center-top">Top center</option><option value="right-top">Top right</option><option value="left-middle">Middle left</option><option value="center-middle">Center</option><option value="right-middle">Middle right</option><option value="left-bottom">Bottom left</option><option value="center-bottom">Bottom center</option><option value="right-bottom">Bottom right</option></select></label></div>}
      {hasActiveImage && (
        <div className="writer-table-tools writer-table-contextual writer-image-contextual" aria-label="Image layout tools">
          <strong>Image Tools</strong>
          <span>Size:</span>
          <button onMouseDown={e => e.preventDefault()} onClick={() => setPresetImageWidth(25)}>25%</button>
          <button onMouseDown={e => e.preventDefault()} onClick={() => setPresetImageWidth(50)}>50%</button>
          <button onMouseDown={e => e.preventDefault()} onClick={() => setPresetImageWidth(75)}>75%</button>
          <button onMouseDown={e => e.preventDefault()} onClick={() => setPresetImageWidth(100)}>100%</button>
          <button onMouseDown={e => e.preventDefault()} onClick={() => resizeImage(-10)} title="Shrink by 10%">Smaller (−)</button>
          <button onMouseDown={e => e.preventDefault()} onClick={() => resizeImage(10)} title="Enlarge by 10%">Larger (+)</button>
          <span>Layout:</span>
          <button className={imageLayoutMode === 'inline' ? 'active-layout' : ''} onMouseDown={e => e.preventDefault()} onClick={() => setImageLayout('inline')} title="In line with text">In Line</button>
          <button className={imageLayoutMode === 'center' ? 'active-layout' : ''} onMouseDown={e => e.preventDefault()} onClick={() => setImageLayout('center')} title="Center image">Center</button>
          <button className={imageLayoutMode === 'float-left' ? 'active-layout' : ''} onMouseDown={e => e.preventDefault()} onClick={() => setImageLayout('float-left')} title="Wrap text around right (float left)">Wrap Left</button>
          <button className={imageLayoutMode === 'float-right' ? 'active-layout' : ''} onMouseDown={e => e.preventDefault()} onClick={() => setImageLayout('float-right')} title="Wrap text around left (float right)">Wrap Right</button>
          <span>Position:</span>
          <button onMouseDown={e => e.preventDefault()} onClick={() => moveImagePosition('up')} title="Move image before previous paragraph">Move Up</button>
          <button onMouseDown={e => e.preventDefault()} onClick={() => moveImagePosition('down')} title="Move image after next paragraph">Move Down</button>
          <button onMouseDown={e => e.preventDefault()} onClick={removeActiveImage} className="danger-button" title="Delete image">Delete Image</button>
        </div>
      )}
      {loadError && <div className="writer-error" role="alert">{loadError}</div>}
      {recoveryDraft && <div className="writer-recovery" role="alert"><span><strong>Unsaved draft recovered.</strong> This copy is newer than the last saved version ({new Date(recoveryDraft.updatedAt).toLocaleString()}). Choose a version before continuing.</span><button onClick={restoreRecoveryDraft}>Restore draft</button><button onClick={() => void discardRecoveryDraft()}>Discard draft</button></div>}
      {reviewReport && <div className="writer-review-report" role="status">{reviewReport}</div>}
      <main ref={workspaceRef} className="writer-workspace" onScroll={() => updateImageOverlay()}>
        {showPageNav && <aside className="writer-page-nav" aria-label="Pages">
          <strong>Pages</strong><span>{pageCount} {pageCount === 1 ? 'page' : 'pages'}</span>
          {Array.from({ length: pageCount }, (_, index) => <div className="writer-page-nav-row" key={index}>
            <button className="writer-page-nav-item" onMouseDown={event => event.preventDefault()} onClick={() => jumpToPage(index)} aria-label={`Go to page ${index + 1}`}>
              <span className="writer-page-nav-number">{index + 1}</span><span className="writer-page-nav-preview">{pageSnippets[index] || 'Blank page'}</span>
            </button>
            <button className="writer-page-delete" onMouseDown={event => event.preventDefault()} onClick={() => deletePageContent(index)} title={`Clear page ${index + 1} (Undo restores its contents)`} aria-label={`Clear page ${index + 1}`}><Trash2 size={15} /></button>
          </div>)}
        </aside>}
        {showOutline && <aside className="writer-outline" aria-label="Document outline"><strong>Document outline</strong>{outline.length ? outline.map(item => <button key={item.id} className={`outline-level-${item.level}`} onClick={() => jumpToHeading(item.id)}>{item.text}</button>) : <span>Add heading styles to build an outline.</span>}</aside>}
        {imageOverlayRect && selectedImageElement && (
          <div
            className="writer-image-overlay"
            style={{
              top: `${imageOverlayRect.top}px`,
              left: `${imageOverlayRect.left}px`,
              width: `${imageOverlayRect.width}px`,
              height: `${imageOverlayRect.height}px`,
            }}
          >
            <div className="writer-image-floating-bar">
              <button onMouseDown={e => e.preventDefault()} onClick={() => setPresetImageWidth(25)} className={selectedImageElement.style.width === '25%' ? 'active' : ''}>25%</button>
              <button onMouseDown={e => e.preventDefault()} onClick={() => setPresetImageWidth(50)} className={selectedImageElement.style.width === '50%' ? 'active' : ''}>50%</button>
              <button onMouseDown={e => e.preventDefault()} onClick={() => setPresetImageWidth(75)} className={selectedImageElement.style.width === '75%' ? 'active' : ''}>75%</button>
              <button onMouseDown={e => e.preventDefault()} onClick={() => setPresetImageWidth(100)} className={selectedImageElement.style.width === '100%' ? 'active' : ''}>100%</button>
              <button onMouseDown={e => e.preventDefault()} onClick={() => resizeImage(-10)} title="Smaller">−</button>
              <button onMouseDown={e => e.preventDefault()} onClick={() => resizeImage(10)} title="Larger">+</button>
              <button onMouseDown={e => e.preventDefault()} onClick={() => setImageLayout('inline')} className={imageLayoutMode === 'inline' ? 'active' : ''} title="In line with text">Inline</button>
              <button onMouseDown={e => e.preventDefault()} onClick={() => setImageLayout('center')} className={imageLayoutMode === 'center' ? 'active' : ''} title="Center block">Center</button>
              <button onMouseDown={e => e.preventDefault()} onClick={() => setImageLayout('float-left')} className={imageLayoutMode === 'float-left' ? 'active' : ''} title="Wrap text (float left)">Wrap L</button>
              <button onMouseDown={e => e.preventDefault()} onClick={() => setImageLayout('float-right')} className={imageLayoutMode === 'float-right' ? 'active' : ''} title="Wrap text (float right)">Wrap R</button>
              <button onMouseDown={e => e.preventDefault()} onClick={removeActiveImage} className="danger" title="Delete image">✕</button>
            </div>
            <div className="writer-image-handle handle-nw" onMouseDown={e => handleResizeMouseDown(e, 'nw')} />
            <div className="writer-image-handle handle-ne" onMouseDown={e => handleResizeMouseDown(e, 'ne')} />
            <div className="writer-image-handle handle-se" onMouseDown={e => handleResizeMouseDown(e, 'se')} />
            <div className="writer-image-handle handle-sw" onMouseDown={e => handleResizeMouseDown(e, 'sw')} />
          </div>
        )}
        <div ref={editorRef} className={`writer-pages ${bookView ? 'book-view' : ''}`} contentEditable={false} aria-label="Paginated document"
          onMouseUp={() => { rememberSelection(); updateTableContext(); }} onKeyUp={() => { rememberSelection(); updateTableContext(); }}
          onClick={event => {
            const target = event.target;
            if (target instanceof HTMLImageElement && editorRef.current?.contains(target)) {
              activeImageRef.current = target;
              setSelectedImageElement(target);
              setHasActiveImage(true);
              editorRef.current.querySelectorAll('img.nexus-active-image').forEach(img => img.classList.remove('nexus-active-image'));
              target.classList.add('nexus-active-image');
              target.setAttribute('draggable', 'true');
              const float = target.style.float;
              const display = target.style.display;
              const marginInline = target.style.marginInline;
              if (float === 'left') setImageLayoutMode('float-left');
              else if (float === 'right') setImageLayoutMode('float-right');
              else if (display === 'inline-block' || display === 'inline') setImageLayoutMode('inline');
              else if (marginInline === '0 auto') setImageLayoutMode('left');
              else if (marginInline === 'auto 0') setImageLayoutMode('right');
              else setImageLayoutMode('center');
              updateImageOverlay(target);
            } else if (!(target as HTMLElement)?.closest('.writer-image-overlay') && !(target as HTMLElement)?.closest('.writer-image-contextual') && !(target as HTMLElement)?.closest('.writer-table-tools')) {
              if (activeImageRef.current) {
                activeImageRef.current.classList.remove('nexus-active-image');
                activeImageRef.current = null;
                setSelectedImageElement(null);
                setHasActiveImage(false);
                setImageOverlayRect(null);
              }
            }
          }}
          onKeyDown={event => {
            if (activeImageRef.current && (event.key === 'Backspace' || event.key === 'Delete')) {
              event.preventDefault();
              removeActiveImage();
              return;
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'z') {
              event.preventDefault();
              if (event.shiftKey) redoEdit(); else undoEdit();
              return;
            }
            if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'y') {
              event.preventDefault();
              redoEdit();
              return;
            }
            if (handlePageBoundaryDelete(event)) return;
            // The page shell is layout chrome, never editable document content. If the
            // browser leaves its editing host (for example after repeated Backspace),
            // stop the native command before it can remove a page/editor wrapper.
            if (event.key === 'Backspace' || event.key === 'Delete') {
              const selection = window.getSelection();
              const focusNode = selection?.focusNode;
              const focusElement = focusNode instanceof HTMLElement ? focusNode : focusNode?.parentElement;
              if (!focusElement?.closest('.writer-editor')) {
                event.preventDefault();
                return;
              }
            }
            if (!(event.ctrlKey || event.metaKey)) return;
            const key = event.key.toLowerCase();
            if (key === 's') { event.preventDefault(); if (event.shiftKey) void saveAsCopy(); else void saveDocument(); }
            if (key === 'p') { event.preventDefault(); window.print(); }
            if (key === 'f' || key === 'h') {
              event.preventDefault();
              setRibbonTab('Review');
              window.setTimeout(() => (key === 'f' ? findInputRef.current : replaceInputRef.current)?.focus(), 0);
            }
          }}
          onBeforeInput={event => { if (!recoveryDraft) checkpointHistory((event.nativeEvent as InputEvent).inputType || 'edit'); }}
          onInput={() => { setEditorText(readEditorText()); setPageSnippets(readPageSnippets()); refreshOutline(); markChanged(); schedulePagination(); }}
          onBlur={() => { rememberSelection(); if (savedStatus === 'Unsaved changes') void saveDocument(); }}>
          {Array.from({ length: pageCount }, (_, index) => (
            <div className={`writer-page ${bookView && pageCount % 2 === 1 && index === pageCount - 1 ? 'writer-page-last-print' : ''}`} key={index} style={pageStyle}>
              <div className="writer-editor" data-page-index={index + 1} contentEditable={Boolean(record) && !recoveryDraft} suppressContentEditableWarning spellCheck />
              <span className="writer-page-number" contentEditable={false} aria-hidden="true">{index + 1}</span>
            </div>
          ))}
          {bookView && pageCount % 2 === 1 && <div className="writer-page writer-page-preview" style={pageStyle} contentEditable={false} aria-hidden="true"><span className="writer-page-number">{pageCount + 1}</span></div>}
        </div>
      </main>
      <footer className="writer-footer"><span>{editorText.trim() ? `${editorText.trim().split(/\s+/u).length} words · ${editorText.length} characters` : '0 words · 0 characters'}</span><span>{editorText.split(/\n+/u).filter(line => line.trim()).length} paragraphs</span><span>{pageCount} {pageCount === 1 ? 'page' : 'pages'}</span><span>{savedStatus}</span></footer>
    </div>
  );
}

export default Writer;
