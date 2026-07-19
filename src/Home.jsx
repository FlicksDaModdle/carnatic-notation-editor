// src/Home.jsx
import { useRef, useState } from 'react';
import { listNotations, deleteNotation, duplicateNotation, importNotationFile, NOTATION_FILE_EXTENSION } from './storage';
import { getAllTalams } from './talamTemplates';
import Logo from './Logo';

function timeAgo(ts) {
  if (!ts) return '';
  const diffMs = Date.now() - ts;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(ts).toLocaleDateString();
}

function countCells(notation) {
  return (notation.avartanams || []).reduce((sum, av) => {
    return sum + (av.beats || []).reduce((s, b) => s + (b.cells || []).filter(c => c.swaram).length, 0);
  }, 0);
}

function Home({ onOpen, onCreateNew, onManageTalams }) {
  const [notations, setNotations] = useState(() => listNotations());
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);
  const [importError, setImportError] = useState(null);
  const importInputRef = useRef(null);
  const allTalams = getAllTalams();

  const refresh = () => setNotations(listNotations());

  const handleCreate = () => {
    onCreateNew();
  };

  // "Import Notation" — the reverse of the editor's File → Export Notation
  // File. Reads a previously-exported .kriti file back in as a brand-new
  // saved notation (fresh id, so it can never collide with or overwrite
  // anything already here), then jumps straight into editing it.
  const handleImportClick = () => importInputRef.current?.click();

  const handleImportFileChosen = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = ''; // allow re-selecting the same file later
    if (!file) return;
    try {
      const text = await file.text();
      const imported = importNotationFile(text);
      refresh();
      onOpen(imported.id);
    } catch (err) {
      setImportError(err.message || 'That file could not be imported.');
    }
  };

  const handleDelete = (id) => {
    deleteNotation(id);
    setConfirmDeleteId(null);
    refresh();
  };

  const handleDuplicate = (id) => {
    duplicateNotation(id);
    refresh();
  };

  return (
    <div className="min-h-screen bg-tambura-900 text-tambura-100 font-sans">
      <header className="h-12 border-b border-tambura-800 bg-tambura-950 flex items-center justify-between px-6 shrink-0">
        <span className="flex items-center gap-2.5">
          <Logo size={26} />
          <span className="text-gold-400 font-serif font-black tracking-wider">KritiStudio Workspace</span>
        </span>
      </header>

      <main className="max-w-5xl mx-auto px-6 py-10 animate-fade-in-up">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl font-serif font-black text-tambura-100">Your Notations</h1>
            <p className="text-tambura-400 text-sm mt-1">Pick up where you left off, or start a new score.</p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={onManageTalams}
              className="bg-tambura-900 hover:bg-tambura-800 border border-tambura-700 active:scale-95 text-tambura-300 font-semibold text-sm px-4 py-2.5 rounded-md shadow-sm transition-all duration-150"
            >
              Manage Talams
            </button>
            <button
              onClick={handleImportClick}
              title={`Import a previously-exported ${NOTATION_FILE_EXTENSION} file`}
              className="bg-tambura-900 hover:bg-tambura-800 border border-tambura-700 active:scale-95 text-tambura-300 font-semibold text-sm px-4 py-2.5 rounded-md shadow-sm transition-all duration-150"
            >
              Import Notation
            </button>
            <input
              ref={importInputRef}
              type="file"
              accept={`${NOTATION_FILE_EXTENSION},application/json`}
              onChange={handleImportFileChosen}
              className="hidden"
            />
            <button
              onClick={handleCreate}
              className="bg-gold-600 hover:bg-gold-500 active:scale-95 text-white font-semibold text-sm px-5 py-2.5 rounded-md shadow transition-all duration-150"
            >
              + New Notation
            </button>
          </div>
        </div>

        {importError && (
          <div className="flex items-start justify-between gap-3 mb-6 px-4 py-3 rounded-md border border-rose-800 bg-rose-950/50 text-rose-300 text-sm animate-fade-in-up">
            <span>{importError}</span>
            <button onClick={() => setImportError(null)} className="text-rose-400 hover:text-white font-bold shrink-0">×</button>
          </div>
        )}

        {notations.length === 0 ? (
          <div className="flex flex-col items-center justify-center border-2 border-dashed border-tambura-800 rounded-lg p-16 text-center animate-fade-in">
            <p className="text-tambura-400 italic text-sm mb-4">You don't have any notations yet.</p>
            <button
              onClick={handleCreate}
              className="bg-gold-600 hover:bg-gold-700 active:scale-95 text-white font-semibold text-xs py-2 px-5 rounded-md shadow transition-all duration-150"
            >
              Create Your First Notation
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {notations.map((n, idx) => {
              const talamName = allTalams[n.selectedTalam]?.name || n.selectedTalam;
              const noteCount = countCells(n);
              return (
                <div
                  key={n.id}
                  onClick={() => onOpen(n.id)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => { if (e.key === 'Enter') onOpen(n.id); }}
                  style={{ animationDelay: `${Math.min(idx, 12) * 40}ms` }}
                  className="group relative text-left bg-tambura-950 border border-tambura-800 hover:border-gold-500 rounded-lg p-4 shadow-sm hover:shadow-lg hover:shadow-gold-950/40 hover:-translate-y-0.5 transition-all duration-200 cursor-pointer flex flex-col gap-2 animate-fade-in-up"
                >
                  <div className="flex items-start justify-between gap-2">
                    <h2 className="font-serif font-bold text-tambura-100 leading-snug line-clamp-2 pr-1">
                      {n.title || 'Untitled Notation'}
                    </h2>
                  </div>

                  {(n.ragam || n.composer) && (
                    <p className="text-xs text-tambura-400 leading-relaxed">
                      {n.ragam && <span>{n.ragam}</span>}
                      {n.ragam && n.composer && <span> &middot; </span>}
                      {n.composer && <span>{n.composer}</span>}
                    </p>
                  )}

                  <div className="flex items-center gap-2 text-[10px] uppercase tracking-wider text-tambura-500 font-bold mt-1">
                    <span className="bg-tambura-900 border border-tambura-800 rounded px-1.5 py-0.5">{talamName} Talam</span>
                    <span className="bg-tambura-900 border border-tambura-800 rounded px-1.5 py-0.5">{noteCount} notes</span>
                  </div>

                  <div className="flex items-center justify-between mt-2 pt-2 border-t border-tambura-800">
                    <span className="text-[11px] text-tambura-500">Edited {timeAgo(n.updatedAt)}</span>

                    <div className="flex items-center gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleDuplicate(n.id)}
                        title="Duplicate"
                        className="text-xs font-mono font-bold w-8 h-8 text-tambura-300 hover:bg-gold-600 hover:text-white active:scale-90 rounded-md flex items-center justify-center transition-all duration-150"
                      >
                        ⧉
                      </button>
                      {confirmDeleteId === n.id ? (
                        <>
                          <button
                            onClick={() => handleDelete(n.id)}
                            className="text-xs font-bold px-3 h-8 text-white bg-rose-600 hover:bg-rose-500 active:scale-90 rounded-md flex items-center justify-center animate-pop-in transition-transform duration-150"
                          >
                            Delete?
                          </button>
                          <button
                            onClick={() => setConfirmDeleteId(null)}
                            className="text-sm font-bold w-8 h-8 text-tambura-300 hover:bg-tambura-800 active:scale-90 rounded-md flex items-center justify-center animate-pop-in transition-transform duration-150"
                          >
                            ×
                          </button>
                        </>
                      ) : (
                        <button
                          onClick={() => setConfirmDeleteId(n.id)}
                          title="Delete"
                          className="text-sm font-bold w-8 h-8 text-rose-400 hover:bg-rose-600 hover:text-white active:scale-90 rounded-md flex items-center justify-center transition-all duration-150"
                        >
                          ×
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </main>
    </div>
  );
}

export default Home;
