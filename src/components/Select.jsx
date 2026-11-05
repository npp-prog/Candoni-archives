import { Children, isValidElement, useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';

// Every dropdown in DMS. Used like <select> (value, onChange(e) with e.target.value, <option>
// children). With more than 5 choices it is searchable: a list that opens with a search box.
// With 5 or fewer it stays a plain <select>.
export const SEARCH_FROM = 6;

function optionsOf(children) {
  const out = [];
  const walk = (nodes) => Children.forEach(nodes, (c) => {
    if (!isValidElement(c)) return;
    if (c.type === 'option') {
      const label = Children.toArray(c.props.children).join('');
      out.push({ value: String(c.props.value ?? label), label, disabled: Boolean(c.props.disabled) });
    } else if (c.props?.children) walk(c.props.children);
  });
  walk(children);
  return out;
}

export default function Select({ value, onChange, children, disabled, id, className = '', 'aria-label': ariaLabel, placeholder, ...rest }) {
  const options = useMemo(() => optionsOf(children), [children]);
  if (options.length < SEARCH_FROM) {
    return <select id={id} value={value} onChange={onChange} disabled={disabled} className={className} aria-label={ariaLabel} {...rest}>{children}</select>;
  }
  return <SearchSelect {...{ value, onChange, options, disabled, id, className, ariaLabel, placeholder }} />;
}

function SearchSelect({ value, onChange, options, disabled, id, className, ariaLabel, placeholder }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const [hi, setHi] = useState(0);
  const box = useRef(null);
  const search = useRef(null);
  const list = useRef(null);
  const pop = useRef(null);
  const listId = useId();
  // The list floats above the page (in document.body), so a table or card never cuts it off:
  // under the box, or above it when there is no room below.
  const [place, setPlace] = useState(null);
  useLayoutEffect(() => {
    if (!open) { setPlace(null); return undefined; }
    const at = () => {
      const r = box.current?.getBoundingClientRect();
      if (!r) return;
      const below = window.innerHeight - r.bottom;
      const up = below < 300 && r.top > below;
      const width = Math.min(Math.max(r.width, 260), 480, window.innerWidth - 16);
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      setPlace({ left, width, ...(up ? { bottom: window.innerHeight - r.top + 4 } : { top: r.bottom + 4 }), maxList: Math.max(140, (up ? r.top : below) - 80) });
    };
    at();
    window.addEventListener('scroll', at, true);
    window.addEventListener('resize', at);
    return () => { window.removeEventListener('scroll', at, true); window.removeEventListener('resize', at); };
  }, [open]);
  const current = options.find((o) => o.value === String(value ?? ''));
  const words = q.toLowerCase().split(/\s+/).filter(Boolean);
  const shown = options.filter((o) => words.every((w) => o.label.toLowerCase().includes(w)));

  useEffect(() => {
    if (!open) return undefined;
    setHi(Math.max(0, shown.findIndex((o) => o.value === current?.value)));
    search.current?.focus();
    const away = (e) => { if (!box.current?.contains(e.target) && !pop.current?.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', away);
    document.addEventListener('touchstart', away);
    return () => { document.removeEventListener('mousedown', away); document.removeEventListener('touchstart', away); };
  }, [open]);
  useEffect(() => { setHi(0); }, [q]);
  useEffect(() => { list.current?.children[hi]?.scrollIntoView({ block: 'nearest' }); }, [hi, open]);

  const pick = (o) => {
    if (!o || o.disabled) return;
    setOpen(false); setQ('');
    if (o.value !== String(value ?? '')) onChange?.({ target: { value: o.value }, currentTarget: { value: o.value } });
    box.current?.querySelector('.ss-trigger')?.focus();
  };
  const keys = (e) => {
    if (e.key === 'ArrowDown') { e.preventDefault(); setHi((h) => Math.min(shown.length - 1, h + 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setHi((h) => Math.max(0, h - 1)); }
    else if (e.key === 'Enter') { e.preventDefault(); pick(shown[hi]); }
    else if (e.key === 'Escape') { e.preventDefault(); setOpen(false); setQ(''); box.current?.querySelector('.ss-trigger')?.focus(); }
    else if (e.key === 'Tab') setOpen(false);
  };

  return (
    <div className={`ss ${className}${open ? ' open' : ''}`} ref={box}>
      <button type="button" id={id} className="ss-trigger" disabled={disabled} aria-label={ariaLabel}
        aria-haspopup="listbox" aria-expanded={open} onClick={() => setOpen(!open)}
        onKeyDown={(e) => { if (!open && (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); setOpen(true); } }}>
        <span className={current ? '' : 'muted'}>{current?.label || placeholder || '—'}</span>
      </button>
      {open && place && createPortal(
        <div className="ss-pop" ref={pop} style={{ left: place.left, width: place.width, top: place.top, bottom: place.bottom }}>
          <input ref={search} className="ss-search" type="search" value={q} placeholder="Search…" aria-label="Search the choices"
            aria-controls={listId} aria-activedescendant={shown[hi] ? `${listId}-${hi}` : undefined}
            onChange={(e) => setQ(e.target.value)} onKeyDown={keys} />
          <ul className="ss-list" role="listbox" id={listId} ref={list} style={{ maxHeight: Math.min(280, place.maxList) }}>
            {shown.length === 0 && <li className="ss-none">No match</li>}
            {shown.map((o, i) => (
              <li key={`${o.value}|${i}`} id={`${listId}-${i}`} role="option" aria-selected={o.value === current?.value}
                className={`${i === hi ? 'hi' : ''}${o.value === current?.value ? ' on' : ''}${o.disabled ? ' off' : ''}`}
                onMouseEnter={() => setHi(i)} onMouseDown={(e) => e.preventDefault()} onClick={() => pick(o)}>{o.label}</li>
            ))}
          </ul>
        </div>,
        document.body,
      )}
    </div>
  );
}
