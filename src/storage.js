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

// --- FILE EXPORT / IMPORT (.kriti) ---
// A proprietary on-disk format so a notation can be saved out of the
// browser's localStorage entirely — backed up, emailed, moved to another
// device/browser — and dragged back in later to keep editing. It's just
// JSON under the hood, but wrapped in an envelope that identifies and
// versions itself, so an import can tell a real KritiStudio file apart from
// a random/corrupted one instead of silently failing or half-loading it.
export const NOTATION_FILE_FORMAT = 'kritistudio-notation';
export const NOTATION_FILE_VERSION = 1;
export const NOTATION_FILE_EXTENSION = '.kriti';

// Wraps a notation snapshot (as built by the editor) in the export envelope.
// Strips id/createdAt/updatedAt since those are specific to *this* browser's
// storage — importing always mints a fresh id rather than trying to reuse
// the original one, so a file can be imported repeatedly (or on a different
// device that happens to already have an id collision) without clobbering
// anything already saved.
export function toNotationFile(notation) {
  const { id, createdAt, updatedAt, ...portable } = notation;
  return {
    kritistudio: true,
    format: NOTATION_FILE_FORMAT,
    formatVersion: NOTATION_FILE_VERSION,
    exportedAt: Date.now(),
    notation: portable,
  };
}

// Parses + validates previously-exported file contents (already read as
// text) and saves it as a brand-new notation. Throws with a
// user-presentable message for anything that isn't recognizably one of our
// files, so the caller can surface it directly.
export function importNotationFile(rawText) {
  let parsed;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    throw new Error("That file isn't valid — it doesn't look like a KritiStudio notation file.");
  }
  if (!parsed || parsed.format !== NOTATION_FILE_FORMAT || !parsed.notation) {
    throw new Error("That file isn't a KritiStudio notation file (.kriti).");
  }
  if (!Array.isArray(parsed.notation.avartanams)) {
    throw new Error('That notation file looks corrupted — it\'s missing its score data.');
  }
  const now = Date.now();
  return saveNotation({
    ...parsed.notation,
    id: crypto.randomUUID(),
    createdAt: now,
    updatedAt: now,
  });
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
