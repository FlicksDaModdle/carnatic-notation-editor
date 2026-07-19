// src/NewNotationSetup.jsx
import { useEffect, useRef, useState } from 'react';
import { getAllTalams, getTalamConfig, KALAI_OPTIONS } from './talamTemplates';

const SPEED_LABELS = { 1: '1st Speed', 2: '2nd Speed', 3: '3rd Speed' };

// Shown before a new notation is opened in the editor. Talam, speed, and
// kalai are locked in here and can't be changed later inside the editor
// itself.
function NewNotationSetup({ onConfirm, onCancel }) {
  const [allTalams] = useState(() => getAllTalams());
  const [talam, setTalam] = useState('ADI');
  const [speed, setSpeed] = useState(1);
  const [kalai, setKalai] = useState(1);
  const [talamMenuOpen, setTalamMenuOpen] = useState(false);
  const talamMenuRef = useRef(null);
  // Resolved for the currently-selected kalai so the beat count preview
  // (both in the dropdown trigger and the menu list) stays accurate — 2
  // kalai always shows exactly double the beats of 1 kalai.
  const selectedTalamInfo = getTalamConfig(talam, kalai);

  useEffect(() => {
    if (!talamMenuOpen) return;
    const handleClickOutside = (e) => {
      if (talamMenuRef.current && !talamMenuRef.current.contains(e.target)) {
        setTalamMenuOpen(false);
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') setTalamMenuOpen(false);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [talamMenuOpen]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-tambura-950/70 backdrop-blur-sm animate-fade-in"
      onClick={onCancel}
    >
      <div
        className="bg-tambura-950 border border-tambura-800 rounded-lg shadow-2xl w-full max-w-sm p-6 animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-lg font-serif font-black text-tambura-100 mb-1">New Notation</h2>
        <p className="text-xs text-tambura-400 mb-5">
          Choose the talam and speed to start with — these are set once, up front, and can't be changed later in the editor.
        </p>

        <div className="mb-4">
          <label className="block text-[10px] uppercase font-bold text-tambura-500 mb-1.5">Talam</label>
          <div className="relative" ref={talamMenuRef}>
            <button
              type="button"
              onClick={() => setTalamMenuOpen((v) => !v)}
              className={`w-full flex items-center justify-between gap-2 rounded-md border px-3 py-2.5 text-left transition-all duration-150 ${
                talamMenuOpen
                  ? 'bg-tambura-900 border-gold-500 ring-1 ring-gold-500/40'
                  : 'bg-tambura-900 border-tambura-700 hover:border-tambura-500'
              }`}
            >
              <span className="min-w-0">
                <span className="block text-xs font-semibold text-tambura-100 truncate">
                  {selectedTalamInfo?.name || talam} Talam
                </span>
                <span className="block text-[10px] text-tambura-500 mt-0.5">
                  {selectedTalamInfo?.totalBeats} Beats
                </span>
              </span>
              <svg
                width="14" height="14" viewBox="0 0 20 20" fill="none"
                className={`shrink-0 text-tambura-500 transition-transform duration-150 ${talamMenuOpen ? 'rotate-180' : ''}`}
              >
                <path d="M5 7.5L10 12.5L15 7.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </button>

            {talamMenuOpen && (
              <div className="absolute left-0 right-0 top-full mt-1.5 max-h-56 overflow-y-auto bg-tambura-950 border border-tambura-800 rounded-md shadow-2xl py-1 z-10 animate-menu-in">
                {Object.entries(allTalams).map(([key, t]) => {
                  const resolved = getTalamConfig(key, kalai);
                  return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => { setTalam(key); setTalamMenuOpen(false); }}
                    className={`w-full flex items-center justify-between gap-3 px-3 py-2 text-left transition-colors duration-100 ${
                      talam === key ? 'bg-gold-600 text-white' : 'text-tambura-200 hover:bg-tambura-800'
                    }`}
                  >
                    <span className="min-w-0">
                      <span className="block text-xs font-semibold truncate">{t.name} Talam</span>
                      <span className={`block text-[10px] mt-0.5 ${talam === key ? 'text-gold-100' : 'text-tambura-500'}`}>
                        {resolved.totalBeats} Beats
                      </span>
                    </span>
                    {talam === key && (
                      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" className="shrink-0">
                        <path d="M4 10.5L8 14.5L16 6" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                      </svg>
                    )}
                  </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className="mb-4">
          <label className="block text-[10px] uppercase font-bold text-tambura-500 mb-1.5">Kalai</label>
          <div className="grid grid-cols-2 gap-1 bg-tambura-900 p-1 rounded-md border border-tambura-700">
            {KALAI_OPTIONS.map((k) => (
              <button
                key={k.value}
                onClick={() => setKalai(k.value)}
                className={`py-1.5 text-[11px] font-bold rounded transition-all duration-150 active:scale-95 ${
                  kalai === k.value ? 'bg-gold-600 text-white shadow' : 'text-tambura-400 hover:text-tambura-200'
                }`}
              >
                {k.label}
              </button>
            ))}
          </div>
          <p className="text-[10px] text-tambura-600 italic mt-1">2 kalai doubles the beat count of every anga vs. 1 kalai.</p>
        </div>

        <div className="mb-6">
          <label className="block text-[10px] uppercase font-bold text-tambura-500 mb-1.5">Speed</label>
          <div className="grid grid-cols-3 gap-1 bg-tambura-900 p-1 rounded-md border border-tambura-700">
            {[1, 2, 3].map((s) => (
              <button
                key={s}
                onClick={() => setSpeed(s)}
                className={`py-1.5 text-[11px] font-bold rounded transition-all duration-150 active:scale-95 ${
                  speed === s ? 'bg-gold-600 text-white shadow' : 'text-tambura-400 hover:text-tambura-200'
                }`}
              >
                {SPEED_LABELS[s]}
              </button>
            ))}
          </div>
        </div>

        <div className="flex justify-end gap-2">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-xs font-semibold text-tambura-400 hover:text-tambura-100 active:scale-95 transition-all duration-150 rounded-md"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(talam, speed, kalai)}
            className="px-5 py-2 text-xs font-semibold bg-gold-600 hover:bg-gold-500 active:scale-95 text-white rounded-md shadow transition-all duration-150"
          >
            Create Notation
          </button>
        </div>
      </div>
    </div>
  );
}

export default NewNotationSetup;
