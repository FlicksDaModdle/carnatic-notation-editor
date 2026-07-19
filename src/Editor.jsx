// src/Editor.jsx
import React, { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { getTalamConfig, createBlankBeat, computeLineGroups, migrateRowLyrics } from './talamTemplates';
import NotationCell from './NotationCell';
import MenuBar from './MenuBar';
import KeyboardHelp from './KeyboardHelp';
import { getNotation, saveNotation, createBlankNotation } from './storage';
import { UndoIcon, RedoIcon, SaveIcon, SidebarIcon, HelpIcon, PrinterIcon, ChevronLeftIcon, ChevronRightIcon, HomeIcon } from './icons';
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
    beats: Array.from({ length: talamConfig.totalBeats }, (_, i) =>
      createBlankBeat(i + 1, currentSubdivisions)
    ),
    lyricLines: lineGroups.map((g) => Array((g.end - g.start + 1) * currentSubdivisions).fill('')),
  });

  const [avartanams, setAvartanams] = useState(() =>
    (initialNotation.avartanams || []).map((row) => ({
      ...row,
      lyricLines: migrateRowLyrics(row, lineGroups, currentSubdivisions),
    }))
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
  const fontFamily = FONT_OPTIONS[docFont]?.family || FONT_OPTIONS.serif.family;

  // --- MULTI-PAGE PAGINATION (Google-Docs-style) ---
  // Every avartanam row renders with the same number of visual lines and the
  // same note/lyric cell sizing, so all rows come out the same height — that
  // means one measured sample row (plus one measured header) is enough to
  // know how many rows fit on a page. Measured with ResizeObserver (via
  // callback refs) rather than a one-shot effect, so it keeps itself correct
  // even if something shifts the row's real height after the fact — a late
  // web font swap, a browser zoom change, etc. — instead of latching onto
  // whatever the first measurement happened to be.
  const [measuredRowHeight, setMeasuredRowHeight] = useState(0);
  const [measuredHeaderHeight, setMeasuredHeaderHeight] = useState(0);
  const [measuredPagePadding, setMeasuredPagePadding] = useState(96);

  const rowObserverRef = useRef(null);
  const setRowRef = useCallback((node) => {
    if (rowObserverRef.current) {
      rowObserverRef.current.disconnect();
      rowObserverRef.current = null;
    }
    if (node) {
      const measure = () => {
        const h = node.getBoundingClientRect().height;
        if (h > 0) setMeasuredRowHeight(h);
      };
      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(node);
      rowObserverRef.current = ro;
    }
  }, []);

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

  // Page padding (from the p-12 class) only changes if the page's own CSS
  // changes, never from row content — a single read on mount/attach is
  // enough, no observer needed.
  const setPageRef = useCallback((node) => {
    if (!node) return;
    const style = getComputedStyle(node);
    const padding = (parseFloat(style.paddingTop) || 0) + (parseFloat(style.paddingBottom) || 0);
    if (padding > 0) setMeasuredPagePadding(padding);
  }, []);

  // Groups of absolute avartanam indices, one group per visible page. Page 1
  // has less room (the ragam/title/composer header eats into it), every
  // page after that gets the full page height.
  const pageGroups = useMemo(() => {
    const total = avartanams.length;
    if (total === 0) return [[]];

    const pageHeightPx = PAGE_HEIGHT_PX[paperSize] || PAGE_HEIGHT_PX.A4;
    // Conservative fallbacks (biased toward splitting sooner rather than
    // later) for the brief window before the ResizeObserver reports real
    // numbers, so a first paint never crams everything onto one page.
    const rowH = measuredRowHeight || 100;
    const headerH = measuredHeaderHeight || 110;
    const padding = measuredPagePadding || 96;
    const footerReserve = 8;

    const firstPageAvail = pageHeightPx - padding - headerH - footerReserve;
    const otherPageAvail = pageHeightPx - padding - footerReserve;

    const capacityFor = (available) => {
      // n rows need n*rowH + (n-1)*rowGap of space.
      return Math.max(1, Math.floor((available + rowGap) / (rowH + rowGap)));
    };

    const groups = [];
    let idx = 0;
    let isFirstPage = true;
    while (idx < total) {
      const capacity = capacityFor(isFirstPage ? firstPageAvail : otherPageAvail);
      const end = Math.min(total, idx + capacity);
      groups.push(Array.from({ length: end - idx }, (_, k) => idx + k));
      idx = end;
      isFirstPage = false;
    }
    return groups.length ? groups : [[]];
  }, [avartanams.length, measuredRowHeight, measuredHeaderHeight, measuredPagePadding, paperSize, rowGap]);

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
    } else if (aIdx < avartanams.length - 1) {
      setSelectedCell({ aIdx: aIdx + 1, bIdx: 0, cIdx: 0 });
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
      const prevAvartanam = avartanams[aIdx - 1];
      if (prevAvartanam) {
        const lastBeatIdx = prevAvartanam.beats.length - 1;
        const lastBeat = prevAvartanam.beats[lastBeatIdx];
        if (lastBeat) {
          return { aIdx: aIdx - 1, bIdx: lastBeatIdx, cIdx: lastBeat.cells.length - 1 };
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
        const targetAIdx = e.key === 'ArrowUp' ? aIdx - 1 : aIdx + 1;
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
  const appendNewRow = () => {
    setAvartanams([...avartanams, buildBlankRow()]);
  };

  // Auto-append a new row when the user is on the last beat of the last row
  // and types Enter — this keeps the flow going without manual intervention.
  const ensureRowAfterCurrent = (currentAIdx) => {
    if (currentAIdx === avartanams.length - 1) {
      setAvartanams(prev => [...prev, buildBlankRow()]);
    }
  };

  const insertRowAt = (index, position = 'below') => {
    const updated = [...avartanams];
    const targetIndex = position === 'above' ? index : index + 1;
    updated.splice(targetIndex, 0, buildBlankRow());
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
        { label: 'Append Row', onClick: appendNewRow },
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
            {pageGroups.map((group, pageIdx) => (
            <React.Fragment key={pageIdx}>
            <div 
              id={pageIdx === 0 ? 'notation-paper' : undefined}
              ref={pageIdx === 0 ? setPageRef : undefined}
              className={`bg-white text-tambura-900 p-12 shadow-2xl rounded-sm flex flex-col items-stretch relative print:shadow-none print:p-0 print:w-full ${
                paperSize === 'Letter' ? 'w-[8.5in] min-h-[11in]' : 'w-[210mm] min-h-[297mm]'
              } ${pageIdx > 0 ? 'print:break-before-page' : ''}`}
              onClick={() => { setSelectedCell(null); setLastTypedCell(null); }}
            >
              {/* DOCUMENT AUTO-ADAPTING HEADER — only on the first page, like a
                  real score sheet's title block; later pages are pure content. */}
              {pageIdx === 0 && (
              <div ref={setHeaderRef} className="w-full flex justify-between items-start mb-8 border-b border-tambura-400 pb-4 gap-4 text-xs h-auto shrink-0" onClick={(e) => e.stopPropagation()}>
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

              {/* EMPTY STATE */}
              {pageIdx === 0 && avartanams.length === 0 && (
                <div className="flex flex-col items-center justify-center my-auto border-2 border-dashed border-tambura-200 p-12 rounded-lg text-center print:hidden">
                  <p className="text-tambura-400 italic text-sm mb-4">Your score sheet is empty.</p>
                  <button onClick={appendNewRow} className="bg-gold-600 hover:bg-gold-700 text-white font-semibold text-xs py-2 px-5 rounded-md shadow active:scale-95 transition-all duration-150">
                    Create First Line
                  </button>
                </div>
              )}

              {/* DISPLAY GRID AREA */}
              <div className="flex flex-col w-full items-start" style={{ gap: `${rowGap}px` }}>
                {group.map((aIdx) => {
                  const avartanam = avartanams[aIdx];
                  return (
                  <div key={avartanam.id} ref={aIdx === 0 ? setRowRef : undefined} className="relative w-full group/row flex flex-col items-start animate-fade-in-up">
                    
                    {/* BUTTON FLOATER DOCK */}
                    <div className="absolute right-[102%] top-2 bg-tambura-950 border border-tambura-700 rounded shadow-md opacity-0 group-hover/row:opacity-100 transition-opacity duration-150 print:hidden p-0.5 gap-0.5 z-20 flex items-center" onClick={(e) => e.stopPropagation()}>
                      <button title="Insert row above" aria-label="Insert row above" onClick={(e) => { e.stopPropagation(); insertRowAt(aIdx, 'above'); }} className="text-[10px] font-mono font-bold w-5 h-5 text-tambura-300 hover:bg-gold-600 hover:text-white rounded flex items-center justify-center">+↑</button>
                      <button title="Insert row below" aria-label="Insert row below" onClick={(e) => { e.stopPropagation(); insertRowAt(aIdx, 'below'); }} className="text-[10px] font-mono font-bold w-5 h-5 text-tambura-300 hover:bg-gold-600 hover:text-white rounded flex items-center justify-center">+↓</button>
                      <div className="w-[1px] h-3 bg-tambura-700 mx-0.5" />
                      <button title="Delete row" aria-label="Delete row" onClick={(e) => { e.stopPropagation(); deleteRowAt(aIdx); }} className="text-[10px] font-bold w-5 h-5 text-rose-400 hover:bg-rose-600 hover:text-white rounded flex items-center justify-center">×</button>
                    </div>

                    {/* SCORE BLOCKS LAYER SYSTEMS */}
                    <div className="flex flex-col w-full items-start" style={{ gap: `${rowGap / 2}px` }}>
                      {getVisualLines(avartanam).map((line) => {
                        let totalCellCounter = 0;
                        // line.lineId (e.g. "full", "part-1") repeats across every
                        // row, so on its own it's not unique enough for DOM ids /
                        // getElementById lookups — scope it to this row's UUID.
                        const rowLineId = `${avartanam.id}-${line.lineId}`;

                        return (
                          <div key={line.lineId} className="flex flex-col w-full items-stretch border-b border-tambura-100/70 pb-2 print:border-b-tambura-200">
                            
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

                            {/* FLEX CONTENT-DRIVEN LYRICS STRIP */}
                            <div className="flex items-start justify-between w-full mt-2 bg-transparent" onClick={(e) => e.stopPropagation()}>
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

                  </div>
                  );
                })}
              </div>

              {/* BOTTOM APPEND BAR — only after the very last row on the very
                  last page, so it never shows up mid-document. */}
              {pageIdx === pageGroups.length - 1 && avartanams.length > 0 && (
                <div className="mt-12 flex justify-center print:hidden border-t border-dashed border-tambura-200 pt-6">
                  <button onClick={appendNewRow} className="bg-tambura-100 hover:bg-gold-50 border border-tambura-300 hover:border-gold-300 text-tambura-700 hover:text-gold-600 font-bold text-xs py-2 px-8 rounded-md shadow-sm active:scale-95 transition-all duration-150">
                    + Append Row to Bottom
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
            ))}
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