// CSS fragmentation fills equal-height sheets without assuming chapter breaks.
// Keep one live content tree, so experiments, disclosures and links retain state.
export function mountPaperPages(paper, preference, announce) {
 if (!paper) return null;
 const doc = paper.ownerDocument, win = doc.defaultView;
 const folder = paper.closest('.open-folder');
 paper.classList.add('paged-dossier'); folder.classList.add('paged-folder');
 const stage = doc.createElement('div'); stage.className = 'paper-stage';
 const face = doc.createElement('div'); face.className = 'paper-face';
 const viewport = doc.createElement('div'); viewport.className = 'paper-viewport';
 const flow = doc.createElement('div'); flow.className = 'paper-flow';
 for (const node of [...paper.childNodes]) {
  if (node.nodeType === 1 && node.classList.contains('binding')) face.append(node);
  else flow.append(node);
 }
 const mast = doc.createElement('div'); mast.className = 'paper-running-head';
 mast.innerHTML = '<span>MCLARY / FIELD NOTES</span><span data-sheet-number>01</span>';
 const folio = doc.createElement('div'); folio.className = 'paper-folio';
 folio.innerHTML = '<span>FOLLOW YOUR CURIOSITY</span><span data-sheet-total>第 1 页</span>';
 viewport.append(flow); face.append(mast, viewport, folio); stage.append(face); paper.append(stage);
 const nav = doc.createElement('nav'); nav.className = 'paper-pagination'; nav.setAttribute('aria-label','档案翻页');
 nav.innerHTML = '<button type="button" data-page-prev aria-label="上一页">← <span>上一页</span></button><label>第 <select aria-label="选择页码"></select> / <span data-page-count>1</span> 页</label><button type="button" data-page-next aria-label="下一页"><span>下一页</span> →</button>';
 paper.after(nav);
 const previous = nav.querySelector('[data-page-prev]'), next = nav.querySelector('[data-page-next]');
 const select = nav.querySelector('select'), countText = nav.querySelector('[data-page-count]');
 let index = 0, total = 1, stride = 0, disposed = false, frame = 0;
 let animation = null, shadowAnimation = null, ghost = null, pending = null, serial = 0, layoutTarget = null;
 const clamp = value => Math.max(0, Math.min(total - 1, value));
 const paintFace = pageIndex => {
  flow.style.transform = `translateX(${-pageIndex * stride}px)`;
  mast.querySelector('[data-sheet-number]').textContent = String(pageIndex + 1).padStart(2,'0');
  folio.querySelector('[data-sheet-total]').textContent = `${pageIndex + 1} / ${total}`;
 };
 const update = () => {
  paintFace(index);
  paper.dataset.page = String(index + 1); paper.dataset.pages = String(total);
  previous.disabled = index === 0; next.disabled = index === total - 1;
  select.value = String(index); countText.textContent = String(total);
 };
 const cancel = () => {
  serial++; pending = null;
  animation?.cancel(); shadowAnimation?.cancel(); animation = shadowAnimation = null;
  ghost?.remove(); ghost = null; paper.classList.remove('paper-turning'); paintFace(index);
 };
 const makeGhost = () => {
  const copy = face.cloneNode(true);
  copy.classList.add('paper-turn-leaf'); copy.setAttribute('aria-hidden','true'); copy.setAttribute('inert','');
  // No duplicate identifiers or focusable controls in a visual-only turning leaf.
  for (const element of copy.querySelectorAll('[id]')) element.removeAttribute('id');
  for (const element of copy.querySelectorAll('button,input,select,textarea,a,summary')) element.setAttribute('tabindex','-1');
  const originals = face.querySelectorAll('input,select,textarea');
  copy.querySelectorAll('input,select,textarea').forEach((element,i)=>{ element.value = originals[i].value; if ('checked' in element) element.checked = originals[i].checked; });
  return copy;
 };
 const turn = async (requested, {animate = true, notify = true} = {}) => {
  if (disposed) return;
  const target = clamp(requested);
  if (animation) { pending = target; return; }
  if (target === index) return;
  const fromIndex = index, forward = target > index;
  const shouldAnimate = animate && !preference.matches && stride > 0 && !doc.body.classList.contains('folder-motion-running');
  if (shouldAnimate && forward) ghost = makeGhost();
  index = target; update();
  if (notify && announce) announce.textContent = `第 ${index + 1} 页，共 ${total} 页`;
  if (!shouldAnimate) return;
  if (!forward) { ghost = makeGhost(); paintFace(fromIndex); }
  stage.append(ghost); paper.classList.add('paper-turning');
  const token = ++serial;
  const frames = [
   {transform:'rotateY(0deg) skewY(0deg)',filter:'brightness(1)',offset:0},
   {transform:'rotateY(-55deg) skewY(-3deg)',filter:'brightness(.91)',offset:.52},
   {transform:'rotateY(-108deg) skewY(-1deg)',filter:'brightness(.85)',offset:1}
  ];
  animation = ghost.animate(frames,{duration:620,easing:'cubic-bezier(.35,.05,.22,1)',fill:'both',direction:forward?'normal':'reverse'});
  shadowAnimation = face.animate([{boxShadow:'inset 80px 0 80px -30px #20251b50'},{boxShadow:'inset 0 0 0 #20251b00'}],{duration:640,fill:'both'});
  try { await animation.finished; } catch { /* Route changes and resizing cancel a leaf safely. */ }
  if (disposed || token !== serial) return;
  animation.cancel(); shadowAnimation.cancel(); animation = shadowAnimation = null;
  paintFace(index); ghost.remove(); ghost = null; paper.classList.remove('paper-turning');
  const queued = pending; pending = null;
  if (queued !== null && queued !== index) turn(queued);
 };
 const pageOf = element => {
  if (!stride || !flow.contains(element)) return index;
  const rect = element.getClientRects()[0] || element.getBoundingClientRect();
  return clamp(Math.floor((rect.left - flow.getBoundingClientRect().left + 2) / stride));
 };
 const visibleAnchor = () => [...flow.querySelectorAll('p,h2,h3,figure,li')].find(element=>pageOf(element) === index);
 const measure = () => {
  frame = 0; if (disposed) return;
  const width = viewport.clientWidth;
  if (!width || !viewport.clientHeight) return;
  const anchor = layoutTarget || (stride ? visibleAnchor() : null);
  const followDisclosure = !!layoutTarget; layoutTarget = null;
  flow.style.setProperty('--column-width', `${width}px`);
  const gap = 48;
  const newStride = width + gap;
  const newTotal = Math.max(1, Math.round((flow.scrollWidth + gap) / newStride));
  // Loading a dimensioned illustration must not interrupt a turning leaf.
  if (stride === newStride && total === newTotal) {
   if (followDisclosure) { turn(pageOf(anchor),{animate:false}); reveal(); }
   return;
  }
  cancel(); stride = newStride; total = newTotal;
  if (select.options.length !== total) {
   select.replaceChildren(...Array.from({length:total},(_,i)=>{
    const option = doc.createElement('option'); option.value = String(i); option.textContent = String(i + 1); return option;
   }));
  }
  index = anchor ? pageOf(anchor) : clamp(index); update();
  if (followDisclosure) reveal();
 };
 const scheduleMeasure = () => { if (!disposed && !frame) frame = win.requestAnimationFrame(measure); };
 const goToElement = (element, animate = true) => {
  if (!flow.contains(element) || !stride) return false;
  turn(pageOf(element),{animate});
  return true;
 };
 const onClick = event => {
  if (event.target.closest('[data-page-prev]')) { reveal(); turn((pending ?? index) - 1); }
  if (event.target.closest('[data-page-next]')) { reveal(); turn((pending ?? index) + 1); }
 };
 const reveal = () => {
  const rect = paper.getBoundingClientRect();
  if (rect.top < 70 || rect.bottom + 64 > win.innerHeight) paper.scrollIntoView({block:'start',behavior:preference.matches?'instant':'smooth'});
 };
 const onSelect = () => { reveal(); turn(Number(select.value)); };
 const onKey = event => {
  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey || event.target.closest('input,select,textarea,summary,button:not([data-page-prev]):not([data-page-next])')) return;
  if (event.key === 'ArrowRight' || event.key === 'ArrowLeft') {
   event.preventDefault(); turn((pending ?? index) + (event.key === 'ArrowRight' ? 1 : -1));
  }
 };
 const onFocus = event => {
  viewport.scrollLeft = 0;
  goToElement(event.target, false);
 };
 const onToggle = event => { layoutTarget = event.target; scheduleMeasure(); };
 let pointer = null;
 const onDown = event => {
  if (event.pointerType !== 'touch' || event.target.closest('input,select,button,a,summary')) return;
  pointer = {x:event.clientX,y:event.clientY};
 };
 const onUp = event => {
  if (!pointer) return;
  const dx = event.clientX - pointer.x, dy = event.clientY - pointer.y; pointer = null;
  if (Math.abs(dx) > 60 && Math.abs(dx) > Math.abs(dy) * 1.5) turn(index + (dx < 0 ? 1 : -1));
 };
 const onCancel = () => { pointer = null; };
 const onPreference = () => { if (preference.matches) cancel(); };
 nav.addEventListener('click',onClick); nav.addEventListener('change',onSelect);
 nav.addEventListener('keydown',onKey); paper.addEventListener('keydown',onKey);
 flow.addEventListener('focusin',onFocus); flow.addEventListener('toggle',onToggle,true);
 flow.addEventListener('load',scheduleMeasure,true);
 viewport.addEventListener('pointerdown',onDown); viewport.addEventListener('pointerup',onUp); viewport.addEventListener('pointercancel',onCancel);
 preference.addEventListener?.('change',onPreference);
 const observer = new win.ResizeObserver(scheduleMeasure); observer.observe(viewport);
 // Image dimensions are declared in the source; fonts can still reflow lines.
 doc.fonts?.ready.then(scheduleMeasure);
 measure(); update();
 return {
  goToElement,
  get isLast() { return index === total - 1; },
  cancel,
  dispose() {
   disposed = true; cancel(); observer.disconnect(); win.cancelAnimationFrame(frame);
   nav.removeEventListener('click',onClick); nav.removeEventListener('change',onSelect); nav.removeEventListener('keydown',onKey);
   paper.removeEventListener('keydown',onKey); flow.removeEventListener('focusin',onFocus); flow.removeEventListener('toggle',onToggle,true); flow.removeEventListener('load',scheduleMeasure,true);
   viewport.removeEventListener('pointerdown',onDown); viewport.removeEventListener('pointerup',onUp); viewport.removeEventListener('pointercancel',onCancel);
   preference.removeEventListener?.('change',onPreference);
  }
 };
}
