// src/icons.jsx
// A tiny hand-rolled icon set for the toolbar/menu bar — plain inline SVGs,
// no icon package dependency. Each icon accepts standard SVG props
// (className, style, etc.) so callers can size/color them via Tailwind.
import React from 'react';

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export const HomeIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M3 11l9-8 9 8" />
    <path d="M5 10v10h14V10" />
  </svg>
);

export const FileIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M6 2h9l5 5v15H6z" />
    <path d="M15 2v5h5" />
  </svg>
);

export const EditIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M12 20h9" />
    <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
  </svg>
);

export const FormatIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M4 7V4h16v3" />
    <path d="M9 20h6" />
    <path d="M12 4v16" />
  </svg>
);

export const ViewIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7Z" />
    <circle cx="12" cy="12" r="3" />
  </svg>
);

export const SaveIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z" />
    <path d="M17 21v-8H7v8" />
    <path d="M7 3v5h8" />
  </svg>
);

export const UndoIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M3 7v6h6" />
    <path d="M3 13a9 9 0 1 0 3-6.7L3 9" />
  </svg>
);

export const RedoIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M21 7v6h-6" />
    <path d="M21 13a9 9 0 1 1-3-6.7L21 9" />
  </svg>
);

export const RowsIcon = (props) => (
  <svg {...base} {...props}>
    <rect x="3" y="4" width="18" height="6" rx="1" />
    <rect x="3" y="14" width="18" height="6" rx="1" />
  </svg>
);

export const TrashIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M3 6h18" />
    <path d="M8 6V4h8v2" />
    <path d="M19 6l-1 14H6L5 6" />
  </svg>
);

export const CopyIcon = (props) => (
  <svg {...base} {...props}>
    <rect x="9" y="9" width="12" height="12" rx="2" />
    <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
  </svg>
);

export const DownloadIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M12 3v12" />
    <path d="M7 10l5 5 5-5" />
    <path d="M5 21h14" />
  </svg>
);

export const ChevronDownIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M6 9l6 6 6-6" />
  </svg>
);

export const SidebarIcon = (props) => (
  <svg {...base} {...props}>
    <rect x="3" y="4" width="18" height="16" rx="2" />
    <path d="M9 4v16" />
  </svg>
);

export const HelpIcon = (props) => (
  <svg {...base} {...props}>
    <circle cx="12" cy="12" r="9" />
    <path d="M9.5 9a2.5 2.5 0 0 1 4.9.8c0 1.7-2.4 2-2.4 3.4" />
    <path d="M12 17.2v.1" />
  </svg>
);

export const CloseIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M6 6l12 12" />
    <path d="M18 6L6 18" />
  </svg>
);

export const ChevronLeftIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M15 5l-7 7 7 7" />
  </svg>
);

export const ChevronRightIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M9 5l7 7-7 7" />
  </svg>
);

export const PrinterIcon = (props) => (
  <svg {...base} {...props}>
    <path d="M6 9V3h12v6" />
    <rect x="4" y="9" width="16" height="8" rx="1.5" />
    <path d="M6 17v4h12v-4" />
  </svg>
);
