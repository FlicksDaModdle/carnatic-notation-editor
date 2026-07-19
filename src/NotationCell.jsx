// src/NotationCell.jsx
import React from 'react';

function NotationCell({ cell, isSelected, onFocus, size, aIdx, bIdx, cIdx }) {
  const microSize = Math.max(8, size - 4);

  if (!cell) return null;

  const handleActivate = (e) => {
    e.stopPropagation();
    onFocus(aIdx, bIdx, cIdx);
  };

  return (
    <div 
      role="button"
      tabIndex={0}
      aria-pressed={isSelected}
      aria-label={`Note cell, beat ${bIdx + 1}, position ${cIdx + 1}${cell.swaram ? `, swaram ${cell.swaram}` : ', empty'}`}
      onClick={handleActivate}
      onKeyDown={(e) => {
        // Only Space re-selects the cell here (for keyboard accessibility,
        // matching native button behavior). Enter is deliberately left
        // alone — it needs to bubble up to the editor's global keydown
        // handler, which uses it to start a new row when you're at the end
        // of the current one. Stopping it here would swallow that.
        if (e.key === ' ') {
          e.preventDefault();
          handleActivate(e);
        }
      }}
      className={`flex flex-col items-center justify-center border rounded transition-all duration-150 p-0.5 min-w-0 max-w-[75px] flex-1 basis-0 shrink h-[36px] select-none print:!border-transparent print:!bg-transparent print:!shadow-none print:!ring-0 ${
        isSelected 
          ? 'border-gold-600 bg-gold-50/20 shadow-sm ring-1 ring-gold-500' 
          : 'border-tambura-200 bg-transparent hover:border-tambura-300 print:border-transparent'
      }`}
    >
      <div className="h-3 w-full flex justify-center items-center overflow-hidden">
        {cell.gamakam?.hasGamakam && cell.gamakam?.subSwaras ? (
          <span 
            style={{ fontSize: `${microSize - 1}px` }} 
            className="font-mono font-bold text-tambura-600 uppercase tracking-tighter overline block text-center truncate leading-none"
          >
            {cell.gamakam.subSwaras}
          </span>
        ) : null}
      </div>

      <div className="h-1.5 min-h-0 overflow-hidden flex items-center justify-center text-[5px] text-tambura-900 font-bold leading-none">
        {cell.octave === 'higher' ? '●' : ''}
      </div>

      <div 
        style={{ fontSize: `${size}px` }} 
        className="w-full text-center font-mono font-black h-3.5 flex items-center justify-center text-tambura-800 leading-none uppercase"
      >
        {/* The "-" is an on-screen placeholder marking an empty beat while
            editing — not part of the actual notation, so it's left out of
            the printed/exported sheet. */}
        {cell.swaram || <span className="print:hidden">-</span>}
      </div>

      <div className="h-1.5 min-h-0 overflow-hidden flex items-center justify-center text-[5px] text-tambura-900 font-bold leading-none">
        {cell.octave === 'lower' ? '●' : ''}
      </div>
    </div>
  );
}

export default React.memo(NotationCell);