// src/MenuBar.jsx
import { useEffect, useRef, useState } from 'react';

// A small native-app-style menu bar (File / Edit / Format / View...).
// `menus` is [{ label, items: [{ label, onClick, shortcut, checked, disabled, divider, submenu: [...] }] }]
function MenuBar({ menus }) {
  const [openMenu, setOpenMenu] = useState(null);
  const containerRef = useRef(null);

  useEffect(() => {
    if (!openMenu) return;
    const handleClickOutside = (e) => {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpenMenu(null);
      }
    };
    const handleEscape = (e) => {
      if (e.key === 'Escape') setOpenMenu(null);
    };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [openMenu]);

  return (
    <div ref={containerRef} className="flex items-center gap-0.5 text-xs select-none" onClick={(e) => e.stopPropagation()}>
      {menus.map((menu) => (
        <div key={menu.label} className="relative">
          <button
            onClick={() => setOpenMenu((cur) => (cur === menu.label ? null : menu.label))}
            onMouseEnter={() => setOpenMenu((cur) => (cur ? menu.label : cur))}
            className={`px-2.5 py-1 rounded font-semibold transition-colors duration-150 ${
              openMenu === menu.label ? 'bg-gold-600 text-white' : 'text-tambura-400 hover:bg-tambura-800 hover:text-tambura-100'
            }`}
          >
            {menu.label}
          </button>

          {openMenu === menu.label && (
            <div className="absolute left-0 top-full mt-1 min-w-[230px] bg-tambura-950 border border-tambura-800 rounded-md shadow-2xl py-1 z-50 animate-menu-in">
              {menu.items.map((item, i) =>
                item.divider ? (
                  <div key={i} className="my-1 border-t border-tambura-800" />
                ) : item.submenu ? (
                  <SubMenu key={i} item={item} closeAll={() => setOpenMenu(null)} />
                ) : (
                  <button
                    key={i}
                    disabled={item.disabled}
                    onClick={() => {
                      item.onClick?.();
                      setOpenMenu(null);
                    }}
                    className="w-full flex items-center justify-between gap-6 px-3 py-1.5 text-left text-tambura-200 hover:bg-gold-600 hover:text-white disabled:opacity-30 disabled:hover:bg-transparent disabled:hover:text-tambura-200 transition-colors duration-100"
                  >
                    <span className="flex items-center gap-2">
                      <span className="w-3 text-gold-400">{item.checked ? '✓' : ''}</span>
                      {item.label}
                    </span>
                    {item.shortcut && <span className="text-[10px] text-tambura-500 font-mono">{item.shortcut}</span>}
                  </button>
                )
              )}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

function SubMenu({ item, closeAll }) {
  const [hover, setHover] = useState(false);
  return (
    <div className="relative" onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
      <div className="w-full flex items-center justify-between gap-6 px-3 py-1.5 text-tambura-200 hover:bg-gold-600 hover:text-white cursor-default transition-colors duration-100">
        <span>{item.label}</span>
        <span className="text-tambura-500">›</span>
      </div>
      {hover && (
        <div className="absolute left-full top-0 -ml-1 min-w-[190px] bg-tambura-950 border border-tambura-800 rounded-md shadow-2xl py-1 animate-menu-in">
          {item.submenu.map((sub, i) => (
            <button
              key={i}
              onClick={() => {
                sub.onClick?.();
                closeAll();
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-left text-tambura-200 hover:bg-gold-600 hover:text-white transition-colors duration-100"
            >
              <span className="w-3 text-gold-400">{sub.checked ? '✓' : ''}</span>
              <span style={sub.style}>{sub.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export default MenuBar;
