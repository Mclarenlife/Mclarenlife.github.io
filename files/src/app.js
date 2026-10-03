import {mountPaperPages} from './paper-pages.js';
import {sitePath,routePath,isSitePath,siteMarkup} from './site-path.js';
import {mountTitleMotion} from './title-motion.js';
import {updateWindLab} from './flight-view.js';
import {updateGripLab} from './racing-view.js';
import {updateColorLab} from './color-lab.js';
import {homeView,detailView,aboutView,notFoundView} from './views.js';
import {resolveRoute} from './routes.js';
import {transitionFolder} from './motion.js';
const main = document.querySelector('main');
const announcer = document.querySelector('#announcer');
const lightbox = document.querySelector('#lightbox');
const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)');
let current = resolveRoute(location.pathname);
let renderedPath = location.pathname;
let navigationToken = 0;
let navigationController;
let paperPages = null;
let disposeTitleMotion = () => {};
let stackObserver;
let peek=null;
let lastFile = null;
let homeScroll = 0;
history.scrollRestoration = 'manual';
function render(route, animated=false) {
 disposeTitleMotion();
 paperPages?.dispose(); paperPages=null;
 stackObserver?.disconnect();
 peek=null;
 document.title = route.title;
 document.body.dataset.view = route.type;
 main.innerHTML = siteMarkup(route.type === 'home' ? homeView() : route.type === 'case' ? detailView(route.architect) : route.type === 'about' ? aboutView() : notFoundView());
 updateColorLab(main);updateGripLab(main);updateWindLab(main);
 const aboutLink=document.querySelector('.about-link');
 if(route.type==='about')aboutLink.setAttribute('aria-current','page');else aboutLink.removeAttribute('aria-current');
 if(route.type==='home'){
  disposeTitleMotion=mountTitleMotion(main.querySelector('.curiosity-title'),reducedMotion);
  const archive=main.querySelector('.archive');
  const intro=main.querySelector('.intro');
  const alignHinges=()=>{
   // Measure only the fixed intro, so the archive's automatic top gap never
   // feeds back into its own height when the viewport is taller than the cap.
   const number=(node,property)=>parseFloat(window.getComputedStyle(node)[property])||0;
   archive.style.setProperty('--archive-top',`${intro.offsetTop+number(intro,'height')}px`);
   const height=number(archive,'height');
   let top=number(archive,'paddingTop');
   for(const folder of archive.querySelectorAll('.folder-group,.archive-bottom')){
    top+=number(folder,'marginTop');
    folder.style.setProperty('--stack-hinge',`${Math.max(0,height-top)}px`);
    top+=number(folder,'height')+number(folder,'marginBottom');
   }
  };
  alignHinges();
  stackObserver=new window.ResizeObserver(alignHinges);
  for(const node of [archive,intro,main])stackObserver.observe(node);
 }
 if (route.type === 'case') {
  paperPages=mountPaperPages(main.querySelector('.dossier'),reducedMotion,announcer);
  const anchor=location.hash&&document.getElementById(decodeURIComponent(location.hash.slice(1)));
  if(anchor)paperPages?.goToElement(anchor,false);
 }
}

function clearPeek(){
 if(peek){
  peek.group.classList.remove('is-peeking');
  peek.leaves?.classList.remove('is-selected');
  peek.group.style.removeProperty('--front-angle');
  peek.group.closest('.archive').style.removeProperty('--follow-angle');
  for(const node of peek.group.querySelectorAll('.is-pushed')){
   node.classList.remove('is-pushed');
   node.style.removeProperty('--push-angle');
   node.style.removeProperty('--cover-angle');
  }
 }
 peek=null;
}
function peekAt(tab){
 if(peek?.tab===tab)return;
 clearPeek();
 const group=tab.closest('.folder-group');
 const leaves=group.querySelector(`[data-file="${tab.getAttribute('href').split('/').pop()}"]`);
 peek={tab,group,leaves,rest:tab.getBoundingClientRect()};
 leaves?.classList.add('is-selected');
 const tabs=[...group.querySelectorAll('.folder-tab')];
 const selectedIndex=tabs.indexOf(tab);
 // Left-hand files are physically in front. Push them with the selected cover;
 // never promote the selected file above them or change their colors.
 group.style.setProperty('--front-angle',`${-18-selectedIndex*4}deg`);
 group.closest('.archive').style.setProperty('--follow-angle',`${-12-selectedIndex*4}deg`);
 for(let i=0;i<selectedIndex;i++){
  const frontFile=group.querySelectorAll('.file-leaves')[i];
  const angle=-18-(selectedIndex-i-1)*4;
  for(const node of [frontFile,tabs[i]]){
   node.classList.add('is-pushed');
   node.style.setProperty('--push-angle',`${angle}deg`);
   node.style.setProperty('--cover-angle',`${angle-4}deg`);
  }
 }
 group.classList.add('is-peeking');
}
main.addEventListener('pointerover',event=>{
 if(current.type!=='home'||event.pointerType==='touch'||document.body.classList.contains('folder-motion-running'))return;
 const tab=event.target.closest('.folder-tabs .folder-tab');if(tab)peekAt(tab);
});
main.addEventListener('pointermove',event=>{
 if(!peek||document.body.classList.contains('folder-motion-running'))return;
 const inside=r=>event.clientX>=r.left&&event.clientX<=r.right&&event.clientY>=r.top&&event.clientY<=r.bottom;
 // Keep both the resting and tilted hit regions until the pointer actually leaves.
 if(!inside(peek.rest)&&!inside(peek.tab.getBoundingClientRect()))clearPeek();
});
main.addEventListener('pointerleave',clearPeek);
main.addEventListener('focusin',event=>{
 if(current.type==='home'&&event.target.matches('.folder-tabs .folder-tab:focus-visible'))peekAt(event.target);
});
main.addEventListener('focusout',event=>{if(peek?.tab===event.target)clearPeek();});
async function navigate(path,{source=null,pop=false,scroll=null}={}) {
 path=sitePath(path);
 const route=resolveRoute(path);
 if(!pop && path===location.pathname) return;
 disposeTitleMotion();
 paperPages?.cancel();
 const token=++navigationToken;
 navigationController?.abort();
 navigationController=new AbortController();
 const controller=navigationController;
 if(lightbox.open)lightbox.close();
 if(current.type==='home')homeScroll=window.scrollY;
 if(current.type==='case')lastFile=current.architect.id;
 const from=current;
 if(!pop){history.replaceState({...history.state,scroll:window.scrollY},'',location.href);history.pushState({scroll:0},'',path)}
 const commit=()=>{
  if(token!==navigationToken)return;
  current=route;renderedPath=location.pathname;render(route);
  window.scrollTo({top:scroll??(route.type==='home'?homeScroll:0),behavior:'instant'});
 };
 try {
  if(reducedMotion.matches)commit();
  else await transitionFolder({from,to:route,source,commit,signal:controller.signal});
  if(token!==navigationToken)return;
  main.focus({preventScroll:true});
  if(route.type==='home'&&lastFile)main.querySelector(`a[href="${sitePath(`/cases/${lastFile}`)}"]`)?.focus({preventScroll:true});
  announcer.textContent=route.type==='case'?`${route.architect.name} file opened`:route.type==='home'?'All files.':route.title;
 }catch(error){
  if(error.name!=='AbortError'){
   console.error('Folder animation failed; completing navigation.',error);
   if(token===navigationToken)commit();
  }
 }
}

main.addEventListener('input',event=>{if(event.target.closest('.color-lab'))updateColorLab(main);if(event.target.closest('.grip-lab'))updateGripLab(main);if(event.target.closest('.wind-lab'))updateWindLab(main)});
main.addEventListener('change',event=>{if(event.target.closest('.color-lab'))updateColorLab(main)});
document.addEventListener('click',event=>{
 if(event.target.closest('.color-lab-swap')){
  const lab=event.target.closest('.color-lab'),b=lab.querySelector('[name=backdrop]'),s=lab.querySelector('[name=source]');
  [b.value,s.value]=[s.value,b.value];updateColorLab(lab);return;
 }
 const photo=event.target.closest('[data-photo]');
 if(photo){const image=lightbox.querySelector('img');image.src=photo.dataset.photo;image.alt=photo.dataset.caption;lightbox.querySelector('p').textContent=photo.dataset.caption;lightbox.showModal();return}
 const link=event.target.closest('a');
 if(!link||event.defaultPrevented||event.button!==0||event.metaKey||event.ctrlKey||event.shiftKey||event.altKey||link.target==='_blank'||link.hasAttribute('download'))return;
 const url=new URL(link.href,location.href);
 if(url.origin===location.origin && url.pathname===location.pathname && url.hash){
  const target=document.getElementById(decodeURIComponent(url.hash.slice(1)));
  if(target && paperPages?.goToElement(target)){
   event.preventDefault();history.pushState({...history.state},'',url.href);
   main.querySelector('.dossier').scrollIntoView({behavior:reducedMotion.matches?'instant':'smooth',block:'start'});
   return;
  }
 }
 const localPath=routePath(url.pathname).replace(/\/+$/,'')||'/';
 if(url.origin!==location.origin||url.hash||!isSitePath(url.pathname)||!['/','/about'].includes(localPath)&&!localPath.startsWith('/cases/'))return;
 event.preventDefault();navigate(url.pathname,{source:link});
});
lightbox.querySelector('button').addEventListener('click',()=>lightbox.close());
lightbox.addEventListener('click',event=>{if(event.target===lightbox){const r=lightbox.getBoundingClientRect();if(event.clientX<r.left||event.clientX>r.right||event.clientY<r.top||event.clientY>r.bottom)lightbox.close()}});
document.addEventListener('keydown',event=>{
 if(event.key==='Escape'&&!lightbox.open&&current.type==='case')navigate('/');
 if((event.key==='ArrowRight'||event.key==='ArrowLeft')&&event.target.matches('.case-tabs .folder-tab')){
  const tabs=[...document.querySelectorAll('.case-tabs .folder-tab')];const direction=event.key==='ArrowRight'?1:-1;const next=tabs[(tabs.indexOf(event.target)+direction+tabs.length)%tabs.length];event.preventDefault();next.focus();
 }
});
window.addEventListener('popstate',event=>{
 // A fragment changes the reading position, not the open folder.
 if(location.pathname===renderedPath&&!document.body.classList.contains('folder-motion-running')){
  const section=location.hash&&document.getElementById(location.hash.slice(1));
  if(section){if(paperPages?.goToElement(section,false))main.querySelector('.dossier').scrollIntoView({behavior:'instant',block:'start'});else section.scrollIntoView({behavior:reducedMotion.matches?'instant':'smooth',block:'start'});}
  else window.scrollTo({top:event.state?.scroll??0,behavior:'instant'});
  return;
 }
 navigate(location.pathname,{pop:true,scroll:event.state?.scroll??0});
});
window.addEventListener('pagehide',()=>history.replaceState({...history.state,scroll:window.scrollY},'',location.href));
// The reference continues to the next folder on a deliberate extra scroll at the end.
let endScroll=0;
function advanceAtEnd(delta){
 if(current.type!=='case'||document.body.classList.contains('folder-motion-running')||lightbox.open||paperPages&&!paperPages.isLast)return;
 const remaining=document.documentElement.scrollHeight-window.innerHeight-window.scrollY;
 if(remaining>6||delta<=0){endScroll=0;return}
 endScroll+=delta;
 const next=main.querySelector('.next-folder-preview');
 if(endScroll>=190&&next){endScroll=0;navigate(new URL(next.href).pathname,{source:next})}
}
window.addEventListener('wheel',event=>advanceAtEnd(event.deltaY),{passive:true});
let touchStartY=null;
window.addEventListener('touchstart',event=>{touchStartY=event.touches[0]?.clientY??null},{passive:true});
window.addEventListener('touchend',event=>{
 if(touchStartY!==null){const distance=touchStartY-(event.changedTouches[0]?.clientY??touchStartY);if(distance>65)advanceAtEnd(190);touchStartY=null}
},{passive:true});
render(current);
