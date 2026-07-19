// src/Editor.jsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { getTalamConfig, createBlankBeat, computeLineGroups, migrateRowLyrics } from './talamTemplates';
import NotationCell from './NotationCell';
import MenuBar from './MenuBar';
import KeyboardHelp from './KeyboardHelp';
import { getNotation, saveNotation, createBlankNotation, toNotationFile, NOTATION_FILE_EXTENSION } from './storage';
import { UndoIcon, RedoIcon, SaveIcon, SidebarIcon, HelpIcon, PrinterIcon, DownloadIcon, ChevronLeftIcon, ChevronRightIcon, HomeIcon } from './icons';
import Logo from './Logo';

function AutoResizeTextarea({ value, onChange, className, placeholder, rows = 1, style }) {
  const textareaRef = useRef(null);

  const adjustHeight = () => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${textarea.scrollHeight}px`;
    }
  };

  useEffect(() => {
    adjustHeight();
  }, [value]);

  return (
    <textarea
      ref={textareaRef}
      rows={rows}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      style={style}
      className={`${className} overflow-hidden resize-none min-h-[1.5em] block`}
    />
  );
}

// A single icon button for the toolbar. Uses the native title attribute for
// a tooltip so every icon-only control still says what it does and what its
// shortcut is on hover — no guessing required.
function ToolbarButton({ onClick, disabled, active, label, shortcut, children }) {
  const title = shortcut ? `${label} (${shortcut})` : label;
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      title={title}
      aria-label={title}
      className={`w-7 h-7 flex items-center justify-center rounded transition-all duration-150 active:scale-90 disabled:opacity-25 disabled:pointer-events-none ${
        active ? 'bg-gold-600 text-white' : 'text-tambura-400 hover:bg-tambura-800 hover:text-tambura-100'
      }`}
    >
      {children}
    </button>
  );
}

// Real on-screen pixel height of one printed page at 96 CSS px/in — used to
// figure out how many rows fit on a page before a fresh one is needed, the
// same way a word processor paginates as you type.
const PAGE_HEIGHT_PX = {
  A4: (297 / 25.4) * 96,
  Letter: 11 * 96,
};

// Must stay in sync with the `html { font-size: ... }` rule in index.css.
// Every Tailwind rem-based utility on the page (p-12, pb-2, mt-2, ...)
// resolves against this, so pagination math needs the same number to turn
// those classes into real pixels without waiting on a DOM read.
const ROOT_FONT_PX = 20;
const PAGE_PADDING_PX = 3 * ROOT_FONT_PX * 2; // p-12 (3rem) on top + bottom
const NOTE_ROW_PX = 36; // NotationCell's fixed h-[36px]
const LINE_GAP_PX = 0.5 * ROOT_FONT_PX; // mt-2 above each line's lyrics strip
const LINE_PAD_BOTTOM_PX = 0.5 * ROOT_FONT_PX; // pb-2 under each visual line

// Subheader rows are a single fixed-height line (a plain <input>, not an
// auto-growing textarea) precisely so pagination can treat them like any
// other fixed-pixel row instead of needing a live DOM measurement.
const SUBHEADER_ROW_PX = 34;

// Spacer rows: a blank gap of adjustable height. Defaults/limits/step for
// the +/- stepper control shown on hover.
const SPACER_DEFAULT_PX = 24;
const SPACER_MIN_PX = 8;
const SPACER_MAX_PX = 200;
const SPACER_STEP_PX = 8;

const FONT_OPTIONS = {
  serif: { label: 'Classic Serif', family: 'Georgia, "Noto Serif", serif' },
  playfair: { label: 'Playfair Display', family: '"Playfair Display", Georgia, serif' },
  garamond: { label: 'EB Garamond', family: '"EB Garamond", Georgia, serif' },
  sans: { label: 'Modern Sans', family: '"Inter", ui-sans-serif, system-ui, sans-serif' },
};

function Editor({ notationId, draftNotation, onExit, onNew, onDuplicate, onDelete }) {
  // Loaded once per mount (App.jsx keys this component by notationId, so a
  // switch to a different notation remounts it fresh). A lazy useState
  // initializer (rather than a ref) keeps this a normal, render-safe value.
  // `draftNotation` (in-memory only, not yet in storage) takes priority for
  // brand-new notations that haven't been manually saved yet.
  const [initialNotation] = useState(() => draftNotation || getNotation(notationId) || createBlankNotation(notationId));
  const [createdAt] = useState(() => initialNotation.createdAt || Date.now());

  const [selectedTalam] = useState(initialNotation.selectedTalam || 'ADI');
  const [speed] = useState(initialNotation.speed || 1);
  const [kalai] = useState(initialNotation.kalai || 1);
  const [paperSize] = useState(initialNotation.paperSize || 'A4');
  const [title, setTitle] = useState(initialNotation.title || '');
  const [ragam, setRagam] = useState(initialNotation.ragam || '');
  const [composer, setComposer] = useState(initialNotation.composer || '');

  // talamConfig/currentSubdivisions/lineGroups are derived from selectedTalam
  // + speed + kalai, all of which are locked in for the lifetime of this
  // component, so it's safe to compute them once up front (needed below to
  // migrate any legacy per-part lyrics into the new dynamic lyricLines shape
  // on load). Speed multiplies subdivisions-per-beat by 1x/2x/4x on top of
  // the talam's base nadai (1 swaram/beat by default); kalai is baked into
  // talamConfig itself (doubling every anga's beat count for 2 kalai).
  const [talamConfig] = useState(() => getTalamConfig(selectedTalam, kalai));
  const currentSubdivisions = talamConfig.baseSubdivisions * (speed === 1 ? 1 : speed === 2 ? 2 : 4);
  const [lineGroups] = useState(() => computeLineGroups(talamConfig, speed, currentSubdivisions));

  // One lyric array per visual line group (lineGroups), each sized to that
  // group's own beat count — works for any talam/speed combo, including
  // groups that don't all end up the same length. Defined early (ahead of
  // the keydown effect below) since Enter-at-end-of-row uses it to spin up
  // a fresh avartanam on the fly.
  const buildBlankRow = () => ({
    id: crypto.randomUUID(),
    type: 'notation',
    beats: Array.from({ length: talamConfig.totalBeats }, (_, i) =>
      createBlankBeat(i + 1, currentSubdivisions)
    ),
    lyricLines: lineGroups.map((g) => Array((g.end - g.start + 1) * currentSubdivisions).fill('')),
  });

  // A customizable subheader — just a short label the user types in, styled
  // as a section break between rows (e.g. "Charanam", "Anupallavi 2").
  const buildSubheaderRow = () => ({
    id: crypto.randomUUID(),
    type: 'subheader',
    text: '',
  });

  // A blank vertical gap between rows, height adjustable per-instance.
  const buildSpacerRow = () => ({
    id: crypto.randomUUID(),
    type: 'spacer',
    height: SPACER_DEFAULT_PX,
  });

  const rowBuilders = { notation: buildBlankRow, subheader: buildSubheaderRow, spacer: buildSpacerRow };

  // Rows saved before subheaders/spacers existed have no `type` at all —
  // treat that (and any row explicitly marked 'notation') as a normal row.
  const isNotationRow = (row) => !row || !row.type || row.type === 'notation';

  const [avartanams, setAvartanams] = useState(() =>
    (initialNotation.avartanams || []).map((row) =>
      (row.type && row.type !== 'notation')
        ? row
        : { ...row, type: 'notation', lyricLines: migrateRowLyrics(row, lineGroups, currentSubdivisions) }
    )
  );
  const [selectedCell, setSelectedCell] = useState(null);
  const [lastTypedCell, setLastTypedCell] = useState(null);

  // Sizing Layout Controls
  const [fontSize, setFontSize] = useState(initialNotation.fontSize ?? 13);
  const [cellGap, setCellGap] = useState(initialNotation.cellGap ?? 2);
  const [rowGap, setRowGap] = useState(initialNotation.rowGap ?? 18);
  const [docFont, setDocFont] = useState(initialNotation.docFont || 'serif');
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [showHelp, setShowHelp] = useState(false);
  // Which row's "insert subheader/spacer" palette popover is currently open
  // (an avartanam index), or null if none is.
  const [rowPaletteFor, setRowPaletteFor] = useState(null);
  const fontFamily = FONT_OPTIONS[docFont]?.family || FONT_OPTIONS.serif.family;

  // --- MULTI-PAGE PAGINATION (Google-Docs-style) ---
  // Page breaks are computed from real page geometry (paper size + known,
  // fixed CSS dimensions of a row) rather than by measuring a live DOM row
  // and hoping it settles before paint. That approach (tried twice before —
  // see git history) was fragile: it depended on a ResizeObserver callback
  // racing the first render, on "row 0" staying representative of every
  // row, and on guessed fallback numbers — any of which could quietly
  // under-count how much space a page's worth of rows would actually take,
  // letting too many rows get assigned to one page. Since the page box only
  // had a *min*-height, it then just stretched taller instead of ever
  // starting a new page.
  //
  // Instead: every part of a row's height is either a fixed pixel value
  // (NotationCell is hard-coded to h-[36px]; the lyrics strip's height is
  // computed straight from `fontSize`) or a Tailwind rem-based utility,
  // which is exactly ROOT_FONT_PX times its rem value since the app sets
  // `html { font-size }` once, globally, itself (see index.css) — no
  // observer needed to know it. That covers every talam/speed/kalai
  // combination automatically through `lineGroups.length` (the number of
  // visual lines one avartanam renders as, already computed from the talam
  // config) — so this is inherently "regardless of what talam is used": a
  // Rupaka row and a fast-speed Adi row with 4 line groups simply get 4x
  // the per-line height, with no talam-specific logic here at all.
  //
  // The one true exception is the header: Ragam/Title/Composer are
  // free-typed text that can wrap onto extra lines, and no fixed formula
  // can predict that — so it's the only piece still measured live.
  const [measuredHeaderHeight, setMeasuredHeaderHeight] = useState(0);

  const headerObserverRef = useRef(null);
  const setHeaderRef = useCallback((node) => {
    if (headerObserverRef.current) {
      headerObserverRef.current.disconnect();
      headerObserverRef.current = null;
    }
    if (node) {
      const measure = () => {
        const rect = node.getBoundingClientRect();
        const marginBottom = parseFloat(getComputedStyle(node).marginBottom) || 0;
        if (rect.height > 0) setMeasuredHeaderHeight(rect.height + marginBottom);
      };
      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(node);
      headerObserverRef.current = ro;
    }
  }, []);

  // Groups of absolute avartanam indices, one group per visible page. Page 1
  // has less room (the ragam/title/composer header eats into it), every
  // page after that gets the full page height.
  const pageGroups = useMemo(() => {
    const total = avartanams.length;
    if (total === 0) return [[]];

    const pageHeightPx = PAGE_HEIGHT_PX[paperSize] || PAGE_HEIGHT_PX.A4;

    // One visual line = the note row (fixed 36px) + the lyrics strip below
    // it (mt-2 gap, its own height, pb-2 padding) — mirrors the
    // exact markup in the DISPLAY GRID AREA below, line for line. A row is
    // 1, 2, or 4 of these stacked depending on talam/speed (lineGroups).
    const lyricsRowHeight = Math.max(9, fontSize - 2) + 10;
    const perLineHeight = NOTE_ROW_PX + LINE_GAP_PX + lyricsRowHeight + LINE_PAD_BOTTOM_PX;
    const numLines = Math.max(1, lineGroups.length);
    // Lines within a row are separated by rowGap/2 (see the "SCORE BLOCKS
    // LAYER SYSTEMS" wrapper below); rows themselves by the full rowGap.
    const notationRowH = numLines * perLineHeight + (numLines - 1) * (rowGap / 2);

    // Subheaders are a fixed single-line height; spacers carry their own
    // adjustable height. Everything else is a normal notation row.
    const rowHeightPx = (row) => {
      if (row.type === 'subheader') return SUBHEADER_ROW_PX;
      if (row.type === 'spacer') return row.height ?? SPACER_DEFAULT_PX;
      return notationRowH;
    };

    const headerH = measuredHeaderHeight || 110;
    const footerReserve = 8;

    const firstPageAvail = pageHeightPx - PAGE_PADDING_PX - headerH - footerReserve;
    const otherPageAvail = pageHeightPx - PAGE_PADDING_PX - footerReserve;

    const groups = [];
    let idx = 0;
    let isFirstPage = true;
    while (idx < total) {
      const available = isFirstPage ? firstPageAvail : otherPageAvail;
      let used = 0;
      let count = 0;
      while (idx + count < total) {
        const h = rowHeightPx(avartanams[idx + count]);
        const addition = count === 0 ? h : rowGap + h;
        if (count > 0 && used + addition > available) break;
        used += addition;
        count++;
      }
      if (count === 0) count = 1; // always make progress, even if one row alone overflows a page
      groups.push(Array.from({ length: count }, (_, k) => idx + k));
      idx += count;
      isFirstPage = false;
    }
    return groups.length ? groups : [[]];
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    avartanams.length,
    avartanams.map((r) => `${r.type || 'n'}${r.type === 'spacer' ? ':' + (r.height ?? SPACER_DEFAULT_PX) : ''}`).join('|'),
    lineGroups.length,
    fontSize,
    rowGap,
    measuredHeaderHeight,
    paperSize,
  ]);

  // --- UNDO / REDO HISTORY (covers notes + lyrics, since both live on avartanams) ---
  const [history, setHistory] = useState(() => [JSON.parse(JSON.stringify(initialNotation.avartanams || []))]);
  const [historyIndex, setHistoryIndex] = useState(0);
  const isHistoryNavRef = useRef(false);
  const skipNextHistoryPush = useRef(true);

  useEffect(() => {
    if (isHistoryNavRef.current) {
      isHistoryNavRef.current = false;
      return;
    }
    if (skipNextHistoryPush.current) {
      skipNextHistoryPush.current = false;
      return;
    }
    const snapshot = JSON.parse(JSON.stringify(avartanams));
    const truncated = history.slice(0, historyIndex + 1);
    const nextHistory = [...truncated, snapshot].slice(-100);
    setHistory(nextHistory);
    setHistoryIndex(nextHistory.length - 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [avartanams]);

  const undo = useCallback(() => {
    if (historyIndex <= 0) return;
    const newIndex = historyIndex - 1;
    isHistoryNavRef.current = true;
    setAvartanams(JSON.parse(JSON.stringify(history[newIndex])));
    setHistoryIndex(newIndex);
    setSelectedCell(null);
    setLastTypedCell(null);
  }, [history, historyIndex]);

  const redo = useCallback(() => {
    if (historyIndex >= history.length - 1) return;
    const newIndex = historyIndex + 1;
    isHistoryNavRef.current = true;
    setAvartanams(JSON.parse(JSON.stringify(history[newIndex])));
    setHistoryIndex(newIndex);
    setSelectedCell(null);
    setLastTypedCell(null);
  }, [history, historyIndex]);

  const canUndo = historyIndex > 0;
  const canRedo = historyIndex < history.length - 1;

  // --- SAVE (manual first, then autosave) ---
  // Brand-new notations stay in-memory only until the user explicitly saves
  // once — this keeps stray/abandoned drafts out of the home page list.
  // After that first manual save, autosave takes over as usual.
  const [hasSaved, setHasSaved] = useState(() => Boolean(getNotation(notationId)));
  const [saveStatus, setSaveStatus] = useState('saved');
  const saveTimeoutRef = useRef(null);
  const isFirstRenderRef = useRef(true);

  const buildSnapshot = () => ({
    id: notationId,
    title,
    ragam,
    composer,
    selectedTalam,
    speed,
    kalai,
    paperSize,
    avartanams,
    fontSize,
    cellGap,
    rowGap,
    docFont,
    createdAt,
  });

  const handleManualSave = useCallback(() => {
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveNotation(buildSnapshot());
    setHasSaved(true);
    setSaveStatus('saved');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [notationId, title, ragam, composer, selectedTalam, speed, kalai, paperSize, avartanams, fontSize, cellGap, rowGap, docFont, createdAt]);

  // Downloads the current notation as a standalone .kriti file — the
  // proprietary export format (see storage.js) that can be moved off this
  // browser and re-imported from the Home screen later to keep editing.
  const handleExportFile = () => {
    const fileData = toNotationFile(buildSnapshot());
    const blob = new Blob([JSON.stringify(fileData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const safeName = (title || 'Untitled Notation').replace(/[\\/:*?"<>|]+/g, '').trim() || 'Untitled Notation';
    const a = document.createElement('a');
    a.href = url;
    a.download = `${safeName}${NOTATION_FILE_EXTENSION}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  useEffect(() => {
    if (isFirstRenderRef.current) {
      isFirstRenderRef.current = false;
      return;
    }
    if (!hasSaved) return; // nothing to autosave until the first manual save
    // eslint-disable-next-line react-hooks/set-state-in-effect -- intentional: flips the header's "Saving…" indicator the moment a change comes in, before the debounced write below actually fires.
    setSaveStatus('saving');
    if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
    saveTimeoutRef.current = setTimeout(() => {
      saveNotation(buildSnapshot());
      setSaveStatus('saved');
    }, 500);
    return () => clearTimeout(saveTimeoutRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [title, ragam, composer, selectedTalam, speed, kalai, avartanams, fontSize, cellGap, rowGap, docFont, hasSaved]);

  // Leaving the editor: if it's already been saved at least once, flush any
  // pending autosave so nothing typed in the last moment is lost. If it was
  // never saved and there's actual content, show an in-app dialog instead of
  // a browser confirm() — otherwise walking away silently discards the draft
  // (which is the whole point: no stray unsaved notations cluttering Home).
  const [showExitConfirm, setShowExitConfirm] = useState(false);

  const handleExit = () => {
    if (hasSaved) {
      if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
      saveNotation(buildSnapshot());
      onExit();
      return;
    }
    const hasContent = title.trim() || ragam.trim() || composer.trim() || avartanams.length > 0;
    if (hasContent) {
      setShowExitConfirm(true);
      return;
    }
    onExit();
  };

  const handleSaveAndExit = () => {
    saveNotation(buildSnapshot());
    setShowExitConfirm(false);
    onExit();
  };

  const handleDiscardAndExit = () => {
    setShowExitConfirm(false);
    onExit();
  };

  // Refreshing or closing the tab isn't a navigation this app can intercept
  // (there's no browser history to fall back on), so it's the one way work
  // could vanish with zero warning. Only guard the case that's actually at
  // risk: a new, never-saved notation with real content in it — once
  // something's been saved at least once, autosave already has it covered.
  useEffect(() => {
    const hasContent = title.trim() || ragam.trim() || composer.trim() || avartanams.length > 0;
    if (hasSaved || !hasContent) return;
    const handleBeforeUnload = (e) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasSaved, title, ragam, composer, avartanams.length]);

  // --- AUTOMATIC CURSOR ADVANCEMENT ENGINE FOR NOTES ---
  const advanceCursor = useCallback((currentSelection) => {
    if (!currentSelection) return;
    const { aIdx, bIdx, cIdx } = currentSelection;
    
    const currentAvartanam = avartanams[aIdx];
    if (!currentAvartanam) return;
    const currentBeat = currentAvartanam.beats[bIdx];
    if (!currentBeat) return;

    if (cIdx < currentBeat.cells.length - 1) {
      setSelectedCell({ aIdx, bIdx, cIdx: cIdx + 1 });
    } else if (bIdx < currentAvartanam.beats.length - 1) {
      setSelectedCell({ aIdx, bIdx: bIdx + 1, cIdx: 0 });
    } else {
      // Skip past any subheader/spacer rows (they have no beats/cells) to
      // land on the next actual notation row, if there is one.
      let next = aIdx + 1;
      while (next < avartanams.length && !isNotationRow(avartanams[next])) next++;
      if (next < avartanams.length) setSelectedCell({ aIdx: next, bIdx: 0, cIdx: 0 });
    }
  }, [avartanams]);

  // --- AUTOMATIC CURSOR REGRESSION ENGINE ---
  const getPreviousCell = useCallback((currentSelection) => {
    if (!currentSelection) return null;
    const { aIdx, bIdx, cIdx } = currentSelection;

    if (cIdx > 0) {
      return { aIdx, bIdx, cIdx: cIdx - 1 };
    }
    if (bIdx > 0) {
      const prevBeat = avartanams[aIdx]?.beats[bIdx - 1];
      if (prevBeat) {
        return { aIdx, bIdx: bIdx - 1, cIdx: prevBeat.cells.length - 1 };
      }
    }
    if (aIdx > 0) {
      let prevIdx = aIdx - 1;
      while (prevIdx >= 0 && !isNotationRow(avartanams[prevIdx])) prevIdx--;
      const prevAvartanam = avartanams[prevIdx];
      if (prevAvartanam) {
        const lastBeatIdx = prevAvartanam.beats.length - 1;
        const lastBeat = prevAvartanam.beats[lastBeatIdx];
        if (lastBeat) {
          return { aIdx: prevIdx, bIdx: lastBeatIdx, cIdx: lastBeat.cells.length - 1 };
        }
      }
    }
    return null;
  }, [avartanams]);

  // Keyboard Entry Listeners for Notes
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (!selectedCell) return;
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') {
        return; 
      }

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        setLastTypedCell(null);
        advanceCursor(selectedCell);
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        const prev = getPreviousCell(selectedCell);
        if (prev) {
          setSelectedCell(prev);
          setLastTypedCell(null);
        }
        return;
      }

      if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
        e.preventDefault();
        const { aIdx, bIdx, cIdx } = selectedCell;
        const step = e.key === 'ArrowUp' ? -1 : 1;
        let targetAIdx = aIdx + step;
        while (targetAIdx >= 0 && targetAIdx < avartanams.length && !isNotationRow(avartanams[targetAIdx])) {
          targetAIdx += step;
        }
        const targetAvartanam = avartanams[targetAIdx];
        if (!targetAvartanam) return;

        // Same beat/cell position in the row above/below, clamped in case
        // that row has fewer beats or a differently-sized beat at that spot.
        const clampedBIdx = Math.min(bIdx, targetAvartanam.beats.length - 1);
        const targetBeat = targetAvartanam.beats[clampedBIdx];
        const clampedCIdx = targetBeat ? Math.min(cIdx, targetBeat.cells.length - 1) : 0;

        setSelectedCell({ aIdx: targetAIdx, bIdx: clampedBIdx, cIdx: clampedCIdx });
        setLastTypedCell(null);
        return;
      }

      if (e.key === 'Backspace') {
        e.preventDefault();
        
        const target = lastTypedCell || selectedCell;
        const { aIdx, bIdx, cIdx } = target;
        const updated = [...avartanams];
        const currentCellData = updated[aIdx]?.beats[bIdx]?.cells[cIdx];

        if (currentCellData) {
          if (currentCellData.swaram && currentCellData.swaram !== '') {
            currentCellData.swaram = '';
            setAvartanams(updated);
            setSelectedCell({ aIdx, bIdx, cIdx });
            setLastTypedCell(null); 
          } else {
            const prev = getPreviousCell(target);
            if (prev) {
              const prevCellData = updated[prev.aIdx]?.beats[prev.bIdx]?.cells[prev.cIdx];
              if (prevCellData) {
                prevCellData.swaram = '';
                setAvartanams(updated);
                setSelectedCell(prev);
                setLastTypedCell(null); 
              }
            }
          }
        }
        return;
      }

      if (e.key === 'Enter') {
        e.preventDefault();

        const { aIdx, bIdx, cIdx } = selectedCell;
        const currentAvartanam = avartanams[aIdx];
        if (!currentAvartanam) return;
        const currentBeat = currentAvartanam.beats[bIdx];
        if (!currentBeat) return;

        const atEndOfRow = bIdx === currentAvartanam.beats.length - 1 && cIdx === currentBeat.cells.length - 1;
        if (!atEndOfRow) return;

        // Enter always starts a fresh row right after this one — the same
        // way it works in a text editor — rather than only creating one
        // when this happens to be the last row in the sheet.
        const updated = [...avartanams];
        updated.splice(aIdx + 1, 0, buildBlankRow());
        setAvartanams(updated);
        setSelectedCell({ aIdx: aIdx + 1, bIdx: 0, cIdx: 0 });
        setLastTypedCell(null);
        
        // If we're on the very last row, auto-add another blank page's worth
        ensureRowAfterCurrent(aIdx + 1);
        return;
      }

      const key = e.key.toUpperCase();
      const validSwarams = ['S', 'R', 'G', 'M', 'P', 'D', 'N', ',', '.', ';'];

      if (validSwarams.includes(key)) {
        e.preventDefault();
        const { aIdx, bIdx, cIdx } = selectedCell;
        const updated = [...avartanams];
        if (updated[aIdx] && updated[aIdx].beats[bIdx] && updated[aIdx].beats[bIdx].cells[cIdx]) {
          updated[aIdx].beats[bIdx].cells[cIdx].swaram = key;
          setAvartanams(updated);
          
          setLastTypedCell({ aIdx, bIdx, cIdx });
          advanceCursor(selectedCell);
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedCell, lastTypedCell, avartanams, advanceCursor, getPreviousCell, buildBlankRow]);

  // Undo / Redo shortcuts. Skipped while focus is inside a text field so the
  // browser's native undo for that field's own typing still works normally.
  useEffect(() => {
    const handleUndoRedoKeys = (e) => {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
      const isModifier = e.metaKey || e.ctrlKey;
      if (!isModifier || e.key.toLowerCase() !== 'z') return;
      e.preventDefault();
      if (e.shiftKey) {
        redo();
      } else {
        undo();
      }
    };
    window.addEventListener('keydown', handleUndoRedoKeys);
    return () => window.removeEventListener('keydown', handleUndoRedoKeys);
  }, [undo, redo]);

  // Manual save shortcut. Intentionally NOT gated on the text-field check
  // above — saving while your cursor is in the title or a lyric box should
  // still work, and it should always take over the browser's own Save dialog.
  useEffect(() => {
    const handleSaveKey = (e) => {
      const isModifier = e.metaKey || e.ctrlKey;
      if (!isModifier || e.key.toLowerCase() !== 's') return;
      e.preventDefault();
      handleManualSave();
    };
    window.addEventListener('keydown', handleSaveKey);
    return () => window.removeEventListener('keydown', handleSaveKey);
  }, [handleManualSave]);

  // Printing/exporting should show the notation sheet only — never the
  // editor's current selection highlight or a focused field's outline.
  // 'beforeprint' fires for every trigger (toolbar button, menu item, or the
  // browser's own Cmd/Ctrl+P), so this covers all of them in one place.
  useEffect(() => {
    const handleBeforePrint = () => {
      setSelectedCell(null);
      setLastTypedCell(null);
      if (document.activeElement instanceof HTMLElement) {
        document.activeElement.blur();
      }
    };
    window.addEventListener('beforeprint', handleBeforePrint);
    return () => window.removeEventListener('beforeprint', handleBeforePrint);
  }, []);

  // "?" opens the keyboard reference — skipped while typing in a field.
  useEffect(() => {
    const handleHelpKey = (e) => {
      if (e.target.tagName === 'TEXTAREA' || e.target.tagName === 'INPUT') return;
      if (e.key !== '?') return;
      e.preventDefault();
      setShowHelp((v) => !v);
    };
    window.addEventListener('keydown', handleHelpKey);
    return () => window.removeEventListener('keydown', handleHelpKey);
  }, []);

  // --- MODIFIERS ---
  const toggleOctaveModifier = (targetValue) => {
    const target = lastTypedCell || selectedCell;
    if (!target) return;

    const { aIdx, bIdx, cIdx } = target;
    const updated = [...avartanams];
    const currentCell = updated[aIdx]?.beats[bIdx]?.cells[cIdx];
    
    if (currentCell) {
      currentCell.octave = currentCell.octave === targetValue ? 'normal' : targetValue;
      setAvartanams(updated);
    }
  };

  const setGamakamOnSelected = (hasGamakam, value = '') => {
    const target = lastTypedCell || selectedCell;
    if (!target) return;

    const { aIdx, bIdx, cIdx } = target;
    const updated = [...avartanams];
    const currentCell = updated[aIdx]?.beats[bIdx]?.cells[cIdx];
    if (currentCell) {
      currentCell.gamakam.hasGamakam = hasGamakam;
      currentCell.gamakam.subSwaras = value;
      setAvartanams(updated);
    }
  };

  // --- ROW OPERATIONS ---
  const appendNewRow = (type = 'notation') => {
    setAvartanams([...avartanams, (rowBuilders[type] || buildBlankRow)()]);
  };

  // Auto-append a new row when the user is on the last beat of the last row
  // and types Enter — this keeps the flow going without manual intervention.
  const ensureRowAfterCurrent = (currentAIdx) => {
    if (currentAIdx === avartanams.length - 1) {
      setAvartanams(prev => [...prev, buildBlankRow()]);
    }
  };

  const insertRowAt = (index, position = 'below', type = 'notation') => {
    const updated = [...avartanams];
    const targetIndex = position === 'above' ? index : index + 1;
    updated.splice(targetIndex, 0, (rowBuilders[type] || buildBlankRow)());
    setAvartanams(updated);
    setSelectedCell(null);
    setLastTypedCell(null);
  };

  const deleteRowAt = (index) => {
    const updated = avartanams.filter((_, idx) => idx !== index);
    setAvartanams(updated);
    setSelectedCell(null);
    setLastTypedCell(null);
  };

  // Patches a subheader's text or a spacer's height in place.
  const updateSpecialRow = (index, patch) => {
    setAvartanams(prev => {
      const updated = [...prev];
      if (!updated[index]) return prev;
      updated[index] = { ...updated[index], ...patch };
      return updated;
    });
  };

  const clampSpacerHeight = (n) => Math.min(SPACER_MAX_PX, Math.max(SPACER_MIN_PX, n));

  const clearAllNotes = () => {
    if (avartanams.length === 0) return;
    if (!window.confirm('Clear all rows from this notation? This cannot be undone once you leave the editor.')) return;
    setAvartanams([]);
    setSelectedCell(null);
    setLastTypedCell(null);
  };

  // Applies `updates` (an array of {lyricIdx, value} for the same visual
  // line) to avartanam[aIdx].lyricLines[lineIndex] in one immutable pass.
  const applyLyricUpdates = (aIdx, lineIndex, updates) => {
    setAvartanams(prev => {
      const avartanam = prev[aIdx];
      if (!avartanam) return prev;

      const newLyricLines = [...avartanam.lyricLines];
      const newLyrics = [...newLyricLines[lineIndex]];
      updates.forEach(({ lyricIdx, value }) => {
        if (lyricIdx >= 0 && lyricIdx < newLyrics.length) {
          newLyrics[lyricIdx] = value;
        }
      });
      newLyricLines[lineIndex] = newLyrics;

      const updated = [...prev];
      updated[aIdx] = { ...avartanam, lyricLines: newLyricLines };
      return updated;
    });
  };

  const handleLyricChange = (aIdx, lineIndex, lyricIdx, val) => {
    applyLyricUpdates(aIdx, lineIndex, [{ lyricIdx, value: val }]);
  };

  const focusLyricBox = (lineId, idx, selectAll = false) => {
    const el = document.getElementById(`lyric-box-${lineId}-${idx}`);
    if (el) {
      el.focus();
      if (selectAll) el.select();
    }
  };

  // --- LYRIC KEY INTERCEPTOR ENGINE ---
  // Space/Right-arrow-at-end moves forward a box (without typing a space),
  // Left-arrow-at-start/Backspace-on-empty moves back a box — so you can type
  // or correct a whole line of syllables without reaching for the mouse.
  const handleLyricKeyDown = (e, lineId, lyricIdx) => {
    const atStart = e.target.selectionStart === 0 && e.target.selectionEnd === 0;
    const atEnd = e.target.selectionStart === e.target.value.length && e.target.selectionEnd === e.target.value.length;

    if (e.key === ' ') {
      e.preventDefault();
      focusLyricBox(lineId, lyricIdx + 1, true);
    } else if (e.key === 'ArrowRight' && atEnd) {
      e.preventDefault();
      focusLyricBox(lineId, lyricIdx + 1, true);
    } else if (e.key === 'ArrowLeft' && atStart) {
      e.preventDefault();
      focusLyricBox(lineId, lyricIdx - 1, true);
    } else if (e.key === 'Backspace' && e.target.value === '') {
      e.preventDefault();
      focusLyricBox(lineId, lyricIdx - 1, true);
    }
  };

  // --- LYRIC PASTE-TO-FILL ---
  // Paste (or drop) a whole lyric line like "ni ni ri ga ma pa" into any box
  // and each word/syllable lands in its own box from that point onward —
  // no more clicking + typing + spacing through every single cell by hand.
  const handleLyricPaste = (e, aIdx, lineIndex, lineId, startIdx, lineLength) => {
    const text = e.clipboardData.getData('text');
    const words = text.trim().split(/\s+/).filter(Boolean);

    // A single word (or empty paste) is just a normal paste into this one
    // box — only take over when there's more than one syllable to spread.
    if (words.length <= 1) return;

    e.preventDefault();
    const updates = words
      .map((word, i) => ({ lyricIdx: startIdx + i, value: word }))
      .filter(u => u.lyricIdx < lineLength);
    applyLyricUpdates(aIdx, lineIndex, updates);

    const lastIdx = Math.min(startIdx + words.length - 1, lineLength - 1);
    requestAnimationFrame(() => focusLyricBox(lineId, lastIdx, true));
  };

  // Maps this row's beats/lyricLines onto the talam-and-speed-derived
  // lineGroups computed once above — works for any talam, not just Adi.
  const getVisualLines = (avartanam) => {
    return lineGroups.map((g, idx) => ({
      lineId: `part-${idx + 1}`,
      beats: avartanam.beats.slice(g.start - 1, g.end),
      label: g.label,
      lineIndex: idx,
      lyricArray: avartanam.lyricLines?.[idx] || [],
    }));
  };

  const clampFontSize = (n) => Math.min(20, Math.max(11, n));
  const clampCellGap = (n) => Math.min(16, Math.max(2, n));
  const clampRowGap = (n) => Math.min(48, Math.max(16, n));

  const menus = [
    {
      label: 'File',
      items: [
        { label: 'Save', onClick: handleManualSave, shortcut: '⌘S' },
        { divider: true },
        { label: 'New Notation', onClick: onNew, shortcut: '⌘N' },
        { label: 'Duplicate Notation', onClick: () => onDuplicate?.(notationId), disabled: !hasSaved },
        { divider: true },
        { label: 'Print / Export PDF', onClick: () => window.print(), shortcut: '⌘P' },
        { label: `Export Notation File (${NOTATION_FILE_EXTENSION})`, onClick: handleExportFile },
        { divider: true },
        { label: 'Back to Home', onClick: handleExit },
        { divider: true },
        {
          label: 'Delete Notation…',
          disabled: !hasSaved,
          onClick: () => {
            if (window.confirm(`Delete "${title || 'Untitled Notation'}"? This cannot be undone.`)) {
              onDelete?.(notationId);
            }
          },
        },
      ],
    },
    {
      label: 'Edit',
      items: [
        { label: 'Undo', onClick: undo, shortcut: '⌘Z', disabled: !canUndo },
        { label: 'Redo', onClick: redo, shortcut: '⇧⌘Z', disabled: !canRedo },
        { divider: true },
        { label: 'Append Row', onClick: () => appendNewRow('notation') },
        { label: 'Append Subheader', onClick: () => appendNewRow('subheader') },
        { label: 'Append Spacer', onClick: () => appendNewRow('spacer') },
        { divider: true },
        { label: 'Clear All Notes…', onClick: clearAllNotes, disabled: avartanams.length === 0 },
      ],
    },
    {
      label: 'Format',
      items: [
        {
          label: 'Font',
          submenu: Object.entries(FONT_OPTIONS).map(([key, opt]) => ({
            label: opt.label,
            checked: docFont === key,
            style: { fontFamily: opt.family },
            onClick: () => setDocFont(key),
          })),
        },
        { divider: true },
        { label: 'Increase Note Size', onClick: () => setFontSize((n) => clampFontSize(n + 1)), shortcut: '⌘+' },
        { label: 'Decrease Note Size', onClick: () => setFontSize((n) => clampFontSize(n - 1)), shortcut: '⌘−' },
        { divider: true },
        { label: 'Increase Note Spacing', onClick: () => setCellGap((n) => clampCellGap(n + 1)) },
        { label: 'Decrease Note Spacing', onClick: () => setCellGap((n) => clampCellGap(n - 1)) },
        { divider: true },
        { label: 'Increase Line Spacing', onClick: () => setRowGap((n) => clampRowGap(n + 2)) },
        { label: 'Decrease Line Spacing', onClick: () => setRowGap((n) => clampRowGap(n - 2)) },
        { divider: true },
        { label: 'Reset Layout', onClick: () => { setFontSize(13); setCellGap(4); setRowGap(24); } },
      ],
    },
    {
      label: 'View',
      items: [
        { label: 'Show Sidebar', checked: sidebarOpen, onClick: () => setSidebarOpen((v) => !v) },
      ],
    },
  ];

  return (
    <div 
      className="h-screen flex flex-col bg-tambura-900 text-tambura-100 font-sans overflow-hidden print:h-auto print:overflow-visible print:bg-white print:text-black animate-fade-in" 
      onClick={() => { setSelectedCell(null); setLastTypedCell(null); }}
    >
      {/* TOP NAVBAR */}
      <header className="border-b border-tambura-800 bg-tambura-950 shrink-0 print:hidden">
        <div className="h-11 flex items-center justify-between px-4">
          <div className="flex items-center gap-4">
            <button
              onClick={(e) => { e.stopPropagation(); handleExit(); }}
              title="Save and return to your notation list"
              className="flex items-center gap-1.5 text-tambura-200 hover:text-gold-300 bg-tambura-900 hover:bg-tambura-800 border border-tambura-700 hover:border-gold-600 active:scale-95 text-xs font-semibold pl-2 pr-3 py-1.5 rounded-md transition-all duration-150"
            >
              <HomeIcon className="w-3.5 h-3.5" />
              Home
            </button>
            <span className="flex items-center gap-2">
              <Logo size={22} />
              <span className="text-gold-400 font-serif font-black tracking-wider hidden sm:inline">KritiStudio Workspace</span>
            </span>
            <span className="text-[10px] text-tambura-500 font-mono uppercase tracking-wider flex items-center gap-1.5">
              {!hasSaved ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                  Not saved yet
                </>
              ) : (
                <>
                  {saveStatus === 'saving' && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse-dot" />}
                  {saveStatus === 'saving' ? 'Saving…' : 'All changes saved'}
                </>
              )}
            </span>
          </div>
          <button
            onClick={() => window.print()}
            className="bg-gold-600 hover:bg-gold-500 active:scale-95 text-white font-semibold text-xs px-4 py-1.5 rounded shadow transition-all duration-150"
          >
            Print / Export PDF
          </button>
        </div>
        <div
          className="h-9 flex items-center justify-between px-3 border-t border-tambura-900"
          onClick={(e) => e.stopPropagation()}
        >
          <MenuBar menus={menus} />

          {/* VISIBLE TOOLBAR — the actions people reach for constantly, so
              they don't have to learn they're tucked inside File/Edit menus. */}
          <div className="flex items-center gap-0.5">
            <ToolbarButton onClick={undo} disabled={!canUndo} label="Undo" shortcut="⌘Z">
              <UndoIcon className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton onClick={redo} disabled={!canRedo} label="Redo" shortcut="⇧⌘Z">
              <RedoIcon className="w-4 h-4" />
            </ToolbarButton>

            <div className="w-px h-4 bg-tambura-800 mx-1.5" />

            <ToolbarButton onClick={handleManualSave} label="Save" shortcut="⌘S">
              <SaveIcon className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton onClick={() => window.print()} label="Print / Export PDF" shortcut="⌘P">
              <PrinterIcon className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton onClick={handleExportFile} label={`Export Notation File (${NOTATION_FILE_EXTENSION})`}>
              <DownloadIcon className="w-4 h-4" />
            </ToolbarButton>

            <div className="w-px h-4 bg-tambura-800 mx-1.5" />

            <ToolbarButton onClick={() => setSidebarOpen((v) => !v)} label={sidebarOpen ? 'Hide Sidebar' : 'Show Sidebar'} active={sidebarOpen}>
              <SidebarIcon className="w-4 h-4" />
            </ToolbarButton>
            <ToolbarButton onClick={() => setShowHelp(true)} label="Keyboard Reference" shortcut="?">
              <HelpIcon className="w-4 h-4" />
            </ToolbarButton>
          </div>
        </div>
      </header>


      {/* CORE WORKSPACE */}
      <div className="flex flex-1 overflow-hidden print:overflow-visible">
        
        {/* LEFT DOCK SIDEBAR */}
        <aside
          className={`relative border-r border-tambura-800 bg-tambura-950 flex flex-col overflow-y-auto overflow-x-hidden select-none shrink-0 print:hidden transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${
            sidebarOpen ? 'w-80' : 'w-0 border-r-0'
          }`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="w-80">

          {/* COLLAPSE HANDLE — toggling the sidebar shouldn't require a trip
              to the toolbar or the View menu; it lives right on the panel. */}
          <button
            onClick={() => setSidebarOpen(false)}
            title="Hide Sidebar"
            aria-label="Hide Sidebar"
            className="w-full flex items-center gap-1.5 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-tambura-500 hover:text-tambura-200 hover:bg-tambura-900/60 border-b border-tambura-800 transition-colors duration-150"
          >
            <ChevronLeftIcon className="w-3.5 h-3.5" />
            Hide Panel
          </button>

          {/* CONTROLS */}
          <div className="p-4 border-b border-tambura-800 bg-tambura-900/40">
            <h3 className="text-xs font-bold uppercase tracking-wider text-gold-400 mb-3">Layout Presets</h3>
            <div className="flex flex-col gap-3 text-xs">
              <div>
                <div className="flex justify-between mb-1 text-tambura-400"><span>Font Size</span><span>{fontSize}px</span></div>
                <input type="range" min="11" max="20" value={fontSize} onChange={(e) => setFontSize(Number(e.target.value))} className="w-full accent-gold-500" />
              </div>
              <div>
                <div className="flex justify-between mb-1 text-tambura-400"><span>Note Spacing</span><span>{cellGap}px</span></div>
                <input type="range" min="1" max="16" value={cellGap} onChange={(e) => setCellGap(Number(e.target.value))} className="w-full accent-gold-500" />
              </div>
              <div>
                <div className="flex justify-between mb-1 text-tambura-400"><span>Line Gap Density</span><span>{rowGap}px</span></div>
                <input type="range" min="12" max="48" value={rowGap} onChange={(e) => setRowGap(Number(e.target.value))} className="w-full accent-gold-500" />
              </div>
            </div>
          </div>

          {/* CONFIG (read-only: talam & speed are locked in when the notation is created) */}
          <div className="border-b border-tambura-800 p-4 flex flex-col gap-3">
            <div>
              <label className="block text-[10px] uppercase font-bold text-tambura-500 mb-1">Talam</label>
              <div className="w-full bg-tambura-900/60 border border-tambura-800 p-1.5 rounded text-xs text-tambura-300">
                {talamConfig.name} Talam ({talamConfig.totalBeats} Beats)
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-tambura-500 mb-1">Kalai</label>
              <div className="w-full bg-tambura-900/60 border border-tambura-800 p-1.5 rounded text-xs text-tambura-300">
                {kalai === 2 ? '2 Kalai' : '1 Kalai'}
              </div>
            </div>

            <div>
              <label className="block text-[10px] uppercase font-bold text-tambura-500 mb-1">Speed</label>
              <div className="w-full bg-tambura-900/60 border border-tambura-800 p-1.5 rounded text-xs text-tambura-300">
                {speed === 1 ? '1st Speed' : speed === 2 ? '2nd Speed' : '3rd Speed'}
              </div>
              <p className="text-[10px] text-tambura-600 italic mt-1">Set when the notation was created — start a new notation to change it.</p>
            </div>
          </div>

          {/* PALETTE PANEL */}
          <div className="p-4 flex-1 flex flex-col gap-4">
            <div className="text-xs font-bold uppercase tracking-wider text-tambura-400">Modifiers</div>
            <div>
              <span className="text-[10px] text-tambura-500 uppercase font-bold block mb-1.5">Sthayi / Octave Dots</span>
              <div className="grid grid-cols-2 gap-1.5">
                <button 
                  disabled={!selectedCell && !lastTypedCell} 
                  onClick={() => toggleOctaveModifier('higher')} 
                  className={`p-2 text-xs font-bold bg-tambura-900 border hover:bg-gold-950 rounded text-center flex items-center justify-center gap-2 text-tambura-200 disabled:opacity-20 ${((lastTypedCell || selectedCell) && avartanams[(lastTypedCell || selectedCell).aIdx]?.beats[(lastTypedCell || selectedCell).bIdx]?.cells[(lastTypedCell || selectedCell).cIdx]?.octave === 'higher') ? 'border-gold-500 bg-gold-950 text-gold-400' : 'border-tambura-800'}`}
                >
                  ● Tara (High)
                </button>
                <button 
                  disabled={!selectedCell && !lastTypedCell} 
                  onClick={() => toggleOctaveModifier('lower')} 
                  className={`p-2 text-xs font-bold bg-tambura-900 border hover:bg-gold-950 rounded text-center flex items-center justify-center gap-2 text-tambura-200 disabled:opacity-20 ${((lastTypedCell || selectedCell) && avartanams[(lastTypedCell || selectedCell).aIdx]?.beats[(lastTypedCell || selectedCell).bIdx]?.cells[(lastTypedCell || selectedCell).cIdx]?.octave === 'lower') ? 'border-gold-500 bg-gold-950 text-gold-400' : 'border-tambura-800'}`}
                >
                  Mandra (Low) ●
                </button>
              </div>
            </div>

            <div className="pt-2 border-t border-tambura-800">
              <span className="text-[10px] text-tambura-500 uppercase font-bold block mb-1">Gamakams / Sub-Swaras</span>
              <input 
                type="text" 
                placeholder="Type running sub-swarams..." 
                disabled={!selectedCell && !lastTypedCell} 
                value={(lastTypedCell || selectedCell) && avartanams[(lastTypedCell || selectedCell).aIdx]?.beats[(lastTypedCell || selectedCell).bIdx]?.cells[(lastTypedCell || selectedCell).cIdx] ? avartanams[(lastTypedCell || selectedCell).aIdx].beats[(lastTypedCell || selectedCell).bIdx].cells[(lastTypedCell || selectedCell).cIdx].gamakam.subSwaras : ''}
                onChange={(e) => setGamakamOnSelected(true, e.target.value)} 
                className="w-full bg-tambura-900 border border-tambura-700 rounded p-1.5 text-xs text-tambura-200 outline-none focus:border-gold-500" 
              />
            </div>

            <div className="pt-2 border-t border-tambura-800">
              <span className="text-[10px] text-tambura-500 uppercase font-bold block mb-1.5">Quick Reminders</span>
              <ul className="text-[10px] text-tambura-500 leading-relaxed list-disc list-inside space-y-0.5">
                <li>Click a cell, then type S R G M P D N to enter a swaram</li>
                <li>Space jumps to the next syllable box in the lyrics row</li>
                <li>Paste a full line ("ni ni ri ga ma pa") to fill many boxes at once</li>
              </ul>
              <button
                onClick={() => setShowHelp(true)}
                className="mt-2.5 text-[10px] font-bold text-gold-400 hover:text-gold-300 transition-colors duration-150"
              >
                View full keyboard reference →
              </button>
            </div>
          </div>
        </div>
        </aside>

        {!sidebarOpen && (
          <button
            onClick={(e) => { e.stopPropagation(); setSidebarOpen(true); }}
            title="Show Sidebar"
            aria-label="Show Sidebar"
            className="shrink-0 self-start mt-4 w-5 h-12 flex items-center justify-center bg-tambura-950 border border-l-0 border-tambura-800 rounded-r-md text-tambura-500 hover:text-tambura-100 hover:bg-tambura-900 transition-colors duration-150 print:hidden"
          >
            <ChevronRightIcon className="w-3.5 h-3.5" />
          </button>
        )}

        {/* WORKSPACE PAPER CANVAS */}
        <main className="flex-1 bg-tambura-800 p-8 overflow-auto print:bg-white print:p-0 print:overflow-visible">
          
          <div className="relative flex flex-col items-center gap-8 mx-auto w-fit print:w-full print:mx-0 print:gap-0">
            {pageGroups.map((group, pageIdx) => {
            const isLastPage = pageIdx === pageGroups.length - 1;
            return (
            <React.Fragment key={pageIdx}>
            <div 
              id={pageIdx === 0 ? 'notation-paper' : undefined}
              className={`bg-white text-tambura-900 p-12 shadow-2xl rounded-sm flex flex-col items-stretch relative print:shadow-none ${
                paperSize === 'Letter' ? 'w-[8.5in]' : 'w-[210mm]'
              } ${
                // Every page except the last is locked to the exact
                // physical page height and clips anything past it — a hard
                // guarantee that a page can never visually stretch, no
                // matter what. The last page keeps a *min*-height instead
                // so the "append row" affordance below the content still
                // has room to sit under a short final page.
                isLastPage
                  ? (paperSize === 'Letter' ? 'min-h-[11in]' : 'min-h-[297mm]')
                  : (paperSize === 'Letter' ? 'h-[11in] overflow-hidden' : 'h-[297mm] overflow-hidden')
              } ${pageIdx > 0 ? 'print:break-before-page' : ''}`}
              onClick={() => { setSelectedCell(null); setLastTypedCell(null); setRowPaletteFor(null); }}
            >
              {/* DOCUMENT AUTO-ADAPTING HEADER — only on the first page, like a
                  real score sheet's title block; later pages are pure content. */}
              {pageIdx === 0 && (
              <div ref={setHeaderRef} className="w-full flex justify-between items-start mb-4 border-b border-tambura-400 pb-4 gap-4 text-xs h-auto shrink-0" onClick={(e) => e.stopPropagation()}>
                <div className="w-1/3 flex flex-col items-start">
                  <span className="text-[9px] font-mono text-tambura-400 uppercase tracking-wider block mb-1">Ragam</span>
                  <AutoResizeTextarea 
                    value={ragam} 
                    onChange={(e) => setRagam(e.target.value)} 
                    className="w-full font-bold text-tambura-800 bg-transparent focus:outline-none focus:bg-tambura-50 rounded p-0.5 leading-tight text-left transition-colors" 
                    style={{ fontFamily }}
                    placeholder="Enter Ragam..."
                  />
                  <p className="w-full font-bold text-tambura-800 leading-tight text-left mt-1" style={{ fontFamily }}>{talamConfig.name}</p>
                </div>
                <div className="w-1/3 flex flex-col items-center justify-start">
                  <AutoResizeTextarea 
                    value={title} 
                    onChange={(e) => setTitle(e.target.value)} 
                    className="w-full text-center font-bold tracking-wide bg-transparent focus:outline-none focus:bg-tambura-50 rounded p-0.5 leading-snug text-xl transition-colors" 
                    style={{ fontFamily }}
                    placeholder="Enter Title"
                  />
                </div>
                <div className="w-1/3 flex flex-col items-end">
                  <span className="text-[9px] font-mono text-tambura-400 uppercase tracking-wider block mb-1">Composer</span>
                  <AutoResizeTextarea 
                    value={composer} 
                    onChange={(e) => setComposer(e.target.value)} 
                    className="w-full text-right font-semibold text-tambura-800 bg-transparent focus:outline-none focus:bg-tambura-50 rounded p-0.5 leading-tight transition-colors" 
                    style={{ fontFamily }}
                    placeholder="Enter Composer..."
                  />
                </div>
              </div>
              )}

              {/* DISPLAY GRID AREA */}
              <div className="flex flex-col w-full items-start">
                {group.map((aIdx, groupPos) => {
                  const avartanam = avartanams[aIdx];
                  const isLastInGroup = groupPos === group.length - 1;
                  // Whether this row has any lyric text typed in anywhere
                  // across its visual lines — used to collapse the lyrics
                  // strip (and the row-to-row gap after it) when printing,
                  // since an empty strip of placeholder boxes is only useful
                  // while editing, not on the printed page.
                  const rowHasAnyLyrics = avartanam.type === 'notation' || !avartanam.type
                    ? (avartanam.lyricLines || []).some((arr) => (arr || []).some((w) => (w || '').trim() !== ''))
                    : true; // subheader/spacer rows don't carry lyrics at all — never collapse their spacing
                  // Subheader/spacer rows are exactly one thing top-to-bottom,
                  // so centering the dock on the whole row centers it on
                  // their content too. Notation rows are taller than what
                  // they visually read as "the row" — a first line of note
                  // boxes (NOTE_ROW_PX tall) with a lyrics strip, and
                  // possibly more lines, stacked underneath. The dock should
                  // stay level with that first line of boxes, not drift down
                  // to the midpoint of everything stacked below it.
                  const dockTop = (avartanam.type === 'subheader' || avartanam.type === 'spacer')
                    ? '50%'
                    : `${NOTE_ROW_PX / 2}px`;
                  return (
                  <div
                    key={avartanam.id}
                    className={`relative w-full group/row flex flex-col items-start animate-fade-in-up ${!rowHasAnyLyrics && !isLastInGroup ? 'print-collapse-row-gap' : ''}`}
                    style={{
                      marginBottom: isLastInGroup ? 0 : `${rowGap}px`,
                      // Consumed by the .print-collapse-row-gap rule in
                      // index.css — only takes effect under print media, and
                      // only on rows the class above was actually applied to.
                      '--print-row-gap-collapsed': `${Math.round(rowGap / 2)}px`,
                    }}
                  >
                    
                    {/* BUTTON FLOATER DOCK — anchored (via dockTop, see
                        above) to the vertical center of whichever content it
                        should read as "in line with": the full row for
                        subheader/spacer rows, or just the first note-grid
                        line for notation rows. The insert palette lives
                        inside this same wrapper, stacked below the dock in
                        normal flow, so the two always stay attached to each
                        other. */}
                    <div className="absolute right-[102%] -translate-y-1/2 z-20 flex flex-col items-end gap-1 print:hidden" style={{ top: dockTop }}>
                      <div className={`bg-tambura-950 border border-tambura-700 rounded-lg shadow-md transition-opacity duration-150 p-1 gap-1 flex items-center ${rowPaletteFor === aIdx ? 'opacity-100' : 'opacity-0 group-hover/row:opacity-100'}`} onClick={(e) => e.stopPropagation()}>
                        <button title="Insert notation row above" aria-label="Insert notation row above" onClick={(e) => { e.stopPropagation(); insertRowAt(aIdx, 'above'); }} className="text-xs font-mono font-bold w-7 h-7 text-tambura-300 hover:bg-gold-600 hover:text-white rounded-md flex items-center justify-center">+↑</button>
                        <button title="Insert notation row below" aria-label="Insert notation row below" onClick={(e) => { e.stopPropagation(); insertRowAt(aIdx, 'below'); }} className="text-xs font-mono font-bold w-7 h-7 text-tambura-300 hover:bg-gold-600 hover:text-white rounded-md flex items-center justify-center">+↓</button>
                        <div className="w-[1px] h-4 bg-tambura-700 mx-0.5" />
                        <button
                          title="Insert subheader or spacer…"
                          aria-label="Insert subheader or spacer"
                          onClick={(e) => { e.stopPropagation(); setRowPaletteFor(rowPaletteFor === aIdx ? null : aIdx); }}
                          className={`text-xs font-bold w-7 h-7 rounded-md flex items-center justify-center ${rowPaletteFor === aIdx ? 'bg-gold-600 text-white' : 'text-tambura-300 hover:bg-gold-600 hover:text-white'}`}
                        >
                          ▾
                        </button>
                        <div className="w-[1px] h-4 bg-tambura-700 mx-0.5" />
                        <button title="Delete row" aria-label="Delete row" onClick={(e) => { e.stopPropagation(); deleteRowAt(aIdx); }} className="text-sm font-bold w-7 h-7 text-rose-400 hover:bg-rose-600 hover:text-white rounded-md flex items-center justify-center">×</button>
                      </div>

                      {/* ROW-TYPE INSERT PALETTE — offers subheaders/spacers,
                          which are common enough to insert but too situational
                          to earn their own always-visible buttons. */}
                      {rowPaletteFor === aIdx && (
                        <div
                          className="bg-tambura-950 border border-tambura-700 rounded-lg shadow-md flex flex-col p-1 w-40 gap-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <span className="text-[9px] font-mono uppercase tracking-wider text-tambura-500 px-2 pt-1 pb-0.5">Insert above</span>
                          <button onClick={() => { insertRowAt(aIdx, 'above', 'subheader'); setRowPaletteFor(null); }} className="text-left text-xs font-semibold px-2 py-1.5 rounded text-tambura-200 hover:bg-gold-600 hover:text-white">Subheader</button>
                          <button onClick={() => { insertRowAt(aIdx, 'above', 'spacer'); setRowPaletteFor(null); }} className="text-left text-xs font-semibold px-2 py-1.5 rounded text-tambura-200 hover:bg-gold-600 hover:text-white">Spacer</button>
                          <div className="h-[1px] bg-tambura-700 my-0.5" />
                          <span className="text-[9px] font-mono uppercase tracking-wider text-tambura-500 px-2 pb-0.5">Insert below</span>
                          <button onClick={() => { insertRowAt(aIdx, 'below', 'subheader'); setRowPaletteFor(null); }} className="text-left text-xs font-semibold px-2 py-1.5 rounded text-tambura-200 hover:bg-gold-600 hover:text-white">Subheader</button>
                          <button onClick={() => { insertRowAt(aIdx, 'below', 'spacer'); setRowPaletteFor(null); }} className="text-left text-xs font-semibold px-2 py-1.5 rounded text-tambura-200 hover:bg-gold-600 hover:text-white">Spacer</button>
                        </div>
                      )}
                    </div>

                    {avartanam.type === 'subheader' ? (
                      /* SUBHEADER ROW — a plain, customizable, left-aligned
                         section label. */
                      <div className="w-full flex items-center" style={{ height: `${SUBHEADER_ROW_PX}px` }} onClick={(e) => e.stopPropagation()}>
                        <input
                          type="text"
                          value={avartanam.text || ''}
                          onChange={(e) => updateSpecialRow(aIdx, { text: e.target.value })}
                          placeholder="Section title…"
                          style={{ fontFamily }}
                          className="w-full text-left font-bold tracking-wide text-tambura-700 bg-transparent focus:outline-none focus:bg-tambura-50 rounded px-2 py-0.5 text-sm placeholder-tambura-300"
                        />
                      </div>
                    ) : avartanam.type === 'spacer' ? (
                      /* SPACER ROW — a blank vertical gap; height is
                         adjustable via the hover-revealed stepper. */
                      <div
                        className="relative w-full group/spacer"
                        style={{ height: `${avartanam.height ?? SPACER_DEFAULT_PX}px` }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        <div className="absolute inset-0 flex items-center justify-center gap-2 print:hidden opacity-0 group-hover/spacer:opacity-100 transition-opacity duration-150">
                          <div className="flex-1 border-t border-dashed border-tambura-200" />
                          <button
                            title="Shrink spacer"
                            aria-label="Shrink spacer"
                            onClick={() => updateSpecialRow(aIdx, { height: clampSpacerHeight((avartanam.height ?? SPACER_DEFAULT_PX) - SPACER_STEP_PX) })}
                            className="text-[11px] font-bold w-5 h-5 shrink-0 text-tambura-400 hover:bg-gold-600 hover:text-white rounded flex items-center justify-center border border-tambura-200"
                          >
                            −
                          </button>
                          <span className="text-[10px] font-mono text-tambura-400 select-none shrink-0">{avartanam.height ?? SPACER_DEFAULT_PX}px spacer</span>
                          <button
                            title="Grow spacer"
                            aria-label="Grow spacer"
                            onClick={() => updateSpecialRow(aIdx, { height: clampSpacerHeight((avartanam.height ?? SPACER_DEFAULT_PX) + SPACER_STEP_PX) })}
                            className="text-[11px] font-bold w-5 h-5 shrink-0 text-tambura-400 hover:bg-gold-600 hover:text-white rounded flex items-center justify-center border border-tambura-200"
                          >
                            +
                          </button>
                          <div className="flex-1 border-t border-dashed border-tambura-200" />
                        </div>
                      </div>
                    ) : (
                    /* SCORE BLOCKS LAYER SYSTEMS */
                    <div className="flex flex-col w-full items-start" style={{ gap: `${rowGap / 2}px` }}>
                      {getVisualLines(avartanam).map((line) => {
                        let totalCellCounter = 0;
                        // line.lineId (e.g. "full", "part-1") repeats across every
                        // row, so on its own it's not unique enough for DOM ids /
                        // getElementById lookups — scope it to this row's UUID.
                        const rowLineId = `${avartanam.id}-${line.lineId}`;
                        // Whether THIS visual line specifically has any lyric
                        // text — a multi-line row could have lyrics under one
                        // line and not another, so this is checked per line
                        // rather than reusing the whole-row flag above.
                        const lineHasLyrics = (line.lyricArray || []).some((w) => (w || '').trim() !== '');

                        return (
                          <div key={line.lineId} className={`flex flex-col w-full items-stretch ${lineHasLyrics ? 'pb-2' : 'pb-2 print-collapse-pad'}`}>
                            
                            {/* NOTE GRID BLOCK */}
                            <div className="flex items-start justify-between w-full bg-white">
                              <div className="flex items-center font-mono font-black text-tambura-900 select-none text-sm pr-1 self-center" style={{ marginRight: `${cellGap}px` }}>||</div>
                              
                              <div className="flex flex-1 items-start justify-between min-w-0">
                                {line.beats.map((beat) => {
                                  const isAngaEnd = talamConfig.angaDividers.includes(beat.beatNumber);
                                  const isLineEnd = beat.beatNumber === line.beats[line.beats.length - 1]?.beatNumber;

                                  return (
                                    <React.Fragment key={beat.beatNumber}>
                                      <div className="flex flex-1 flex-grow-[2] justify-between min-w-0">
                                        {beat.cells.map((cell, cIdx) => {
                                          const realBeatIdx = beat.beatNumber - 1;
                                          const isHighlighted = lastTypedCell 
                                            ? (lastTypedCell.aIdx === aIdx && lastTypedCell.bIdx === realBeatIdx && lastTypedCell.cIdx === cIdx)
                                            : (selectedCell?.aIdx === aIdx && selectedCell?.bIdx === realBeatIdx && selectedCell?.cIdx === cIdx);

                                          return (
                                            <div key={cIdx} className="flex-1 min-w-0" style={{ paddingLeft: `${cellGap / 2}px`, paddingRight: `${cellGap / 2}px` }}>
                                              <NotationCell 
                                                cell={cell} 
                                                size={fontSize}
                                                isSelected={isHighlighted}
                                                onFocus={() => {
                                                  setSelectedCell({ aIdx, bIdx: realBeatIdx, cIdx });
                                                  setLastTypedCell(null); 
                                                }}
                                                onChange={(updatedCell) => {
                                                  const updatedAvartanams = [...avartanams];
                                                  updatedAvartanams[aIdx].beats[realBeatIdx].cells[cIdx] = updatedCell;
                                                  setAvartanams(updatedAvartanams);
                                                }}
                                              />
                                            </div>
                                          );
                                        })}
                                      </div>
                                      
                                      {isAngaEnd && !isLineEnd && (
                                        <div 
                                          className="flex items-center justify-center font-mono font-black text-tambura-900 select-none text-sm self-center"
                                          style={{ marginLeft: `${cellGap}px`, marginRight: `${cellGap}px` }}
                                        >
                                          |
                                        </div>
                                      )}
                                    </React.Fragment>
                                  );
                                })}
                              </div>
                              
                              <div className="flex items-center font-mono font-black text-tambura-900 select-none text-sm self-center" style={{ marginLeft: `${cellGap}px` }}>{line.label}</div>
                            </div>

                            {/* FLEX CONTENT-DRIVEN LYRICS STRIP — hidden on
                                print (see .print-collapse-lyrics in
                                index.css) when this line has no lyric text,
                                so the empty placeholder boxes and the space
                                they'd otherwise reserve don't show up on the
                                printed/exported page. */}
                            <div className={`flex items-start justify-between w-full mt-2 bg-transparent ${lineHasLyrics ? '' : 'print-collapse-lyrics'}`} onClick={(e) => e.stopPropagation()}>
                              <div className="flex items-center font-mono text-transparent opacity-0 select-none text-sm pr-1" style={{ marginRight: `${cellGap}px` }}>||</div>
                              
                              <div className="flex flex-1 items-start justify-between min-w-0">
                                {line.beats.map((beat) => {
                                  const isAngaEnd = talamConfig.angaDividers.includes(beat.beatNumber);
                                  const isLineEnd = beat.beatNumber === line.beats[line.beats.length - 1]?.beatNumber;

                                  return (
                                    <React.Fragment key={`lyric-beat-${beat.beatNumber}`}>
                                      <div className="flex flex-1 flex-grow-[2] justify-between min-w-0">
                                        {beat.cells.map((_, cIdx) => {
                                          const runningLyricIdx = totalCellCounter;
                                          totalCellCounter++; 
                                          
                                          const wordValue = line.lyricArray?.[runningLyricIdx] || '';

                                          return (
                                            <div 
                                              key={`lyric-cell-${cIdx}`} 
                                              className="relative flex-1 min-w-0" 
                                              style={{ 
                                                paddingLeft: `${cellGap / 2}px`, 
                                                paddingRight: `${cellGap / 2}px`,
                                                height: `${Math.max(9, fontSize - 2) + 10}px`
                                              }}
                                            >
                                              <input 
                                                id={`lyric-box-${rowLineId}-${runningLyricIdx}`}
                                                type="text"
                                                placeholder="..."
                                                value={wordValue}
                                                onKeyDown={(e) => handleLyricKeyDown(e, rowLineId, runningLyricIdx)}
                                                onChange={(e) => handleLyricChange(aIdx, line.lineIndex, runningLyricIdx, e.target.value)}
                                                onPaste={(e) => handleLyricPaste(e, aIdx, line.lineIndex, rowLineId, runningLyricIdx, line.lyricArray.length)}
                                                style={{ 
                                                  fontSize: `${Math.max(9, fontSize - 2)}px`,
                                                  fontFamily,
                                                  // Sized to its own content (in ch units) rather than forced
                                                  // to fill/exceed the column. Anchored at the column's
                                                  // horizontal center and pulled back by half its own width,
                                                  // so a short entry (like a single "-") sits dead-center
                                                  // under its note, and a longer syllable grows evenly
                                                  // outward from that center point instead of just rightward.
                                                  width: `${Math.max(3, wordValue.length + 1)}ch`,
                                                  left: '50%',
                                                  transform: 'translateX(-50%)'
                                                }}
                                                className="absolute top-0 whitespace-nowrap text-center font-serif text-tambura-500 italic bg-transparent border-b border-tambura-100 focus:border-gold-400 focus:text-tambura-900 focus:outline-none py-0.5 placeholder-tambura-200"
                                              />
                                            </div>
                                          );
                                        })}
                                      </div>
                                      {isAngaEnd && !isLineEnd && <div className="flex items-center justify-center font-mono text-transparent opacity-0 select-none text-sm" style={{ marginLeft: `${cellGap}px`, marginRight: `${cellGap}px` }}>|</div>}
                                    </React.Fragment>
                                  );
                                })}
                              </div>
                              <div className="flex items-center font-mono text-transparent opacity-0 select-none text-sm pl-1" style={{ marginLeft: `${cellGap}px` }}>{line.label}</div>
                            </div>

                          </div>
                        );
                      })}
                    </div>
                    )}

                  </div>
                  );
                })}
              </div>

              {/* BOTTOM APPEND BAR — only after the very last row on the very
                  last page, so it never shows up mid-document. */}
              {isLastPage && (
                <div className="mt-12 flex justify-center items-center gap-2 print:hidden border-t border-dashed border-tambura-200 pt-6">
                  <button onClick={() => appendNewRow('notation')} className="bg-tambura-100 hover:bg-gold-50 border border-tambura-300 hover:border-gold-300 text-tambura-700 hover:text-gold-600 font-bold text-xs py-2 px-8 rounded-md shadow-sm active:scale-95 transition-all duration-150">
                    + Append Row
                  </button>
                  <button onClick={() => appendNewRow('subheader')} title="Append a subheader" className="bg-tambura-100 hover:bg-gold-50 border border-tambura-300 hover:border-gold-300 text-tambura-700 hover:text-gold-600 font-bold text-xs py-2 px-5 rounded-md shadow-sm active:scale-95 transition-all duration-150">
                    + Subheader
                  </button>
                  <button onClick={() => appendNewRow('spacer')} title="Append a spacer" className="bg-tambura-100 hover:bg-gold-50 border border-tambura-300 hover:border-gold-300 text-tambura-700 hover:text-gold-600 font-bold text-xs py-2 px-5 rounded-md shadow-sm active:scale-95 transition-all duration-150">
                    + Spacer
                  </button>
                </div>
              )}

            </div>

            {/* Page number, sitting on the gray canvas below the sheet itself
                — like the page separator strip in Google Docs — so it never
                eats into the printable page's own content area. */}
            {pageGroups.length > 1 && (
              <div className="text-[11px] font-mono text-tambura-400 select-none print:hidden -mt-4">
                Page {pageIdx + 1} of {pageGroups.length}
              </div>
            )}
            </React.Fragment>
            );
            })}
          </div>
        </main>
      </div>

      {showHelp && <KeyboardHelp onClose={() => setShowHelp(false)} />}

      {showExitConfirm && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-tambura-950/70 backdrop-blur-sm animate-fade-in"
          onClick={() => setShowExitConfirm(false)}
        >
          <div
            className="bg-tambura-950 border border-tambura-800 rounded-lg shadow-2xl w-full max-w-sm p-6 animate-pop-in"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-serif font-black text-tambura-100 mb-2">Save before leaving?</h2>
            <p className="text-xs text-tambura-400 mb-6 leading-relaxed">
              "{title || 'Untitled Notation'}" hasn't been saved yet. You can save it now, discard it, or go back and keep editing.
            </p>
            <div className="flex flex-col-reverse sm:flex-row sm:justify-end gap-2">
              <button
                onClick={() => setShowExitConfirm(false)}
                className="px-4 py-2 text-xs font-semibold text-tambura-400 hover:text-tambura-100 active:scale-95 transition-all duration-150 rounded-md"
              >
                Keep Editing
              </button>
              <button
                onClick={handleDiscardAndExit}
                className="px-4 py-2 text-xs font-semibold text-rose-400 hover:text-white hover:bg-rose-600 active:scale-95 rounded-md transition-all duration-150"
              >
                Discard
              </button>
              <button
                onClick={handleSaveAndExit}
                className="px-5 py-2 text-xs font-semibold bg-gold-600 hover:bg-gold-500 active:scale-95 text-white rounded-md shadow transition-all duration-150"
              >
                Save & Leave
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export default Editor;