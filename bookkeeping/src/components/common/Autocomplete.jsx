import React, { useState, useRef, useEffect } from 'react';

/**
 * Автодоповнення з пошуком по масиву.
 * props: value, onChange(value), options [{id,label,...}], placeholder,
 *        onSelect(option) — якщо треба отримати весь об'єкт
 */
const Autocomplete = ({ value, onChange, options = [], placeholder, onSelect }) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState(value || '');
  const ref = useRef(null);

  useEffect(() => { setQuery(value || ''); }, [value]);

  useEffect(() => {
    const handleClick = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, []);

  const filtered = options.filter(o =>
    o.label.toLowerCase().includes(query.toLowerCase())
  ).slice(0, 10);

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <input
        value={query}
        onChange={e => { setQuery(e.target.value); onChange(e.target.value); setOpen(true); }}
        onFocus={() => setOpen(true)}
        placeholder={placeholder}
      />
      {open && filtered.length > 0 && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: '#fff', border: '1.5px solid var(--border)', borderRadius: 'var(--radius)',
          boxShadow: '0 4px 16px rgba(0,0,0,.1)', zIndex: 200, maxHeight: 220, overflowY: 'auto',
        }}>
          {filtered.map(opt => (
            <div
              key={opt.id}
              style={{ padding: '8px 12px', cursor: 'pointer', fontSize: '.88rem', borderBottom: '1px solid var(--border-light)' }}
              onMouseEnter={e => e.currentTarget.style.background = 'var(--mint-50)'}
              onMouseLeave={e => e.currentTarget.style.background = ''}
              onClick={() => {
                setQuery(opt.label);
                onChange(opt.label);
                if (onSelect) onSelect(opt);
                setOpen(false);
              }}
            >
              <div style={{ fontWeight: 500 }}>{opt.label}</div>
              {opt.sub && <div style={{ color: 'var(--text-muted)', fontSize: '.78rem' }}>{opt.sub}</div>}
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default Autocomplete;
