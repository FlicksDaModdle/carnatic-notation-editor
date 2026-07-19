// src/storage.js
// Lightweight localStorage-backed persistence for notations so the app can
// keep a list of "in progress" scores on a home page and let the user jump
// back into any of them.

const STORAGE_KEY = 'kritistudio:notations';
const TALAMS_STORAGE_KEY = 'kritistudio:customTalams';

export const DEFAULT_LAYOUT = {
  fontSize: 13,
  cellGap: 4,
  rowGap: 24,
};

function readAll() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to read notations from storage', err);
    return [];
  }
}

function writeAll(notations) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notations));
  } catch (err) {
    console.error('Failed to save notations to storage', err);
  }
}

// Returns notations sorted most-recently-updated first.
export function listNotations() {
  return readAll().sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

export function getNotation(id) {
  return readAll().find((n) => n.id === id) || null;
}

// Upserts a notation (matched by id) and stamps updatedAt.
export function saveNotation(notation) {
  const all = readAll();
  const idx = all.findIndex((n) => n.id === notation.id);
  const toSave = { ...notation, updatedAt: Date.now() };
  if (idx === -1) {
    all.push(toSave);
  } else {
    all[idx] = toSave;
  }
  writeAll(all);
  return toSave;
}

export function deleteNotation(id) {
  writeAll(readAll().filter((n) => n.id !== id));
}

export function duplicateNotation(id) {
  const original = getNotation(id);
  if (!original) return null;
  const copy = {
    ...original,
    id: crypto.randomUUID(),
    title: `${original.title || 'Untitled Notation'} (Copy)`,
    createdAt: Date.now(),
    updatedAt: Date.now(),
  };
  const all = readAll();
  all.push(copy);
  writeAll(all);
  return copy;
}

// --- CUSTOM TALAMS ---
// Separate storage bucket from notations, keyed by a generated "custom-…"
// id so it can never collide with the built-in ADI/RUPAKA keys.
function readAllTalams() {
  try {
    const raw = localStorage.getItem(TALAMS_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (err) {
    console.error('Failed to read custom talams from storage', err);
    return [];
  }
}

function writeAllTalams(talams) {
  try {
    localStorage.setItem(TALAMS_STORAGE_KEY, JSON.stringify(talams));
  } catch (err) {
    console.error('Failed to save custom talams to storage', err);
  }
}

// Returns custom talams sorted most-recently-updated first. Talams saved
// before kalai support existed have no `kalai` field at all — that's also
// exactly the set that got stuck with the old (buggy) nadai default of 4
// subdivisions/beat instead of 1, since the nadai picker's default wasn't
// visibly chosen by the user. Detect that signature and quietly correct it
// on read, once, persisting the fix so it doesn't need to keep migrating.
export function getCustomTalams() {
  const all = readAllTalams();
  let changed = false;
  const migrated = all.map((t) => {
    if (t.kalai) return t;
    changed = true;
    return { ...t, baseSubdivisions: 1, kalai: 1 };
  });
  if (changed) writeAllTalams(migrated);
  return migrated.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
}

// Upserts a custom talam (matched by id) and stamps updatedAt.
export function saveCustomTalam(talam) {
  const all = readAllTalams();
  const idx = all.findIndex((t) => t.id === talam.id);
  const toSave = { ...talam, id: talam.id || `custom-${crypto.randomUUID()}`, updatedAt: Date.now() };
  if (idx === -1) {
    all.push(toSave);
  } else {
    all[idx] = toSave;
  }
  writeAllTalams(all);
  return toSave;
}

export function deleteCustomTalam(id) {
  writeAllTalams(readAllTalams().filter((t) => t.id !== id));
}

// Blank starter notation shown to a first-time user / on "+ New Notation".
// Accepts an optional id so a not-yet-saved editor session can be re-created
// with the same identity it was opened with, and optional overrides for the
// talam/speed chosen in the pre-editor setup step.
export function createBlankNotation(id, overrides = {}) {
  const now = Date.now();
  return {
    id: id || crypto.randomUUID(),
    title: overrides.title || 'Untitled Notation',
    ragam: overrides.ragam || '',
    composer: overrides.composer || '',
    selectedTalam: overrides.selectedTalam || 'ADI',
    speed: overrides.speed || 1,
    kalai: overrides.kalai || 1,
    paperSize: overrides.paperSize || 'A4',
    avartanams: [],
    ...DEFAULT_LAYOUT,
    createdAt: now,
    updatedAt: now,
  };
}
