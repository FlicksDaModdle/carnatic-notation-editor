// src/KeyboardHelp.jsx
// A single, well-organized reference for every keyboard interaction in the
// editor. Previously this knowledge was scattered (a few lines in the
// sidebar, shortcuts only visible inside menus) — this gives it one
// discoverable home, opened from the "?" button in the header.
import { CloseIcon } from './icons';

const Key = ({ children }) => (
  <kbd className="inline-flex items-center justify-center min-w-[22px] h-[22px] px-1.5 rounded border border-tambura-700 bg-tambura-900 text-tambura-200 text-[11px] font-mono font-bold shadow-sm">
    {children}
  </kbd>
);

const Row = ({ keys, children }) => (
  <div className="flex items-center justify-between gap-4 py-1.5">
    <span className="text-xs text-tambura-300">{children}</span>
    <span className="flex items-center gap-1 shrink-0">{keys}</span>
  </div>
);

function KeyboardHelp({ onClose }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-tambura-950/70 backdrop-blur-sm animate-fade-in"
      onClick={onClose}
    >
      <div
        className="bg-tambura-950 border border-tambura-800 rounded-lg shadow-2xl w-full max-w-lg max-h-[85vh] overflow-y-auto p-6 animate-pop-in"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between mb-5">
          <div>
            <h2 className="text-lg font-serif font-black text-tambura-100">Keyboard Reference</h2>
            <p className="text-xs text-tambura-400 mt-1">Everything you can do without reaching for the mouse.</p>
          </div>
          <button
            onClick={onClose}
            className="text-tambura-500 hover:text-tambura-100 hover:bg-tambura-800 rounded p-1 transition-colors duration-150"
            aria-label="Close"
          >
            <CloseIcon className="w-4 h-4" />
          </button>
        </div>

        <section className="mb-5">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-gold-400 mb-2">Entering Notes</h3>
          <div className="bg-tambura-900/60 border border-tambura-800 rounded-md px-3 divide-y divide-tambura-800/70">
            <Row keys={<>{['S', 'R', 'G', 'M', 'P', 'D', 'N'].map((k) => <Key key={k}>{k}</Key>)}</>}>
              Type a swaram into the selected cell
            </Row>
            <Row keys={<>{[',', '.', ';'].map((k) => <Key key={k}>{k}</Key>)}</>}>
              Rest / karvai marks
            </Row>
            <Row keys={<Key>Enter</Key>}>At the end of a row, starts a new row right after it</Row>
            <Row keys={<Key>⌫</Key>}>Clear the current note, or step back and clear the previous one</Row>
          </div>
        </section>

        <section className="mb-5">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-gold-400 mb-2">Moving Around</h3>
          <div className="bg-tambura-900/60 border border-tambura-800 rounded-md px-3 divide-y divide-tambura-800/70">
            <Row keys={<><Key>←</Key><Key>→</Key></>}>Move to the previous / next note</Row>
            <Row keys={<><Key>↑</Key><Key>↓</Key></>}>Move to the same position in the row above / below</Row>
          </div>
        </section>

        <section className="mb-5">
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-gold-400 mb-2">Lyrics</h3>
          <div className="bg-tambura-900/60 border border-tambura-800 rounded-md px-3 divide-y divide-tambura-800/70">
            <Row keys={<Key>Space</Key>}>Move to the next syllable box</Row>
            <Row keys={<><Key>←</Key><Key>→</Key></>}>Move between boxes (at the start/end of a box)</Row>
            <Row keys={<Key>⌫</Key>}>Step back a box when the current one is empty</Row>
            <Row keys={<span className="text-[11px] text-tambura-500 italic">Paste</span>}>
              Paste a whole line ("ni ni ri ga") to fill many boxes at once
            </Row>
          </div>
        </section>

        <section>
          <h3 className="text-[10px] font-bold uppercase tracking-wider text-gold-400 mb-2">Editing &amp; File</h3>
          <div className="bg-tambura-900/60 border border-tambura-800 rounded-md px-3 divide-y divide-tambura-800/70">
            <Row keys={<Key>⌘S</Key>}>Save</Row>
            <Row keys={<Key>⌘Z</Key>}>Undo</Row>
            <Row keys={<Key>⇧⌘Z</Key>}>Redo</Row>
            <Row keys={<Key>⌘P</Key>}>Print / export as PDF</Row>
            <Row keys={<Key>⌘N</Key>}>Start a new notation</Row>
          </div>
        </section>
      </div>
    </div>
  );
}

export default KeyboardHelp;
