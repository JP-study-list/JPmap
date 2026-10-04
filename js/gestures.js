// ══════════════════════════════════════
// gestures.js — 跟著手指的觸控手勢：卡片／彈窗往下拖關閉、側欄往左滑收起、看照片左右滑換張與往下拖關閉
// 放手時把手指速度交給彈簧（Apple 的 damping／response 參數），動畫中途可以再抓住。被 app.js 與 share.html 引用
// 只處理觸控（touch 事件），滑鼠操作不受影響。拖曳用 CSS `translate` 屬性，不會蓋掉元素原本的 transform
// ══════════════════════════════════════

const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)');
const HYSTERESIS = 10;  // px of movement before a direction is committed

// Spring with Apple's two parameters: damping ratio (1 = no overshoot) and response (seconds).
// Starts from the current value and velocity, so a re-grab or re-target never jumps. Returns stop().
// onUpdate may return false to end early (e.g. once something is fully off screen).
function animateSpring({ from, to, velocity = 0, damping = 1, response = 0.35, onUpdate, onDone }) {
  if (reduceMotion.matches) { onUpdate(to); if (onDone) onDone(); return () => {}; }
  const stiffness = (2 * Math.PI / response) ** 2;      // mass = 1
  const friction = 4 * Math.PI * damping / response;
  let x = from - to, v = velocity, last = performance.now(), raf = 0, done = false;
  const end = () => { done = true; if (onDone) onDone(); };
  const step = (now) => {
    const dt = Math.min((now - last) / 1000, 1 / 30);
    last = now;
    const n = Math.max(1, Math.ceil(dt * 240)), h = dt / n;  // small fixed sub-steps stay stable
    for (let i = 0; i < n; i++) { v += (-stiffness * x - friction * v) * h; x += v * h; }
    if (Math.abs(x) < 0.5 && Math.abs(v) < 10) { onUpdate(to); end(); return; }
    if (onUpdate(to + x) === false) { end(); return; }
    raf = requestAnimationFrame(step);
  };
  raf = requestAnimationFrame(step);
  return () => { if (!done) cancelAnimationFrame(raf); done = true; };
}

// Where a flick comes to rest (Apple's scroll-deceleration projection, rate per ms)
const project = (velocity, rate = 0.998) => (velocity / 1000) * rate / (1 - rate);

// Past a boundary the element follows less and less, instead of stopping dead
const rubberband = (over, size, c = 0.55) => (over * size * c) / (size + c * Math.abs(over));

// Recent finger positions → release velocity (px/s); a finger that stopped before lifting has none
function velocityTracker() {
  let pts = [];
  return {
    reset() { pts = []; },
    add(x, y) {
      const t = performance.now();
      pts.push({ x, y, t });
      while (pts.length > 2 && t - pts[0].t > 100) pts.shift();
    },
    get() {
      if (pts.length < 2 || performance.now() - pts[pts.length - 1].t > 80) return { x: 0, y: 0 };
      const a = pts[0], b = pts[pts.length - 1], dt = Math.max((b.t - a.t) / 1000, 0.001);
      return { x: (b.x - a.x) / dt, y: (b.y - a.y) / dt };
    },
  };
}

// One-finger drag on `targets`. Each handler gets the gesture `g` ({ dx, dy, target, x0, y0 }).
// - claim(g): while undecided, true holds the page still. iOS stops honouring preventDefault once a
//   scroll has started, so a gesture that is plausibly ours has to be held from its first move.
// - accept(g): after HYSTERESIS px, decides whether the gesture is ours; then onMove gets offsets
//   measured from that point, so nothing jumps by the threshold.
// - onIdle(): the touch ended without becoming our drag.
function trackTouch(targets, { onDown, claim, accept, onMove, onEnd, onIdle }) {
  let id = null, active = false, decided = false, g = null, sx = 0, sy = 0;
  const vt = velocityTracker();
  const down = (e) => {
    if (e.touches.length !== 1) { id = null; return; }
    const t = e.touches[0];
    id = t.identifier;
    g = { dx: 0, dy: 0, target: e.target, x0: t.clientX, y0: t.clientY };
    active = false; decided = false;
    vt.reset(); vt.add(t.clientX, t.clientY);
    if (onDown) onDown(g);
  };
  const move = (e) => {
    if (id === null) return;
    const t = [...e.changedTouches].find((x) => x.identifier === id);
    if (!t) return;
    vt.add(t.clientX, t.clientY);
    if (!decided) {
      g.dx = t.clientX - g.x0; g.dy = t.clientY - g.y0;
      const held = claim ? claim(g) : false;
      if (Math.hypot(g.dx, g.dy) < HYSTERESIS) { if (held && e.cancelable) e.preventDefault(); return; }
      decided = true;
      active = accept(g);
      if (!active) { id = null; if (onIdle) onIdle(); return; }
      sx = t.clientX; sy = t.clientY;
    }
    if (e.cancelable) e.preventDefault();
    onMove(t.clientX - sx, t.clientY - sy);
  };
  const up = () => {
    if (id === null) return;
    id = null;
    if (active) { const v = vt.get(); onEnd(v.x, v.y); } else if (onIdle) onIdle();
  };
  targets.forEach((el) => {
    el.addEventListener('touchstart', down, { passive: true });
    el.addEventListener('touchmove', move, { passive: false });
    el.addEventListener('touchend', up);
    el.addEventListener('touchcancel', up);
  });
}

// Hand the element back to CSS once a gesture's motion is over
function release(el) {
  el.style.translate = '';
  void el.offsetWidth;  // apply the reset before transitions come back
  el.style.transition = '';
  el.style.willChange = '';
}

// ── Sheet: drag down to dismiss (cards, modal sheets). Without onDismiss it only stretches and
// springs back — used for forms, so a half-filled form is never thrown away by a stray swipe.
// The top strip (grabber) and the title always drag; elsewhere the content scrolls until it is
// back at the top.
export function sheet(el, { onDismiss, backdrop, scroller = el } = {}) {
  if (!el) return;
  let y = 0, base = 0, stop = null, size = 1;
  const onHandle = (g) => (g.y0 - el.getBoundingClientRect().top) < 36 || !!(g.target.closest && g.target.closest('h3'));
  const setY = (v) => {
    y = v;
    el.style.translate = `0 ${v}px`;
    if (backdrop && onDismiss) backdrop.style.backgroundColor = `rgba(0, 0, 0, ${0.22 * Math.max(0, 1 - v / size)})`;
  };
  const finish = (dismissed) => {
    stop = null; y = 0;
    release(el);
    // After a dismiss, keep the backdrop clear until the overlay has faded out
    if (backdrop) setTimeout(() => { backdrop.style.backgroundColor = ''; }, dismissed ? 600 : 0);
  };
  const settle = (velocity) => {
    stop = animateSpring({ from: y, to: 0, velocity, damping: 0.8, response: 0.3, onUpdate: setY, onDone: () => finish(false) });
  };
  trackTouch([el], {
    onDown() {
      // Grabbing a sheet that is still springing back continues from where it is on screen
      if (stop) { stop(); stop = null; }
      base = y;
    },
    claim: (g) => base !== 0 || (g.dy > 0 && g.dy >= Math.abs(g.dx) && (scroller.scrollTop <= 0 || onHandle(g))),
    accept(g) {
      if (Math.abs(g.dy) <= Math.abs(g.dx)) return false;             // sideways: photo swipes etc.
      if (base === 0) {
        if (g.dy > 0 && scroller.scrollTop > 0 && !onHandle(g)) return false;  // scroll back up first
        if (g.dy < 0 && !onHandle(g)) return false;                    // upward swipes scroll the content
      }
      size = el.offsetHeight || 1;
      el.style.transition = 'none';
      el.style.willChange = 'translate';
      return true;
    },
    onMove(dx, dy) {
      let v = base + dy;
      if (v < 0 || !onDismiss) v = rubberband(v, size);
      setY(v);
    },
    onEnd(vx, vy) {
      const landing = y + project(vy);
      if (onDismiss && y > 0 && landing > size * 0.5 && vy > -100) {
        stop = animateSpring({
          from: y, to: size + 80, velocity: Math.max(vy, 600), response: 0.3,
          onUpdate: (v) => { setY(v); return v < size + 24; },
          onDone: () => { stop = null; onDismiss(); finish(true); },
        });
      } else {
        settle(vy);
      }
    },
    onIdle() { if (y !== 0 && !stop) settle(0); },
  });
}

// ── Drawer (phone sidebar): swipe left to close; the dimmed map follows the finger
export function drawer(el, { scrim, isOpen, onClose, ignore, enabled = () => true }) {
  if (!el) return;
  let x = 0, base = 0, stop = null, width = 1;
  const offscreen = () => -(width + 48);  // matches the collapsed transform in style.css
  const setX = (v) => {
    x = v;
    el.style.translate = `${v}px 0`;
    if (scrim) scrim.style.opacity = String(Math.max(0, Math.min(1, 1 + v / width)));
  };
  const finish = () => {
    stop = null; x = 0;
    release(el);
    if (scrim) { scrim.style.opacity = ''; scrim.style.transition = ''; }
  };
  const ours = (g) => enabled() && isOpen() && g.dx < 0 && Math.abs(g.dx) > Math.abs(g.dy) &&
    !(ignore && g.target.closest && g.target.closest(ignore));  // rows that scroll sideways keep their swipe
  trackTouch([el, scrim].filter(Boolean), {
    onDown() { if (stop) { stop(); stop = null; } base = x; },
    claim: ours,
    accept(g) {
      if (!ours(g)) return false;
      width = el.offsetWidth || 1;
      el.style.transition = 'none';
      el.style.willChange = 'translate';
      if (scrim) scrim.style.transition = 'none';
      return true;
    },
    onMove(dx) {
      let v = base + dx;
      if (v > 0) v = rubberband(v, width);
      setX(v);
    },
    onEnd(vx) {
      const landing = x + project(vx);
      if (landing < -width / 2 && vx < 100) {
        stop = animateSpring({
          from: x, to: offscreen(), velocity: Math.min(vx, -600), response: 0.3,
          onUpdate: (v) => { setX(v); return v > -width; },
          onDone: () => { el.style.translate = `${offscreen()}px 0`; onClose(); finish(); },
        });
      } else {
        stop = animateSpring({ from: x, to: 0, velocity: vx, damping: 0.8, response: 0.3, onUpdate: setX, onDone: finish });
      }
    },
  });
}

// ── Full-screen photo: swipe sideways for the next photo, drag down to close
export function photoViewer(box, img, { count, onStep, onClose }) {
  if (!box || !img) return;
  let axis = null, x = 0, y = 0, stops = [];
  const stopAll = () => { stops.forEach((s) => s()); stops = []; };
  const apply = () => {
    img.style.translate = `${x}px ${y}px`;
    if (axis === 'y') {
      const p = Math.max(0, Math.min(1, y / (box.clientHeight * 0.6)));
      img.style.scale = String(1 - p * 0.25);
      box.style.backgroundColor = `rgba(0, 0, 0, ${0.9 * (1 - p)})`;
    }
  };
  const finish = () => {
    stops = []; axis = null; x = 0; y = 0;
    img.style.scale = '';
    box.style.backgroundColor = '';
    release(img);
  };
  // Separate X and Y springs, so each axis keeps its own velocity
  const springTo = (tx, ty, vx, vy, done, opts = {}) => {
    stopAll();
    let left = 2;
    const end = () => { if (--left === 0) done(); };
    stops.push(animateSpring({ from: x, to: tx, velocity: vx, ...opts, onUpdate: (v) => { x = v; apply(); return !(opts.until && opts.until()); }, onDone: end }));
    stops.push(animateSpring({ from: y, to: ty, velocity: vy, ...opts, onUpdate: (v) => { y = v; apply(); }, onDone: end }));
  };
  const onButton = (g) => !!(g.target.closest && g.target.closest('button'));
  trackTouch([box], {
    onDown() { if (stops.length) stopAll(); },
    claim: (g) => !onButton(g),
    accept(g) {
      if (onButton(g)) return false;
      if (Math.abs(g.dx) > Math.abs(g.dy)) axis = count() > 1 ? 'x' : null;
      else axis = g.dy > 0 ? 'y' : null;
      if (!axis) return false;
      img.style.transition = 'none';
      img.style.willChange = 'translate';
      return true;
    },
    onMove(dx, dy) {
      if (axis === 'x') x = dx;
      else { x = dx; y = dy > 0 ? dy : rubberband(dy, box.clientHeight); }
      apply();
    },
    onEnd(vx, vy) {
      const w = box.clientWidth;
      if (axis === 'x') {
        const landing = x + project(vx);
        if (Math.abs(landing) > w * 0.25) {
          const dir = landing < 0 ? 1 : -1;
          // Out one side, swap the photo, in from the other side
          springTo(-dir * w, 0, vx, 0, () => {
            onStep(dir);
            x = dir * w; apply();
            springTo(0, 0, vx, 0, finish, { response: 0.35 });
          }, { response: 0.25, until: () => Math.abs(x) >= w });  // swap as soon as it is off screen
        } else {
          springTo(0, 0, vx, 0, finish, { damping: 0.8, response: 0.3 });
        }
      } else {
        const landing = y + project(vy);
        if (landing > box.clientHeight * 0.2 && vy > -100) {
          onClose();
          setTimeout(finish, 300);  // after the fade-out
        } else {
          springTo(0, 0, vx, vy, finish, { response: 0.3 });
        }
      }
    },
  });
}
