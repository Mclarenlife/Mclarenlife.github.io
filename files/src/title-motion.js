const clamp = (value, limit) => Math.max(-limit, Math.min(limit, value));

// A lightly damped spring: time-based, with small steps for consistent recoil
// on both high-refresh displays and frames delayed by other animations.
export function stepSpring(s, seconds) {
 const count = Math.max(1, Math.ceil(seconds / (1 / 120)));
 const dt = seconds / count;
 for (let i = 0; i < count; i++) {
  s.vx += ((s.tx - s.x) * 240 - s.vx * 13) * dt;
  s.vy += ((s.ty - s.y) * 240 - s.vy * 13) * dt;
  s.x += s.vx * dt;
  s.y += s.vy * dt;
 }
 return Math.abs(s.x - s.tx) + Math.abs(s.y - s.ty) + Math.abs(s.vx) + Math.abs(s.vy) > .08;
}

export function mountTitleMotion(title, preference) {
 if (!title) return () => {};
 const win = title.ownerDocument.defaultView;
 const letters = [...title.querySelectorAll('.curiosity-letter')].map(slot => ({
  slot, ink: slot.firstElementChild, x: 0, y: 0, vx: 0, vy: 0, tx: 0, ty: 0, caught: false
 }));
 let frame = 0, time = 0, previous = null, disposed = false;
 const paint = s => {
  const stretch = Math.min(.12, Math.hypot(s.x, s.y) * .004);
  s.ink.style.transform = `translate(${s.x.toFixed(3)}px,${s.y.toFixed(3)}px) rotate(${(s.x * .4).toFixed(3)}deg) scale(${1 - stretch * .45},${1 + stretch})`;
 };
 const tick = now => {
  frame = 0;
  const dt = time ? Math.min((now - time) / 1000, 1 / 30) : 1 / 60;
  time = now;
  let moving = false;
  for (const s of letters) {
   const active = stepSpring(s, dt);
   moving ||= active;
   if (!active) { s.x = s.tx; s.y = s.ty; s.vx = s.vy = 0; }
   if (!active && !s.tx && !s.ty) { s.ink.style.removeProperty('transform'); s.ink.style.removeProperty('will-change'); }
   else paint(s);
  }
  if (moving) frame = win.requestAnimationFrame(tick);
  else time = 0;
 };
 const wake = () => { if (!frame && !disposed) frame = win.requestAnimationFrame(tick); };
 const release = () => {
  previous = null;
  for (const s of letters) { s.tx = s.ty = 0; s.caught = false; }
  wake();
 };
 const reset = () => {
  win.cancelAnimationFrame(frame); frame = time = 0; previous = null;
  for (const s of letters) {
   s.x = s.y = s.vx = s.vy = s.tx = s.ty = 0; s.caught = false;
   s.ink.style.removeProperty('transform'); s.ink.style.removeProperty('will-change');
  }
 };
 const move = event => {
  if (preference.matches || event.pointerType === 'touch' || title.ownerDocument.body.classList.contains('folder-motion-running')) return;
  const point = {x: event.clientX, y: event.clientY};
  const dx = previous ? clamp(point.x - previous.x, 24) : 0;
  const dy = previous ? clamp(point.y - previous.y, 20) : 0;
  for (const s of letters) {
   // Measure the stationary slot, never the transformed glyph's moving hitbox.
   const r = s.slot.getBoundingClientRect(), cx = r.left + r.width / 2, cy = r.top + r.height / 2;
   const radius = Math.max(28, r.height * .62);
   let distance = Math.hypot(point.x - cx, (point.y - cy) * .7);
   // Sweep the pointer segment so a fast pass still catches intervening letters.
   if (previous) {
    const sx = point.x - previous.x, sy = point.y - previous.y;
    const t = Math.max(0, Math.min(1, ((cx - previous.x) * sx + (cy - previous.y) * sy) / (sx * sx + sy * sy || 1)));
    distance = Math.min(distance, Math.hypot(previous.x + sx * t - cx, (previous.y + sy * t - cy) * .7));
   }
   const weight = Math.max(0, 1 - distance / radius);
   if (weight) {
    s.tx = clamp((point.x - cx) * .35 + dx * .8, 19) * weight;
    s.ty = clamp((point.y - cy) * .3 + dy * .8 - 8, 23) * weight;
    if (!s.caught) { s.vx += clamp(dx * 12, 220) * weight; s.vy += (clamp(dy * 10, 180) - 110) * weight; }
    s.ink.style.willChange = 'transform';
   } else s.tx = s.ty = 0;
   s.caught = weight > 0;
  }
  previous = point;
  wake();
 };
 title.addEventListener('pointermove', move);
 title.addEventListener('pointerleave', release);
 title.addEventListener('pointercancel', release);
 win.addEventListener('blur', reset);
 win.addEventListener('resize', release);
 win.addEventListener('scroll', release, {passive: true});
 preference.addEventListener?.('change', reset);
 return () => {
  disposed = true; reset();
  title.removeEventListener('pointermove', move);
  title.removeEventListener('pointerleave', release);
  title.removeEventListener('pointercancel', release);
  win.removeEventListener('blur', reset);
  win.removeEventListener('resize', release);
  win.removeEventListener('scroll', release);
  preference.removeEventListener?.('change', reset);
 };
}
