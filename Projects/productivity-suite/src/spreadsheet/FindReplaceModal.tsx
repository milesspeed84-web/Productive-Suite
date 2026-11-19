import { useState, useRef, useEffect } from 'react';
import { Search, X, Replace } from 'lucide-react';

interface FindReplaceModalProps {
  isOpen: boolean;
  onClose: () => void;
  onFindNext: (query: string, matchCase: boolean) => boolean;
  onReplace: (query: string, replaceWith: string, matchCase: boolean) => boolean;
  onReplaceAll: (query: string, replaceWith: string, matchCase: boolean) => number;
}

export function FindReplaceModal({
  isOpen,
  onClose,
  onFindNext,
  onReplace,
  onReplaceAll,
}: FindReplaceModalProps) {
  const [query, setQuery] = useState('');
  const [replaceWith, setReplaceWith] = useState('');
  const [activeTab, setActiveTab] = useState<'find' | 'replace'>('find');
  const [matchCase, setMatchCase] = useState(false);
  const [statusMessage, setStatusMessage] = useState('');

  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        inputRef.current?.focus();
        setStatusMessage('');
      }, 50);
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleFind = () => {
    if (!query) return;
    const found = onFindNext(query, matchCase);
    setStatusMessage(found ? '' : 'No more occurrences found.');
  };

  const handleReplace = () => {
    if (!query) return;
    const replaced = onReplace(query, replaceWith, matchCase);
    setStatusMessage(replaced ? 'Item replaced.' : 'Match not found.');
  };

  const handleReplaceAll = () => {
    if (!query) return;
    const count = onReplaceAll(query, replaceWith, matchCase);
    setStatusMessage(`Replaced ${count} occurrence${count === 1 ? '' : 's'}.`);
  };

  return (
    <div className="ss-modal-backdrop" onClick={onClose}>
      <div className="ss-modal-dialog" onClick={e => e.stopPropagation()}>
        <div className="ss-modal-header">
          <div className="ss-modal-tabs">
            <button
              className={`ss-modal-tab ${activeTab === 'find' ? 'active' : ''}`}
              onClick={() => setActiveTab('find')}
            >
              <Search size={14} /> Find
            </button>
            <button
              className={`ss-modal-tab ${activeTab === 'replace' ? 'active' : ''}`}
              onClick={() => setActiveTab('replace')}
            >
              <Replace size={14} /> Replace
            </button>
          </div>
          <button className="ss-modal-close" onClick={onClose}><X size={16} /></button>
        </div>

        <div className="ss-modal-body">
          <div className="ss-input-row">
            <label>Find what:</label>
            <input
              ref={inputRef}
              value={query}
              onChange={e => setQuery(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleFind(); }}
              placeholder="Text or formula to find..."
            />
          </div>

          {activeTab === 'replace' && (
            <div className="ss-input-row">
              <label>Replace with:</label>
              <input
                value={replaceWith}
                onChange={e => setReplaceWith(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleReplace(); }}
                placeholder="Replacement text..."
              />
            </div>
          )}

          <div className="ss-options-row">
            <label className="ss-checkbox-label">
              <input
                type="checkbox"
                checked={matchCase}
                onChange={e => setMatchCase(e.target.checked)}
              />
              Match case
            </label>
          </div>

          {statusMessage && <div className="ss-modal-status">{statusMessage}</div>}
        </div>

        <div className="ss-modal-footer">
          {activeTab === 'replace' && (
            <>
              <button className="ss-btn-secondary" onClick={handleReplaceAll}>Replace All</button>
              <button className="ss-btn-secondary" onClick={handleReplace}>Replace</button>
            </>
          )}
          <button className="ss-btn-primary" onClick={handleFind}>Find Next</button>
          <button className="ss-btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
