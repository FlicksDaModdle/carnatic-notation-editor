// src/Logo.jsx
// The mark is a single notation cell, in miniature: a swara letter ("S",
// for Sa) with the same raised dot the editor itself draws above a note
// to mark the higher octave (tara sthayi) — see NotationCell.jsx. Rather
// than an unrelated icon, the logo is a tiny sample of the app's own
// notation grammar.
function Logo({ size = 28, rounded = true, className = '' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="logo-bg" x1="0" y1="0" x2="48" y2="48" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#33281f" />
          <stop offset="1" stopColor="#170e0c" />
        </linearGradient>
        <linearGradient id="logo-gold" x1="8" y1="6" x2="40" y2="42" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#f0cf6b" />
          <stop offset="1" stopColor="#b8860b" />
        </linearGradient>
      </defs>
      {rounded && (
        <rect x="1.5" y="1.5" width="45" height="45" rx="9" fill="url(#logo-bg)" stroke="#63503f" strokeWidth="1" />
      )}
      <circle cx="24" cy="11" r="3" fill="url(#logo-gold)" />
      <text
        x="24"
        y="34.5"
        textAnchor="middle"
        fontFamily="Georgia, 'Noto Serif', serif"
        fontWeight="900"
        fontSize="26"
        fill="url(#logo-gold)"
      >
        S
      </text>
    </svg>
  );
}

export default Logo;
