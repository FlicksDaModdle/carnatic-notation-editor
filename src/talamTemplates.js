// src/talamTemplates.js
import { getCustomTalams } from './storage';

export const createBlankBeat = (beatNumber, subdivisions) => {
  return {
    beatNumber,
    cells: Array.from({ length: subdivisions }, () => ({
      swaram: "",
      octave: "normal",
      gamakam: {
        hasGamakam: false,
        subSwaras: ""
      }
    }))
  };
};

// --- ANGA BUILDING BLOCKS (for the custom Talam Editor, and for the
// built-in talams below — everything is defined as an anga sequence so a
// single definition can be resolved for either 1 kalai or 2 kalai). A
// talam's avartanam is built from a sequence of angas. We support the
// three most common ones. Laghu's beat count depends on its jati (the
// "counting" style); dhrutam and anudhrutam are fixed (at 1 kalai).
export const JATI_OPTIONS = [
  { value: 3, label: 'Tisra (3)' },
  { value: 4, label: 'Chaturasra (4)' },
  { value: 5, label: 'Khanda (5)' },
  { value: 7, label: 'Mishra (7)' },
  { value: 9, label: 'Sankeerna (9)' },
];

// Nadai (gati) controls how many swarams/subdivisions sit inside a single
// beat at 1st speed, before the speed multiplier is applied. The default of
// 1 means "one swaram per beat at 1st speed" (the normal case for Adi,
// Rupaka, etc.) — pick an explicit nadai only when a passage is deliberately
// subdivided that way (e.g. tisra/khanda gati sangatis).
export const NADAI_OPTIONS = [
  { value: 1, label: 'Default (1)' },
  { value: 2, label: 'Gati 2' },
  { value: 3, label: 'Tisra (3)' },
  { value: 4, label: 'Chaturasra (4)' },
  { value: 5, label: 'Khanda (5)' },
  { value: 7, label: 'Mishra (7)' },
  { value: 9, label: 'Sankeerna (9)' },
];

// Kalai (1 or 2) is a talam-wide "beat count" multiplier, chosen per
// notation just like speed is — it doubles every anga's beat count
// uniformly, so a talam's 1-kalai form always has exactly half the beats of
// its 2-kalai form.
export const KALAI_OPTIONS = [
  { value: 1, label: '1 Kalai' },
  { value: 2, label: '2 Kalai' },
];

export const ANGA_TYPES = {
  LAGHU: { key: 'LAGHU', label: 'Laghu', symbol: 'I', fixedBeats: null },
  DHRUTAM: { key: 'DHRUTAM', label: 'Dhrutam', symbol: 'O', fixedBeats: 2 },
  ANUDHRUTAM: { key: 'ANUDHRUTAM', label: 'Anudhrutam', symbol: 'U', fixedBeats: 1 },
};

// An anga component looks like { type: 'LAGHU', jati: 4 } (jati only matters
// for laghu) and resolves to a beat count via this helper. `kalai` (1 or 2)
// uniformly scales every anga's beat count — that's what keeps 1 kalai at
// exactly half the beats of 2 kalai for any talam.
export const angaBeats = (component, kalai = 1) => {
  const base = component.type === 'LAGHU'
    ? (component.jati || 4)
    : (ANGA_TYPES[component.type]?.fixedBeats || 1);
  return base * (kalai || 1);
};

// Turns a sequence of anga components into the flat totalBeats/angaDividers
// shape the rest of the app already expects, plus a halfAvartanamBeats pick
// (the anga boundary closest to the halfway point of the avartanam — used
// to break longer talams across two lines at higher speeds).
export const buildTalamFromAngas = (angas, nadai, name, kalai = 1) => {
  let running = 0;
  const angaDividers = angas.map((a) => {
    running += angaBeats(a, kalai);
    return running;
  });
  const totalBeats = running;

  const half = totalBeats / 2;
  const halfAvartanamBeats = angaDividers.reduce((best, d) =>
    Math.abs(d - half) < Math.abs(best - half) ? d : best
  , angaDividers[0] ?? totalBeats);

  return {
    name: name || 'Custom Talam',
    totalBeats,
    angaDividers,
    halfAvartanamBeats,
    baseSubdivisions: nadai || 1,
    kalai: kalai || 1,
    angas,
  };
};

// --- BUILT-IN TALAMS ---
// Defined in "1 kalai" terms as an anga sequence, same shape as a
// user-created custom talam. baseSubdivisions (nadai) defaults to 1, so at
// 1st speed every beat gets exactly 1 swaram — e.g. Adi's laghu (4 beats)
// gets 4 swarams total, and its two dhrutams (2 beats each) get 4 swarams
// combined. Speed then multiplies subdivisions-per-beat by 1x/2x/4x (see
// Editor.jsx), and kalai (chosen per notation, like speed) doubles the
// underlying beat counts -- resolved on demand via getTalamConfig(key, kalai).
const ADI_ANGAS = [{ type: 'LAGHU', jati: 4 }, { type: 'DHRUTAM' }, { type: 'DHRUTAM' }];
const RUPAKA_ANGAS = [{ type: 'LAGHU', jati: 1 }, { type: 'DHRUTAM' }];

export const TALAM_TEMPLATES = {
  ADI: buildTalamFromAngas(ADI_ANGAS, 1, 'Adi'),
  RUPAKA: buildTalamFromAngas(RUPAKA_ANGAS, 1, 'Rupaka'),
};

// --- LOOKUP (built-ins + user-created custom talams) ---
// Custom talams are stored with their own generated id (e.g. "custom-abc123")
// so they can't collide with the built-in ADI/RUPAKA keys. These lookups
// always return the 1-kalai form -- use getTalamConfig(key, kalai) to resolve
// a specific kalai for an actual notation.
export const getAllTalams = () => {
  const custom = getCustomTalams();
  const merged = { ...TALAM_TEMPLATES };
  custom.forEach((t) => { merged[t.id] = t; });
  return merged;
};

const findTalamDefinition = (key) => {
  if (TALAM_TEMPLATES[key]) return TALAM_TEMPLATES[key];
  const custom = getCustomTalams().find((t) => t.id === key);
  return custom || TALAM_TEMPLATES.ADI;
};

// Resolves a talam definition for a specific kalai (1 or 2). If the
// definition doesn't carry an anga sequence (shouldn't happen for anything
// created after kalai support was added, but kept as a safe fallback for
// older/malformed data), it's returned as-is rather than failing.
export const resolveTalamForKalai = (talamConfig, kalai = 1) => {
  const targetKalai = kalai || 1;
  if (!talamConfig?.angas) return { ...talamConfig, kalai: talamConfig?.kalai || 1 };
  if (targetKalai === (talamConfig.kalai || 1)) return talamConfig;
  return buildTalamFromAngas(talamConfig.angas, talamConfig.baseSubdivisions, talamConfig.name, targetKalai);
};

export const getTalamConfig = (key, kalai = 1) => {
  return resolveTalamForKalai(findTalamDefinition(key), kalai);
};

// --- GENERIC LINE-WRAPPING ---
// Splits an avartanam's beats into visual lines/rows for display. A second
// (or third) line is only introduced when the full avartanam actually has
// too many note-cells to sit comfortably on one line — not automatically
// just because the speed is 2 or 3. That's why `subdivisionsPerBeat` (the
// actual notes-per-beat at the current speed) is passed in alongside
// talamConfig: a slow talam at a high speed and a fast talam at a low speed
// can land on the same cell count, and should wrap the same way.
const MAX_CELLS_PER_LINE = 32;

export const computeLineGroups = (talamConfig, speed, subdivisionsPerBeat = 1) => {
  const totalBeats = talamConfig.totalBeats;
  const totalCells = totalBeats * (subdivisionsPerBeat || 1);

  if (speed === 1 || totalCells <= MAX_CELLS_PER_LINE) {
    return [{ start: 1, end: totalBeats, label: '||' }];
  }

  const halfSize = Math.max(1, talamConfig.halfAvartanamBeats || Math.ceil(totalBeats / 2));
  const halves = [];
  let s = 1;
  while (s <= totalBeats) {
    const e = Math.min(s + halfSize - 1, totalBeats);
    halves.push({ start: s, end: e });
    s = e + 1;
  }

  const halfCells = halfSize * (subdivisionsPerBeat || 1);
  if (halfCells <= MAX_CELLS_PER_LINE) {
    return halves.map((h) => ({ ...h, label: '||' }));
  }

  // Still too many cells per half — split each half into quarters (first
  // gets the larger share when the half is an odd length).
  const groups = [];
  halves.forEach((h) => {
    const len = h.end - h.start + 1;
    const q1 = Math.ceil(len / 2);
    const firstEnd = h.start + q1 - 1;
    if (firstEnd < h.end) {
      groups.push({ start: h.start, end: firstEnd, label: '|' });
      groups.push({ start: firstEnd + 1, end: h.end, label: '||' });
    } else {
      // half was only 1 beat long — nothing to split further
      groups.push({ start: h.start, end: h.end, label: '||' });
    }
  });
  return groups;
};

// --- LYRIC MIGRATION ---
// Older saved notations stored lyrics in fixed part1Lyrics..part4Lyrics
// fields sized for the old ADI-only line split. New rows use a dynamic
// `lyricLines` array (one entry per visual line group). This concatenates
// whatever old part arrays exist and re-slices them to fit the current
// line groups, which reproduces the old layout exactly for Adi (the two
// happen to divide identically) and degrades gracefully for anything else.
export const migrateRowLyrics = (row, groups, subdivisions) => {
  if (row.lyricLines) return row.lyricLines;
  const flat = [row.part1Lyrics, row.part2Lyrics, row.part3Lyrics, row.part4Lyrics]
    .filter(Boolean)
    .flat();
  let cursor = 0;
  return groups.map((g) => {
    const len = (g.end - g.start + 1) * subdivisions;
    const slice = flat.slice(cursor, cursor + len);
    cursor += len;
    while (slice.length < len) slice.push('');
    return slice;
  });
};
