// src/TalamEditor.jsx
import { useState } from 'react';
import {
  TALAM_TEMPLATES,
  ANGA_TYPES,
  JATI_OPTIONS,
  NADAI_OPTIONS,
  angaBeats,
  buildTalamFromAngas,
} from './talamTemplates';
import { getCustomTalams, saveCustomTalam, deleteCustomTalam } from './storage';
import { HomeIcon } from './icons';
import Logo from './Logo';

// Small inline bar showing the anga sequence as blocks with beat counts —
// used both while building a talam and when listing saved ones.
function AngaPreview({ angas }) {
  if (!angas || angas.length === 0) {
    return <p className="text-[11px] text-tambura-500 italic">Add an anga to get started.</p>;
  }
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {angas.map((a, i) => (
        <div
          key={i}
          className="flex flex-col items-center justify-center bg-tambura-900 border border-tambura-700 rounded px-2 py-1 min-w-[44px]"
        >
          <span className="text-[10px] font-bold text-gold-400">{ANGA_TYPES[a.type].symbol}</span>
          <span className="text-[9px] text-tambura-400">{a.type === 'LAGHU' ? `Laghu ${a.jati}` : ANGA_TYPES[a.type].label}</span>
          <span className="text-[9px] text-tambura-600">{angaBeats(a)}b</span>
        </div>
      ))}
    </div>
  );
}

function TalamBuilder({ initial, onSave, onCancel }) {
  const [name, setName] = useState(initial?.name || '');
  const [nadai, setNadai] = useState(initial?.baseSubdivisions || 1);
  const [angas, setAngas] = useState(initial?.angas || [{ type: 'LAGHU', jati: 4 }]);

  const totalBeats = angas.reduce((sum, a) => sum + angaBeats(a), 0);

  const addAnga = (type) => {
    setAngas([...angas, type === 'LAGHU' ? { type, jati: 4 } : { type }]);
  };

  const removeAnga = (idx) => {
    setAngas(angas.filter((_, i) => i !== idx));
  };

  const updateJati = (idx, jati) => {
    setAngas(angas.map((a, i) => (i === idx ? { ...a, jati } : a)));
  };

  const canSave = name.trim().length > 0 && angas.length > 0;

  const handleSave = () => {
    if (!canSave) return;
    const built = buildTalamFromAngas(angas, nadai, name.trim());
    onSave({ ...built, id: initial?.id, isCustom: true, createdAt: initial?.createdAt || Date.now() });
  };

  return (
    <div className="bg-tambura-950 border border-tambura-800 rounded-lg p-5 animate-pop-in">
      <div className="mb-4">
        <label className="block text-[10px] uppercase font-bold text-tambura-500 mb-1.5">Talam Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g. Khanda Chapu"
          className="w-full bg-tambura-900 border border-tambura-700 rounded p-2 text-sm text-tambura-200 outline-none focus:border-gold-500"
        />
      </div>

      <div className="mb-4">
        <label className="block text-[10px] uppercase font-bold text-tambura-500 mb-1.5">
          Anga Sequence <span className="text-tambura-600 normal-case">({totalBeats} beats total at 1 kalai)</span>
        </label>
        <div className="bg-tambura-900/60 border border-tambura-800 rounded p-3 mb-2">
          <AngaPreview angas={angas} />
        </div>

        <div className="flex flex-col gap-1.5">
          {angas.map((a, idx) => (
            <div key={idx} className="flex items-center gap-2 bg-tambura-900 border border-tambura-800 rounded px-2 py-1.5">
              <span className="text-xs font-semibold text-tambura-300 w-24 shrink-0">{ANGA_TYPES[a.type].label}</span>
              {a.type === 'LAGHU' ? (
                <select
                  value={a.jati}
                  onChange={(e) => updateJati(idx, Number(e.target.value))}
                  className="flex-1 bg-tambura-950 border border-tambura-700 rounded text-xs text-tambura-200 p-1 outline-none focus:border-gold-500"
                >
                  {JATI_OPTIONS.map((j) => (
                    <option key={j.value} value={j.value}>{j.label}</option>
                  ))}
                </select>
              ) : (
                <span className="flex-1 text-[11px] text-tambura-500">{ANGA_TYPES[a.type].fixedBeats} beats (fixed)</span>
              )}
              <button
                onClick={() => removeAnga(idx)}
                className="text-[10px] font-bold w-5 h-5 text-rose-400 hover:bg-rose-600 hover:text-white rounded flex items-center justify-center shrink-0"
              >
                ×
              </button>
            </div>
          ))}
        </div>

        <div className="flex gap-1.5 mt-2">
          <button onClick={() => addAnga('LAGHU')} className="flex-1 text-[11px] font-semibold bg-tambura-900 hover:bg-gold-950 border border-tambura-700 hover:border-gold-600 text-tambura-300 rounded py-1.5 transition-colors">+ Laghu</button>
          <button onClick={() => addAnga('DHRUTAM')} className="flex-1 text-[11px] font-semibold bg-tambura-900 hover:bg-gold-950 border border-tambura-700 hover:border-gold-600 text-tambura-300 rounded py-1.5 transition-colors">+ Dhrutam</button>
          <button onClick={() => addAnga('ANUDHRUTAM')} className="flex-1 text-[11px] font-semibold bg-tambura-900 hover:bg-gold-950 border border-tambura-700 hover:border-gold-600 text-tambura-300 rounded py-1.5 transition-colors">+ Anudhrutam</button>
        </div>
      </div>

      <div className="mb-5">
        <label className="block text-[10px] uppercase font-bold text-tambura-500 mb-1.5">Nadai (subdivisions per beat)</label>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 bg-tambura-900 p-1 rounded-md border border-tambura-700">
          {NADAI_OPTIONS.map((n) => (
            <button
              key={n.value}
              onClick={() => setNadai(n.value)}
              className={`py-1.5 text-[11px] font-bold rounded transition-all duration-150 active:scale-95 ${
                nadai === n.value ? 'bg-gold-600 text-white shadow' : 'text-tambura-400 hover:text-tambura-200'
              }`}
            >
              {n.value}
            </button>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onCancel} className="px-4 py-2 text-xs font-semibold text-tambura-400 hover:text-tambura-100 active:scale-95 transition-all duration-150 rounded-md">
          Cancel
        </button>
        <button
          onClick={handleSave}
          disabled={!canSave}
          className="px-5 py-2 text-xs font-semibold bg-gold-600 hover:bg-gold-500 disabled:opacity-30 disabled:hover:bg-gold-600 active:scale-95 text-white rounded-md shadow transition-all duration-150"
        >
          Save Talam
        </button>
      </div>
    </div>
  );
}

function TalamEditor({ onBack }) {
  const [customTalams, setCustomTalams] = useState(() => getCustomTalams());
  const [editing, setEditing] = useState(null); // null | {} (new) | talam object (edit)
  const [confirmDeleteId, setConfirmDeleteId] = useState(null);

  const refresh = () => setCustomTalams(getCustomTalams());

  const handleSave = (talam) => {
    saveCustomTalam(talam);
    setEditing(null);
    refresh();
  };

  const handleDelete = (id) => {
    deleteCustomTalam(id);
    setConfirmDeleteId(null);
    refresh();
  };

  return (
    <div className="min-h-screen bg-tambura-900 text-tambura-100 font-sans">
      <header className="h-12 border-b border-tambura-800 bg-tambura-950 flex items-center justify-between px-6 shrink-0">
        <div className="flex items-center gap-4">
          <button
            onClick={onBack}
            title="Return to your notation list"
            className="flex items-center gap-1.5 text-tambura-200 hover:text-gold-300 bg-tambura-900 hover:bg-tambura-800 border border-tambura-700 hover:border-gold-600 active:scale-95 text-xs font-semibold pl-2 pr-3 py-1.5 rounded-md transition-all duration-150"
          >
            <HomeIcon className="w-3.5 h-3.5" />
            Home
          </button>
          <span className="flex items-center gap-2.5">
            <Logo size={24} />
            <span className="text-gold-400 font-serif font-black tracking-wider">Manage Talams</span>
          </span>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-6 py-10 animate-fade-in-up">
        <div className="flex items-center justify-between mb-6">
          <div>
            <h1 className="text-2xl font-serif font-black text-tambura-100">Talams</h1>
            <p className="text-tambura-400 text-sm mt-1">Build custom talams from laghu/dhrutam/anudhrutam angas for use in new notations. Angas are defined at 1 kalai — 1 or 2 kalai is chosen per notation when you start a new one, and 2 kalai always doubles every anga's beat count.</p>
          </div>
          {!editing && (
            <button
              onClick={() => setEditing({})}
              className="bg-gold-600 hover:bg-gold-500 active:scale-95 text-white font-semibold text-sm px-5 py-2.5 rounded-md shadow transition-all duration-150 shrink-0"
            >
              + New Talam
            </button>
          )}
        </div>

        {editing && (
          <div className="mb-8">
            <TalamBuilder
              initial={editing.id ? editing : null}
              onSave={handleSave}
              onCancel={() => setEditing(null)}
            />
          </div>
        )}

        <div className="mb-8">
          <h2 className="text-xs font-bold uppercase tracking-wider text-tambura-500 mb-3">Built-in</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Object.entries(TALAM_TEMPLATES).map(([key, t]) => (
              <div key={key} className="bg-tambura-950 border border-tambura-800 rounded-lg p-4">
                <h3 className="font-serif font-bold text-tambura-100 mb-1">{t.name} Talam</h3>
                <p className="text-[11px] text-tambura-500">{t.totalBeats} beats</p>
              </div>
            ))}
          </div>
        </div>

        <div>
          <h2 className="text-xs font-bold uppercase tracking-wider text-tambura-500 mb-3">Custom</h2>
          {customTalams.length === 0 ? (
            <div className="flex flex-col items-center justify-center border-2 border-dashed border-tambura-800 rounded-lg p-10 text-center">
              <p className="text-tambura-400 italic text-sm">No custom talams yet — create one above.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {customTalams.map((t) => (
                <div key={t.id} className="bg-tambura-950 border border-tambura-800 rounded-lg p-4 flex items-center justify-between gap-4">
                  <div className="min-w-0">
                    <h3 className="font-serif font-bold text-tambura-100 mb-1 truncate">{t.name}</h3>
                    <p className="text-[11px] text-tambura-500 mb-2">{t.totalBeats} beats · Nadai {t.baseSubdivisions}</p>
                    <AngaPreview angas={t.angas} />
                  </div>
                  <div className="flex items-center gap-1.5 shrink-0">
                    <button
                      onClick={() => setEditing(t)}
                      className="text-[11px] font-semibold px-3 py-1.5 text-tambura-300 hover:bg-gold-600 hover:text-white active:scale-95 rounded transition-all duration-150"
                    >
                      Edit
                    </button>
                    {confirmDeleteId === t.id ? (
                      <>
                        <button
                          onClick={() => handleDelete(t.id)}
                          className="text-[11px] font-bold px-2 py-1.5 text-white bg-rose-600 hover:bg-rose-500 active:scale-95 rounded animate-pop-in"
                        >
                          Delete?
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="text-[11px] font-bold w-7 h-7 text-tambura-300 hover:bg-tambura-800 active:scale-95 rounded animate-pop-in"
                        >
                          ×
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(t.id)}
                        className="text-[11px] font-bold px-3 py-1.5 text-rose-400 hover:bg-rose-600 hover:text-white active:scale-95 rounded transition-all duration-150"
                      >
                        Delete
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}

export default TalamEditor;
