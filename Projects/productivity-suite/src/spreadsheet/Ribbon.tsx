import { useState } from 'react';
import {
  Undo2, Redo2, Copy, Scissors, ClipboardPaste,
  Bold, Italic, Underline as UnderlineIcon, Strikethrough,
  AlignLeft, AlignCenter, AlignRight,
  Type, PaintBucket,
  Plus, Trash2, ArrowUpDown, ArrowDownUp,
  Search, BarChart3, LineChart as LineIcon, PieChart as PieIcon,
  Table as TableIcon, Sigma, Eye, EyeOff, LayoutTemplate,
  DollarSign, Percent
} from 'lucide-react';
import type { NumberFormatType } from './formatters';

export type RibbonTab = 'home' | 'insert' | 'pageLayout' | 'formulas' | 'data' | 'view';

interface RibbonProps {
  activeTab: RibbonTab;
  onSelectTab: (tab: RibbonTab) => void;

  // Actions & state from Spreadsheet
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  onCopy: () => void;
  onCut: () => void;
  onPaste: () => void;

  // Font & style
  cursorStyle?: {
    bold?: boolean;
    italic?: boolean;
    underline?: boolean;
    strikethrough?: boolean;
    align?: 'left' | 'center' | 'right';
    wrapText?: boolean;
    fontSize?: number;
    color?: string;
    bg?: string;
    numberFormat?: string;
    border?: string;
  };
  onToggleStyle: (prop: 'bold' | 'italic' | 'underline' | 'strikethrough' | 'wrapText') => void;
  onSetAlignment: (align: 'left' | 'center' | 'right') => void;
  onSetFontSize: (size: number) => void;
  onSetColor: (color: string) => void;
  onSetBg: (bg: string) => void;
  onSetBorder: (borderType: string) => void;
  onSetNumberFormat: (format: NumberFormatType) => void;
  onAdjustDecimals: (delta: number) => void;

  // Cells
  onInsertRow: (above: boolean) => void;
  onInsertCol: (before: boolean) => void;
  onDeleteRow: () => void;
  onDeleteCol: () => void;
  onClearContents: () => void;
  onClearFormats: () => void;

  // Formulas & Data
  onAutoSum: () => void;
  onInsertFormula: (formula: string) => void;
  onSort: (ascending: boolean) => void;
  onOpenFindReplace: () => void;
  onInsertChart: (type: 'column' | 'line' | 'pie') => void;

  // View & Layout
  showFormulaBar: boolean;
  onToggleFormulaBar: () => void;
  showGridlines: boolean;
  onToggleGridlines: () => void;
  showHeadings: boolean;
  onToggleHeadings: () => void;
  freezeRow: boolean;
  onToggleFreezeRow: () => void;
  freezeCol: boolean;
  onToggleFreezeCol: () => void;
  zoom: number;
  onSetZoom: (zoom: number) => void;
}

export function Ribbon({
  activeTab,
  onSelectTab,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  onCopy,
  onCut,
  onPaste,
  cursorStyle,
  onToggleStyle,
  onSetAlignment,
  onSetFontSize,
  onSetColor,
  onSetBg,
  onSetBorder,
  onSetNumberFormat,
  onAdjustDecimals,
  onInsertRow,
  onInsertCol,
  onDeleteRow,
  onDeleteCol,
  onClearContents,
  onClearFormats,
  onAutoSum,
  onInsertFormula,
  onSort,
  onOpenFindReplace,
  onInsertChart,
  showFormulaBar,
  onToggleFormulaBar,
  showGridlines,
  onToggleGridlines,
  showHeadings,
  onToggleHeadings,
  freezeRow,
  onToggleFreezeRow,
  freezeCol,
  onToggleFreezeCol,
  zoom,
  onSetZoom,
}: RibbonProps) {
  const [borderMenuOpen, setBorderMenuOpen] = useState(false);
  const [clearMenuOpen, setClearMenuOpen] = useState(false);

  return (
    <div className="ss-ribbon-container">
      {/* ─── Ribbon Tabs Header ─── */}
      <div className="ss-ribbon-tabs">
        <button
          className={`ss-ribbon-tab-btn ${activeTab === 'home' ? 'active' : ''}`}
          onClick={() => onSelectTab('home')}
        >
          Home
        </button>
        <button
          className={`ss-ribbon-tab-btn ${activeTab === 'insert' ? 'active' : ''}`}
          onClick={() => onSelectTab('insert')}
        >
          Insert
        </button>
        <button
          className={`ss-ribbon-tab-btn ${activeTab === 'pageLayout' ? 'active' : ''}`}
          onClick={() => onSelectTab('pageLayout')}
        >
          Page Layout
        </button>
        <button
          className={`ss-ribbon-tab-btn ${activeTab === 'formulas' ? 'active' : ''}`}
          onClick={() => onSelectTab('formulas')}
        >
          Formulas
        </button>
        <button
          className={`ss-ribbon-tab-btn ${activeTab === 'data' ? 'active' : ''}`}
          onClick={() => onSelectTab('data')}
        >
          Data
        </button>
        <button
          className={`ss-ribbon-tab-btn ${activeTab === 'view' ? 'active' : ''}`}
          onClick={() => onSelectTab('view')}
        >
          View
        </button>
      </div>

      {/* ─── Ribbon Toolbar Content ─── */}
      <div className="ss-ribbon-content">
        {activeTab === 'home' && (
          <div className="ss-ribbon-groups">
            {/* Clipboard group */}
            <div className="ss-ribbon-group">
              <div className="ss-ribbon-group-items">
                <button
                  className="ss-ribbon-btn"
                  onClick={onUndo}
                  disabled={!canUndo}
                  title="Undo (Ctrl+Z)"
                >
                  <Undo2 size={15} />
                </button>
                <button
                  className="ss-ribbon-btn"
                  onClick={onRedo}
                  disabled={!canRedo}
                  title="Redo (Ctrl+Y)"
                >
                  <Redo2 size={15} />
                </button>
                <div className="ss-ribbon-sep" />
                <button className="ss-ribbon-btn" onClick={onCopy} title="Copy (Ctrl+C)">
                  <Copy size={15} />
                </button>
                <button className="ss-ribbon-btn" onClick={onCut} title="Cut (Ctrl+X)">
                  <Scissors size={15} />
                </button>
                <button className="ss-ribbon-btn" onClick={onPaste} title="Paste (Ctrl+V)">
                  <ClipboardPaste size={15} />
                </button>
              </div>
              <span className="ss-ribbon-group-label">Clipboard</span>
            </div>

            {/* Font group */}
            <div className="ss-ribbon-group">
              <div className="ss-ribbon-group-items">
                <select
                  className="ss-toolbar-select"
                  style={{ width: 60 }}
                  value={cursorStyle?.fontSize ?? 13}
                  onChange={e => onSetFontSize(parseInt(e.target.value, 10))}
                  title="Font Size"
                >
                  {[8, 9, 10, 11, 12, 13, 14, 16, 18, 20, 24, 28, 32].map(s => (
                    <option key={s} value={s}>{s}</option>
                  ))}
                </select>
                <button
                  className={`ss-ribbon-btn ${cursorStyle?.bold ? 'active' : ''}`}
                  onClick={() => onToggleStyle('bold')}
                  title="Bold (Ctrl+B)"
                >
                  <Bold size={15} />
                </button>
                <button
                  className={`ss-ribbon-btn ${cursorStyle?.italic ? 'active' : ''}`}
                  onClick={() => onToggleStyle('italic')}
                  title="Italic (Ctrl+I)"
                >
                  <Italic size={15} />
                </button>
                <button
                  className={`ss-ribbon-btn ${cursorStyle?.underline ? 'active' : ''}`}
                  onClick={() => onToggleStyle('underline')}
                  title="Underline (Ctrl+U)"
                >
                  <UnderlineIcon size={15} />
                </button>
                <button
                  className={`ss-ribbon-btn ${cursorStyle?.strikethrough ? 'active' : ''}`}
                  onClick={() => onToggleStyle('strikethrough')}
                  title="Strikethrough"
                >
                  <Strikethrough size={15} />
                </button>

                {/* Borders Dropdown */}
                <div className="ss-dropdown-wrapper">
                  <button
                    className="ss-ribbon-btn"
                    onClick={() => setBorderMenuOpen(!borderMenuOpen)}
                    title="Borders"
                  >
                    <LayoutTemplate size={15} />
                  </button>
                  {borderMenuOpen && (
                    <div className="ss-dropdown-menu" onClick={() => setBorderMenuOpen(false)}>
                      <button onClick={() => onSetBorder('all')}>All Borders</button>
                      <button onClick={() => onSetBorder('box')}>Thick Box Border</button>
                      <button onClick={() => onSetBorder('bottom')}>Bottom Border</button>
                      <button onClick={() => onSetBorder('top')}>Top Border</button>
                      <button onClick={() => onSetBorder('none')}>No Border</button>
                    </div>
                  )}
                </div>

                {/* Text Color */}
                <button
                  className="ss-ribbon-btn ss-toolbar-color"
                  title="Text Color"
                  onClick={() => {
                    const c = prompt('Text color hex (e.g. #22c55e):', '#ffffff');
                    if (c) onSetColor(c);
                  }}
                >
                  <Type size={15} />
                  <div className="ss-toolbar-color-swatch" style={{ background: cursorStyle?.color || '#e0e0e0' }} />
                </button>

                {/* Fill Color */}
                <button
                  className="ss-ribbon-btn ss-toolbar-color"
                  title="Fill Color"
                  onClick={() => {
                    const c = prompt('Fill color hex (e.g. #1e3a2b):', '#2d8a4e');
                    if (c) onSetBg(c);
                  }}
                >
                  <PaintBucket size={15} />
                  <div className="ss-toolbar-color-swatch" style={{ background: cursorStyle?.bg || 'transparent' }} />
                </button>
              </div>
              <span className="ss-ribbon-group-label">Font</span>
            </div>

            {/* Alignment group */}
            <div className="ss-ribbon-group">
              <div className="ss-ribbon-group-items">
                <button
                  className={`ss-ribbon-btn ${cursorStyle?.align === 'left' || !cursorStyle?.align ? 'active' : ''}`}
                  onClick={() => onSetAlignment('left')}
                  title="Align Left"
                >
                  <AlignLeft size={15} />
                </button>
                <button
                  className={`ss-ribbon-btn ${cursorStyle?.align === 'center' ? 'active' : ''}`}
                  onClick={() => onSetAlignment('center')}
                  title="Align Center"
                >
                  <AlignCenter size={15} />
                </button>
                <button
                  className={`ss-ribbon-btn ${cursorStyle?.align === 'right' ? 'active' : ''}`}
                  onClick={() => onSetAlignment('right')}
                  title="Align Right"
                >
                  <AlignRight size={15} />
                </button>
                <div className="ss-ribbon-sep" />
                <button
                  className={`ss-ribbon-btn text-btn ${cursorStyle?.wrapText ? 'active' : ''}`}
                  onClick={() => onToggleStyle('wrapText')}
                  title="Wrap Text"
                >
                  Wrap
                </button>
              </div>
              <span className="ss-ribbon-group-label">Alignment</span>
            </div>

            {/* Number group */}
            <div className="ss-ribbon-group">
              <div className="ss-ribbon-group-items">
                <select
                  className="ss-toolbar-select"
                  style={{ width: 105 }}
                  value={cursorStyle?.numberFormat ?? 'general'}
                  onChange={e => onSetNumberFormat(e.target.value as NumberFormatType)}
                  title="Number Format"
                >
                  <option value="general">General</option>
                  <option value="number">Number</option>
                  <option value="currency">Currency ($)</option>
                  <option value="accounting">Accounting</option>
                  <option value="percentage">Percentage (%)</option>
                  <option value="shortDate">Short Date</option>
                  <option value="time">Time</option>
                  <option value="scientific">Scientific</option>
                  <option value="text">Text</option>
                </select>
                <button
                  className="ss-ribbon-btn"
                  onClick={() => onSetNumberFormat('currency')}
                  title="Currency ($)"
                >
                  <DollarSign size={14} />
                </button>
                <button
                  className="ss-ribbon-btn"
                  onClick={() => onSetNumberFormat('percentage')}
                  title="Percentage (%)"
                >
                  <Percent size={14} />
                </button>
                <button
                  className="ss-ribbon-btn text-btn"
                  onClick={() => onAdjustDecimals(1)}
                  title="Increase Decimal"
                >
                  .00
                </button>
                <button
                  className="ss-ribbon-btn text-btn"
                  onClick={() => onAdjustDecimals(-1)}
                  title="Decrease Decimal"
                >
                  .0
                </button>
              </div>
              <span className="ss-ribbon-group-label">Number</span>
            </div>

            {/* Cells group */}
            <div className="ss-ribbon-group">
              <div className="ss-ribbon-group-items">
                <button className="ss-ribbon-btn" onClick={() => onInsertRow(true)} title="Insert Row Above">
                  <Plus size={14} /> Row
                </button>
                <button className="ss-ribbon-btn" onClick={() => onInsertCol(true)} title="Insert Column Left">
                  <Plus size={14} /> Col
                </button>
                <button className="ss-ribbon-btn" onClick={onDeleteRow} title="Delete Row">
                  <Trash2 size={14} /> Row
                </button>
                <button className="ss-ribbon-btn" onClick={onDeleteCol} title="Delete Column">
                  <Trash2 size={14} /> Col
                </button>
              </div>
              <span className="ss-ribbon-group-label">Cells</span>
            </div>

            {/* Editing group */}
            <div className="ss-ribbon-group">
              <div className="ss-ribbon-group-items">
                <button className="ss-ribbon-btn" onClick={onAutoSum} title="AutoSum (=SUM)">
                  <Sigma size={15} /> AutoSum
                </button>
                <button className="ss-ribbon-btn" onClick={() => onSort(true)} title="Sort A to Z">
                  <ArrowUpDown size={15} /> A-Z
                </button>
                <button className="ss-ribbon-btn" onClick={() => onSort(false)} title="Sort Z to A">
                  <ArrowDownUp size={15} /> Z-A
                </button>

                {/* Clear dropdown */}
                <div className="ss-dropdown-wrapper">
                  <button
                    className="ss-ribbon-btn"
                    onClick={() => setClearMenuOpen(!clearMenuOpen)}
                    title="Clear"
                  >
                    Clear ▾
                  </button>
                  {clearMenuOpen && (
                    <div className="ss-dropdown-menu" onClick={() => setClearMenuOpen(false)}>
                      <button onClick={onClearContents}>Clear Contents</button>
                      <button onClick={onClearFormats}>Clear Formats</button>
                    </div>
                  )}
                </div>

                <button className="ss-ribbon-btn" onClick={onOpenFindReplace} title="Find & Replace (Ctrl+F)">
                  <Search size={15} /> Find
                </button>
              </div>
              <span className="ss-ribbon-group-label">Editing</span>
            </div>
          </div>
        )}

        {activeTab === 'insert' && (
          <div className="ss-ribbon-groups">
            <div className="ss-ribbon-group">
              <div className="ss-ribbon-group-items">
                <button className="ss-ribbon-btn" onClick={() => onInsertChart('column')} title="Insert Column Chart">
                  <BarChart3 size={16} /> Column Chart
                </button>
                <button className="ss-ribbon-btn" onClick={() => onInsertChart('line')} title="Insert Line Chart">
                  <LineIcon size={16} /> Line Chart
                </button>
                <button className="ss-ribbon-btn" onClick={() => onInsertChart('pie')} title="Insert Pie Chart">
                  <PieIcon size={16} /> Pie Chart
                </button>
              </div>
              <span className="ss-ribbon-group-label">Charts</span>
            </div>

            <div className="ss-ribbon-group">
              <div className="ss-ribbon-group-items">
                <button className="ss-ribbon-btn" onClick={() => onSetBorder('all')} title="Format Selection as Table">
                  <TableIcon size={16} /> Table
                </button>
              </div>
              <span className="ss-ribbon-group-label">Tables</span>
            </div>
          </div>
        )}

        {activeTab === 'pageLayout' && (
          <div className="ss-ribbon-groups">
            <div className="ss-ribbon-group">
              <div className="ss-ribbon-group-items">
                <button
                  className={`ss-ribbon-btn ${showGridlines ? 'active' : ''}`}
                  onClick={onToggleGridlines}
                  title="Toggle Gridlines"
                >
                  Gridlines: {showGridlines ? 'On' : 'Off'}
                </button>
                <button
                  className={`ss-ribbon-btn ${showHeadings ? 'active' : ''}`}
                  onClick={onToggleHeadings}
                  title="Toggle Row/Col Headings"
                >
                  Headings: {showHeadings ? 'On' : 'Off'}
                </button>
              </div>
              <span className="ss-ribbon-group-label">Sheet Options</span>
            </div>
          </div>
        )}

        {activeTab === 'formulas' && (
          <div className="ss-ribbon-groups">
            <div className="ss-ribbon-group">
              <div className="ss-ribbon-group-items">
                <button className="ss-ribbon-btn" onClick={onAutoSum}>
                  <Sigma size={15} /> AutoSum
                </button>
                <button className="ss-ribbon-btn" onClick={() => onInsertFormula('AVERAGE')}>
                  AVERAGE
                </button>
                <button className="ss-ribbon-btn" onClick={() => onInsertFormula('COUNT')}>
                  COUNT
                </button>
                <button className="ss-ribbon-btn" onClick={() => onInsertFormula('VLOOKUP')}>
                  VLOOKUP
                </button>
                <button className="ss-ribbon-btn" onClick={() => onInsertFormula('IF')}>
                  IF
                </button>
                <button className="ss-ribbon-btn" onClick={() => onInsertFormula('MAX')}>
                  MAX
                </button>
                <button className="ss-ribbon-btn" onClick={() => onInsertFormula('MIN')}>
                  MIN
                </button>
              </div>
              <span className="ss-ribbon-group-label">Function Library</span>
            </div>
          </div>
        )}

        {activeTab === 'data' && (
          <div className="ss-ribbon-groups">
            <div className="ss-ribbon-group">
              <div className="ss-ribbon-group-items">
                <button className="ss-ribbon-btn" onClick={() => onSort(true)} title="Sort Ascending">
                  <ArrowUpDown size={15} /> Sort Ascending (A-Z)
                </button>
                <button className="ss-ribbon-btn" onClick={() => onSort(false)} title="Sort Descending">
                  <ArrowDownUp size={15} /> Sort Descending (Z-A)
                </button>
              </div>
              <span className="ss-ribbon-group-label">Sort & Filter</span>
            </div>
          </div>
        )}

        {activeTab === 'view' && (
          <div className="ss-ribbon-groups">
            <div className="ss-ribbon-group">
              <div className="ss-ribbon-group-items">
                <button
                  className={`ss-ribbon-btn ${freezeRow ? 'active' : ''}`}
                  onClick={onToggleFreezeRow}
                  title="Freeze Top Row"
                >
                  Freeze Top Row
                </button>
                <button
                  className={`ss-ribbon-btn ${freezeCol ? 'active' : ''}`}
                  onClick={onToggleFreezeCol}
                  title="Freeze First Column"
                >
                  Freeze 1st Col
                </button>
              </div>
              <span className="ss-ribbon-group-label">Window</span>
            </div>

            <div className="ss-ribbon-group">
              <div className="ss-ribbon-group-items">
                <button
                  className={`ss-ribbon-btn ${showFormulaBar ? 'active' : ''}`}
                  onClick={onToggleFormulaBar}
                  title="Toggle Formula Bar"
                >
                  {showFormulaBar ? <Eye size={15} /> : <EyeOff size={15} />} Formula Bar
                </button>
                <button
                  className={`ss-ribbon-btn ${showGridlines ? 'active' : ''}`}
                  onClick={onToggleGridlines}
                  title="Toggle Gridlines"
                >
                  {showGridlines ? <Eye size={15} /> : <EyeOff size={15} />} Gridlines
                </button>
              </div>
              <span className="ss-ribbon-group-label">Show</span>
            </div>

            <div className="ss-ribbon-group">
              <div className="ss-ribbon-group-items">
                <select
                  className="ss-toolbar-select"
                  value={zoom}
                  onChange={e => onSetZoom(parseFloat(e.target.value))}
                  title="Zoom"
                >
                  <option value={0.75}>75%</option>
                  <option value={1}>100%</option>
                  <option value={1.25}>125%</option>
                  <option value={1.5}>150%</option>
                </select>
              </div>
              <span className="ss-ribbon-group-label">Zoom</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
