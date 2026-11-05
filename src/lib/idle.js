// Signs out after a period without activity (mouse, keyboard, touch, scrolling) in any tab of the
// browser: a DMS left open on a shared computer does not stay open for the next person.
export const IDLE_MINUTES = 60;
const KEY = 'dms-last-active';
const EVENTS = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'wheel'];

const now = () => Date.now();
const read = () => { try { return Number(localStorage.getItem(KEY)) || now(); } catch { return now(); } };
const write = (t) => { try { localStorage.setItem(KEY, String(t)); } catch { /* this tab only */ } };

// Returns a function that stops watching.
export function watchIdle(onIdle, minutes = IDLE_MINUTES) {
  let last = now();
  write(last);
  let wrote = last;
  const seen = () => {
    last = now();
    if (last - wrote > 15e3) { write(last); wrote = last; } // not on every mouse move
  };
  EVENTS.forEach((e) => window.addEventListener(e, seen, { passive: true }));
  const timer = setInterval(() => {
    const t = Math.max(last, read()); // another tab may have been used
    if (now() - t > minutes * 60e3) { stop(); onIdle(); }
  }, 30e3);
  function stop() {
    clearInterval(timer);
    EVENTS.forEach((e) => window.removeEventListener(e, seen));
  }
  return stop;
}
