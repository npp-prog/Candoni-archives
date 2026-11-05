import { useEffect, useRef } from 'react';

// Previous / next by where the document is clicked or tapped: its left half goes back, its right half
// forward, with ‹ › on the edges. A swipe on a tablet does the same, and so do the ← → keys (not while
// typing in a field). onPrev / onNext are null at the first / last document.
export default function SideNav({ onPrev, onNext, children }) {
  const touch = useRef(null);
  const swiped = useRef(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.altKey || e.ctrlKey || e.metaKey || e.target.closest?.('input, textarea, select, [contenteditable], .ss')) return;
      if (e.key === 'ArrowLeft' && onPrev) { e.preventDefault(); onPrev(); }
      if (e.key === 'ArrowRight' && onNext) { e.preventDefault(); onNext(); }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onPrev, onNext]);

  const onClick = (e) => {
    if (swiped.current) { swiped.current = false; return; }
    if (e.target.closest('a, button, input, textarea, iframe, .tabs')) return;
    const box = e.currentTarget.getBoundingClientRect();
    if (e.clientX - box.left < box.width / 2) onPrev?.(); else onNext?.();
  };
  const onTouchStart = (e) => { const t = e.touches[0]; touch.current = { x: t.clientX, y: t.clientY }; };
  const onTouchEnd = (e) => {
    const start = touch.current;
    touch.current = null;
    if (!start) return;
    const t = e.changedTouches[0];
    const dx = t.clientX - start.x;
    const dy = t.clientY - start.y;
    // a sideways swipe (not a scroll down the pages)
    if (Math.abs(dx) > 60 && Math.abs(dx) > 1.5 * Math.abs(dy)) {
      swiped.current = true;
      if (dx < 0) onNext?.(); else onPrev?.();
    }
  };

  return (
    <div className="side-nav" onClick={onClick} onTouchStart={onTouchStart} onTouchEnd={onTouchEnd}
      title="Click the right side for the next document, the left side for the previous one">
      {onPrev && <button type="button" className="side-arrow left" aria-label="Previous document" onClick={(e) => { e.stopPropagation(); onPrev(); }}>‹</button>}
      {children}
      {onNext && <button type="button" className="side-arrow right" aria-label="Next document" onClick={(e) => { e.stopPropagation(); onNext(); }}>›</button>}
    </div>
  );
}
