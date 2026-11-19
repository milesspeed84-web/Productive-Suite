
import { useState, useRef, useEffect } from 'react';
import {
  Home, FileText, Table2, Presentation, Mail, CalendarDays,
  Video, StickyNote, FolderOpen, Sparkles, Settings,
  Search, Plus, Bell, ChevronDown,
  ArrowUpRight, MoreHorizontal, Command, Menu,
  Cloud, ShieldCheck, Zap, Download
} from 'lucide-react';
import './App.css';
import Writer from './Writer';
import Spreadsheet from './Spreadsheet';
import { DocumentLanding, RecentDocuments } from './DocumentLanding';
import { documentStore } from './documents/documentStore';

const apps = [
  { name: 'Home', icon: Home },
  { name: 'Documents', icon: FileText },
  { name: 'Spreadsheets', icon: Table2 },
  { name: 'Presentations', icon: Presentation },
  { name: 'Mail', icon: Mail },
  { name: 'Calendar', icon: CalendarDays },
  { name: 'Meetings', icon: Video },
  { name: 'Notes', icon: StickyNote },
  { name: 'Files', icon: FolderOpen },
  { name: 'AI Assistant', icon: Sparkles },
];

function App() {
  const [createMenuOpen, setCreateMenuOpen] = useState(false);
  const createMenuRef = useRef<HTMLDivElement>(null);
  const createButtonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (createMenuOpen && createMenuRef.current && !createMenuRef.current.contains(event.target as Node) && createButtonRef.current && !createButtonRef.current.contains(event.target as Node)) {
        setCreateMenuOpen(false);
      }
    };
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setCreateMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEsc);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEsc);
    };
  }, [createMenuOpen]);

  const [active, setActive] = useState('Home');
  const [hovered, setHovered] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [search, setSearch] = useState('');
  const [writerDocumentId, setWriterDocumentId] = useState<string | null>(null);
  const [spreadsheetDocumentId, setSpreadsheetDocumentId] = useState<string | null>(null);
  const [appNotice, setAppNotice] = useState('');
  const themeFor = (name: string) => {
    switch (name) {
      case 'Documents': return 'documents';
      case 'Spreadsheets': return 'spreadsheets';
      case 'Presentations': return 'presentations';
      case 'Notes': return 'notes';
      default: return 'graphite';
    }
  };


  const createOptions = [
    { name: 'Document', icon: FileText, color: 'purple' },
    { name: 'Spreadsheet', icon: Table2, color: 'green' },
    { name: 'Presentation', icon: Presentation, color: 'orange' },
    { name: 'Note', icon: StickyNote, color: 'blue' },
  ];

  const openDocument = (id: string) => setWriterDocumentId(id);
  const openAnyDocument = (id: string, app?: string) => {
    if (app === 'spreadsheet') {
      setSpreadsheetDocumentId(id);
    } else {
      setWriterDocumentId(id);
    }
  };
  const createWriterDocument = async () => {
    try {
      const record = await documentStore.create('writer');
      setWriterDocumentId(record.id);
      setAppNotice('');
    } catch (error) {
      setAppNotice(error instanceof Error ? error.message : 'Could not create a local document.');
    }
  };
  const createSpreadsheetDocument = async () => {
    try {
      const record = await documentStore.create('spreadsheet');
      setSpreadsheetDocumentId(record.id);
      setAppNotice('');
    } catch (error) {
      setAppNotice(error instanceof Error ? error.message : 'Could not create a local spreadsheet.');
    }
  };
  const navigateToApp = (name: string) => {
    setActive(name);
    setAppNotice('');
  };

  if (writerDocumentId) {
    return <Writer key={writerDocumentId} documentId={writerDocumentId} onBack={() => { setWriterDocumentId(null); setActive('Documents'); }} onSwitchDocument={setWriterDocumentId} />;
  }

  if (spreadsheetDocumentId) {
    return <Spreadsheet key={spreadsheetDocumentId} documentId={spreadsheetDocumentId} onBack={() => { setSpreadsheetDocumentId(null); setActive('Spreadsheets'); }} onSwitchDocument={setSpreadsheetDocumentId} />;
  }

  return (
    <div className="app-shell" data-theme={themeFor(hovered ?? active)}>
      <aside className={`sidebar ${collapsed ? 'collapsed' : ''}`}>
        <div className="brand">
          <div className="brand-mark"><Command size={21} /></div>
          {!collapsed && <div className="brand-name">nexus<span>.</span></div>}
          <button className="collapse-button" onClick={() => setCollapsed(!collapsed)}>
            <Menu size={18} />
          </button>
        </div>

        <div className="workspace-selector">
          <div className="workspace-avatar">P</div>
          {!collapsed && (
            <>
              <div className="workspace-info">
                <strong>Personal workspace</strong>
                <span>Free workspace</span>
              </div>
              <ChevronDown size={16} className="muted-icon" />
            </>
          )}
        </div>

        <div className="nav-label">{!collapsed && 'WORKSPACE'}</div>
        <nav className="navigation">
          {apps.map(({ name, icon: Icon }) => (
            <button
              key={name}
              className={`nav-item ${active === name ? 'active' : ''}`}
              onMouseEnter={() => setHovered(name)}
              onMouseLeave={() => setHovered(null)}
              onClick={() => {
                setActive(name);
                setHovered(null);
              }}
              title={collapsed ? name : undefined}
            >
              <Icon size={19} strokeWidth={1.8} />
              {!collapsed && <span>{name}</span>}
              {!collapsed && name === 'AI Assistant' && <span className="new-tag">NEW</span>}
            </button>
          ))}
        </nav>

        <div className="sidebar-bottom">
          <div className="storage-card">
            <Cloud size={18} />
            {!collapsed && (
              <div>
                <strong>Local workspace</strong>
                <span>Your files stay on your device</span>
              </div>
            )}
          </div>
          <button
            className={`nav-item ${active === 'Settings' ? 'active' : ''}`}
            onClick={() => setActive('Settings')}
          >
            <Settings size={19} />
            {!collapsed && <span>Settings</span>}
          </button>
          <div className="profile">
            <div className="profile-avatar">D</div>
            {!collapsed && (
              <div className="profile-info">
                <strong>My workspace</strong>
                <span>Local account</span>
              </div>
            )}
            {!collapsed && <MoreHorizontal size={19} className="muted-icon" />}
          </div>
        </div>
      </aside>

      <main className="main-area">
        <header className="topbar">
          <div className="breadcrumbs">
            <span>Workspace</span>
            <span className="breadcrumb-divider">/</span>
            <strong>{active}</strong>
          </div>
          <div className="topbar-actions">
            <label className="search-box">
              <Search size={17} />
              <input
                placeholder="Search your workspace..."
                value={search}
                onChange={e => setSearch(e.target.value)}
              />
              <kbd>Ctrl K</kbd>
            </label>
            <button className="icon-button" title="Notifications"><Bell size={19} /></button>
            <div className="top-avatar">D</div>
          </div>
        </header>

        <div className="page-content">
          {!['Documents', 'Spreadsheets', 'Presentations'].includes(active) && <section className="welcome-section">
            <div>
              <div className="eyebrow"><span className="status-dot" /> YOUR WORKSPACE</div>
              <h1>{active === 'Home' ? 'Good to see you.' : active}</h1>
              <p>
                {active === 'Home'
                  ? 'Everything you need to get things done, in one place.'
                  : `Your ${active.toLowerCase()} workspace. More functionality is coming soon.`}
              </p>
            </div>
            <div className="create-new-wrapper">
              <button className="primary-button" ref={createButtonRef} onClick={() => setCreateMenuOpen(!createMenuOpen)}>
                <Plus size={18} /> {active === 'Documents' ? 'Create new document' : active === 'Spreadsheets' ? 'Create new spreadsheet' : active === 'Presentations' ? 'Create new presentation' : 'Create new'}
              </button>
              {createMenuOpen && (
                <div className={`create-menu ${createMenuOpen ? 'open' : ''}`} ref={createMenuRef}>
                  <ul role="menu">
                    <li>
                      <button className="menu-item" onClick={() => { setCreateMenuOpen(false); void createWriterDocument(); }}>
                        <FileText size={16} /> Document
                      </button>
                    </li>
                    <li>
                      <button className="menu-item" onClick={() => { setCreateMenuOpen(false); void createSpreadsheetDocument(); }}>
                        <Table2 size={16} /> Spreadsheet
                      </button>
                    </li>
                    <li>
                      <button className="menu-item disabled" onClick={() => { setCreateMenuOpen(false); setAppNotice('Presentations editing and local file storage are not available yet.'); }}>
                        <Presentation size={16} /> Presentation
                      </button>
                    </li>
                    <li>
                      <button className="menu-item" onClick={() => { setCreateMenuOpen(false); void createWriterDocument(); }}>
                        <StickyNote size={16} /> Note
                      </button>
                    </li>
                    <li>
                      <button className="menu-item disabled" onClick={() => { setCreateMenuOpen(false); setAppNotice('Meeting creation not available yet.'); }}>
                        <Video size={16} /> Meeting
                      </button>
                    </li>
                    <li>
                      <button className="menu-item disabled" onClick={() => { setCreateMenuOpen(false); setAppNotice('PDF creation not available yet.'); }}>
                        <Download size={16} /> PDF
                      </button>
                    </li>
                  </ul>
                </div>
              )}
            </div>
          </section>}

          {active === 'Home' ? (
            <>
              <section className="quick-section">
                <div className="section-heading">
                  <div>
                    <h2>Quick create</h2>
                    <p>Start something new</p>
                  </div>
                </div>
                <div className="quick-grid">
                  {createOptions.map(({ name, icon: Icon, color }) => (
                    <button
                      className="quick-card"
                      key={name}
                      onMouseEnter={() => setHovered(
                        name === 'Document' ? 'Documents' :
                        name === 'Spreadsheet' ? 'Spreadsheets' :
                        name === 'Presentation' ? 'Presentations' : 'Notes'
                      )}
                      onMouseLeave={() => setHovered(null)}
                      onClick={() => {
                        const destination =
                          name === 'Document' ? 'Documents' :
                          name === 'Spreadsheet' ? 'Spreadsheets' :
                          name === 'Presentation' ? 'Presentations' : 'Notes';
                        navigateToApp(destination);
                        setHovered(null);
                      }}
                    >
                      <div className={`quick-icon ${color}`}><Icon size={22} /></div>
                      <div className="quick-card-text">
                        <strong>{name}</strong>
                        <span>Create a new {name.toLowerCase()}</span>
                      </div>
                      <ArrowUpRight size={17} className="quick-arrow" />
                    </button>
                  ))}
                </div>
              </section>

              <section className="recent-section">
                <div className="section-heading">
                  <div>
                    <h2>Recent files</h2>
                    <p>Pick up where you left off</p>
                  </div>
                  <button className="text-button" onClick={() => navigateToApp('Documents')}>View all <ArrowUpRight size={15} /></button>
                </div>
                <RecentDocuments onOpen={openAnyDocument} />
              </section>

              <section className="bottom-grid">
                <div className="welcome-card">
                  <div className="welcome-card-icon"><Video size={22} /></div>
                  <div className="card-kicker">STAY CONNECTED</div>
                  <h3>Your meetings, all together.</h3>
                  <p>Keep your meeting links organized and access supported external meeting services from one place.</p>
                  <button className="secondary-button" onClick={() => setActive('Meetings')}>Open meetings <ArrowUpRight size={15} /></button>
                </div>
                <div className="assistant-card">
                  <div className="assistant-glow"><Sparkles size={24} /></div>
                  <div className="card-kicker">YOUR OPTIONAL AI ASSISTANT</div>
                  <h3>Work smarter, your way.</h3>
                  <p>Explore an assistant that respects your choice of local or remote AI providers.</p>
                  <button className="secondary-button" onClick={() => setActive('AI Assistant')}>Explore assistant <ArrowUpRight size={15} /></button>
                </div>
              </section>
            </>
          ) : active === 'Documents' ? (
              <DocumentLanding app="writer" title="Your documents" description="Documents saved on this device are available here and on the home page." onCreate={() => void createWriterDocument()} onOpen={openDocument} />
            ) : active === 'Spreadsheets' ? (
              <DocumentLanding
                app="spreadsheet"
                title="Your spreadsheets"
                description="Spreadsheets saved on this device are available here and on the home page."
                onCreate={() => void createSpreadsheetDocument()}
                onOpen={(id) => setSpreadsheetDocumentId(id)}
              />
            ) : active === 'Presentations' ? (
              <DocumentLanding
                app="presentation"
                title="Your presentations"
                description="A local file area is ready for future app integration."
                onCreate={() => setAppNotice('Presentations editing and local file storage are not available yet.')}
                onOpen={() => setAppNotice('Presentations editing is not available yet.')}
              />
            ) : <section className="placeholder-panel">
              <div className="placeholder-icon">
                {(() => {
                  const item = apps.find(a => a.name === active);
                  const Icon = item?.icon ?? Settings;
                  return <Icon size={32} />;
                })()}
              </div>
              <h2>{active} is part of Nexus.</h2>
              <p>This area is reserved for our {active.toLowerCase()} experience. We'll build it in stages using mature, open technologies wherever possible.</p>
              <div className="placeholder-note"><ShieldCheck size={17} /> Your workspace is local-first by design.</div>
            </section>}
          {appNotice && <div className="library-error" role="status">{appNotice}</div>}

          <footer className="footer">
            <span>© 2026 Nexus · Prototype</span>
            <span><ShieldCheck size={14} /> Local-first concept</span>
            <span><Zap size={14} /> Built for Linux, prototyped on Windows</span>
          </footer>
        </div>
      </main>
    </div>
  );
}

export default App;


