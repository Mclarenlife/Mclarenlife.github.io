import {sitePath} from './site-path.js';
// Timings measured from the supplied recording (30 fps).
// Home: isolate → quarter-turn + open. Case: close → hold → open.
export const TIMING = Object.freeze({turn:1050,close:480,hold:580,open:600,title:400,advance:1050,homeExit:650});
const EASE='cubic-bezier(.33,1,.68,1)';
let activeSequence;
const abortError=()=>new DOMException('Navigation superseded','AbortError');

class Sequence {
  constructor(signal){this.signal=signal;this.animations=[];this.nodes=[];this.restorations=[];}
  node(className,parent=document.body){const n=document.createElement('div');n.className=className;n.setAttribute('aria-hidden','true');if(parent===document.body)n.setAttribute('inert','');parent.append(n);this.nodes.push(n);return n;}
  animate(node,frames,options){
    if(this.signal.aborted)return Promise.reject(abortError());
    const a=node.animate(frames,{easing:EASE,fill:'both',...options});this.animations.push(a);
    return new Promise((resolve,reject)=>{
      const abort=()=>{a.cancel();reject(abortError())};
      this.signal.addEventListener('abort',abort,{once:true});
      a.finished.then(()=>{this.signal.removeEventListener('abort',abort);this.signal.aborted?reject(abortError()):resolve()},()=>{this.signal.removeEventListener('abort',abort);reject(abortError())});
    });
  }
  style(node,property,value){
    const previous=node.style.getPropertyValue(property);node.style.setProperty(property,value);
    let restored=false;const restore=()=>{if(!restored){restored=true;previous?node.style.setProperty(property,previous):node.style.removeProperty(property)}};
    this.restorations.push(restore);return restore;
  }
  hide(node){return node?this.style(node,'visibility','hidden'):()=>{};}
  finish(){this.animations.forEach(a=>a.cancel());this.nodes.forEach(n=>n.remove());this.restorations.forEach(fn=>fn());}
}

function titleLetters(){
  const title=document.querySelector('.case-heading h1');if(!title)return [];
  if(!title.querySelector('.title-char')){
    const text=title.textContent;title.setAttribute('aria-label',text);title.textContent='';
    for(const [index,word] of text.split(' ').entries()){
      const span=document.createElement('span');span.className='title-word';span.setAttribute('aria-hidden','true');
      for(const ch of word){const letter=document.createElement('span');letter.className='title-char';letter.textContent=ch;span.append(letter)}
      if(index)title.append(document.createTextNode(' '));title.append(span);
    }
  }
  return [...title.querySelectorAll('.title-char')];
}
function titleMotion(seq,incoming,delay=0){
  return Promise.all(titleLetters().map((char,i)=>seq.animate(char,incoming?[
    {transform:'perspective(500px) rotateY(-90deg)',opacity:0},
    {transform:'perspective(500px) rotateY(0deg)',opacity:1}
  ]:[{transform:'perspective(500px) rotateY(0deg)',opacity:1},{transform:'perspective(500px) rotateY(90deg)',opacity:0}],{duration:TIMING.title,delay:delay+i*14})));
}
function folderBounds(){
  const rect=document.querySelector('.open-folder').getBoundingClientRect();
  return {left:rect.left,top:rect.top,width:rect.width,height:Math.max(window.innerHeight-rect.top+120,rect.width*.8)};
}
function setBounds(node,r){Object.assign(node.style,{left:`${r.left}px`,top:`${r.top}px`,width:`${r.width}px`,height:`${r.height}px`});}
function hinge(seq,color,r){
  const scene=seq.node('folder-motion');scene.dataset.phase='closing';
  const pivot=seq.node('folder-motion-pivot',scene);setBounds(pivot,r);
  const cover=seq.node('folder-motion-cover',pivot);cover.style.background=color;
  cover.style.transform='rotateY(-180deg)';
  return {scene,pivot,cover};
}

async function switchCase(seq,from,commit){
  const r=folderBounds();
  // At a scrolled position the cover still masks the visible dossier.
  const top=Math.max(r.top,0);r.height=Math.max(r.height,window.innerHeight-top+120);r.top=top;
  const {scene,pivot,cover}=hinge(seq,from.architect.color,r);
  await Promise.all([
    seq.animate(cover,[{transform:'rotateY(-180deg)'},{transform:'rotateY(0deg)'}],{duration:TIMING.close}),
    titleMotion(seq,false)
  ]);
  scene.dataset.phase='closed';
  // Replace the document only while the old colored cover is fully closed.
  commit();
  const title=titleLetters();title.forEach(el=>el.style.opacity='0');
  const destination=folderBounds();setBounds(pivot,destination);
  seq.restorations.push(()=>title.forEach(el=>el.style.opacity=''));
  await seq.animate(cover,[{transform:'rotateY(0deg)'},{transform:'rotateY(0deg)'}],{duration:TIMING.hold});
  scene.dataset.phase='opening';
  await Promise.all([
    seq.animate(cover,[{transform:'rotateY(0deg)'},{transform:'rotateY(-180deg)'}],{duration:TIMING.open}),
    titleMotion(seq,true,120)
  ]);
}

function turnedTransform(rect,target,angle,progress){
  // A quarter turn swaps the two measured dimensions. Preserve both instead
  // of replacing the resting rectangle with a width-sized square.
  const scaleX=(rect.height/target.width)*(1-progress)+progress;
  const scaleY=(rect.width/target.height)*(1-progress)+progress;
  const x=rect.left+(target.left-rect.left)*progress;
  const y=rect.top+(target.top-rect.top)*progress;
  // Keep the rotated folder's upper bounding edge on the measured path.
  return `translate(${x}px,${y-Math.sin(angle*Math.PI/180)*target.width*scaleX}px) rotate(${angle}deg) scale(${scaleX},${scaleY})`;
}
function homeFolderBounds(source){
  const group=source?.closest('.folder-group');
  const surface=group?.querySelector('.folder-surface')?.getBoundingClientRect();
  const back=group?.querySelector('.folder-back')?.getBoundingClientRect();
  return {left:surface?.left??24,top:surface?.top??window.innerHeight*.6,
    width:Math.max(1,surface?.width??window.innerWidth-48),
    height:Math.max(1,back?.height||parseFloat(group?.style.getPropertyValue('--stack-hinge'))||surface?.height||0)};
}
function tabSnapshot(el){
  const style=window.getComputedStyle(el);
  return {rect:el.getBoundingClientRect(),text:el.textContent,background:style.backgroundColor,color:style.color,fontFamily:style.fontFamily,fontSize:parseFloat(style.fontSize)||26,lineHeight:parseFloat(style.lineHeight)||31.2,padding:[style.paddingTop,style.paddingRight,style.paddingBottom,style.paddingLeft].map(v=>parseFloat(v)||0),filter:style.filter||'none',vertical:style.writingMode==='vertical-rl'};
}
function movingTab(seq,book,home,detail,homeFolder,detailFolder,reverse=false){
  const scale=homeFolder.width/detailFolder.height||1;
  const depthScale=homeFolder.height/detailFolder.width||1;
  const face=seq.node('motion-tab-face',book);face.textContent=home.text;
  Object.assign(face.style,{fontFamily:home.fontFamily,background:home.background,color:home.color});
  const px=v=>`${v}px`;
  const frame=(x,y,width,height,angle,size,line,padding,filter)=>({left:px(x),top:px(y),width:px(width),height:px(height),transform:`rotate(${angle}deg)`,fontSize:px(size),lineHeight:px(line),padding:padding.map(px).join(' '),filter});
  const first=frame(detailFolder.width+(homeFolder.top-home.rect.top)/depthScale,(home.rect.left-homeFolder.left)/scale,home.rect.width/scale,home.rect.height/scale,90,home.fontSize/scale,home.lineHeight/scale,home.padding.map(v=>v/scale),home.filter);
  // Cancel the book's unequal starting scales for the tab face, so its label
  // and rounded profile match the original exactly at the handoff.
  first.transform=`rotate(90deg) scaleY(${scale/depthScale})`;
  // A clockwise rotation maps horizontal top/right/bottom/left to right/bottom/left/top.
  const padding=detail.vertical?[detail.padding[1],detail.padding[2],detail.padding[3],detail.padding[0]]:detail.padding;
  const last=frame((detail.vertical?detail.rect.right:detail.rect.left)-detailFolder.left,detail.rect.top-detailFolder.top,detail.vertical?detail.rect.height:detail.rect.width,detail.vertical?detail.rect.width:detail.rect.height,detail.vertical?90:0,detail.fontSize,detail.lineHeight,padding,detail.filter);
  return {face,finished:seq.animate(face,reverse?[last,first]:[first,last],{duration:TIMING.turn,easing:'cubic-bezier(.45,0,.2,1)'})};
}
function turningFolder(seq,architect,r){
  const scene=seq.node('folder-motion');scene.dataset.phase='turning';
  const book=seq.node('folder-motion-book',scene);book.style.width=`${r.width}px`;book.style.height=`${r.height}px`;book.style.setProperty('--case',architect.color);
  const back=seq.node('folder-motion-back',book);back.style.background=architect.color;
  const cover=seq.node('folder-motion-cover',book);cover.style.background=architect.color;
  return {scene,book,cover,back};
}

function caseTabMotion(seq,incoming){
  const mobile=window.innerWidth<=650;
  return Promise.all([...document.querySelectorAll('.case-tabs .folder-tab:not(.active)')].map((el,i)=>{
    const tucked={transform:mobile?'translateY(110%)':'translateX(-110%)'};
    const resting={transform:'translate(0,0)'};
    return seq.animate(el,incoming?[tucked,{transform:mobile?'translateY(-3px)':'translateX(3px)',offset:.8},resting]:[resting,tucked],{
      duration:incoming?380:220,delay:incoming?i*65:0
    });
  }));
}

async function openFromHome(seq,to,source,commit){
  source ||= document.querySelector(`a[href="${sitePath(`/cases/${to.architect.id}`)}"]`);
  const surface=source?.closest('.folder-group')?.querySelector('.folder-surface');
  const r=homeFolderBounds(source);
  const selectedGroup=source?.closest('.folder-group');
  if(selectedGroup){
    const selectedLeaves=selectedGroup.querySelector(`[data-file="${to.architect.id}"]`);
    for(const leaves of selectedGroup.querySelectorAll('.file-leaves')){
      if(leaves!==selectedLeaves)seq.hide(leaves);
    }
    if(selectedLeaves){
      const opacity=selectedLeaves.style.opacity;selectedLeaves.style.opacity='1';
      seq.restorations.push(()=>{selectedLeaves.style.opacity=opacity});
    }
    // The full folder is already behind the stack; moving its neighbors uncovers it.
    const body=seq.node('home-folder-body',selectedGroup);
    body.style.background=to.architect.color;body.style.height=`${r.height}px`;
    const previous=surface.style.background;surface.style.background=to.architect.color;
    const oldColor=selectedGroup.style.getPropertyValue('--folder');selectedGroup.style.setProperty('--folder',to.architect.color);
    const tabs=selectedGroup.querySelector('.folder-tabs');
    const previousClip=tabs.style.clipPath;tabs.style.clipPath='inset(-30px -30px 0 -30px)';
    seq.restorations.push(()=>{surface.style.background=previous;selectedGroup.style.setProperty('--folder',oldColor);tabs.style.clipPath=previousClip});
  }
  const departures=[...document.querySelectorAll('.folder-group,.archive-bottom')].filter(el=>el!==selectedGroup);
  const exits=departures.map((el,i)=>{
    const distance=Math.max(180,window.innerHeight-el.getBoundingClientRect().top+100);
    return seq.animate(el,[{transform:'translateY(0)'},{transform:`translateY(${distance}px)`}],{duration:TIMING.homeExit,delay:i*45,easing:'cubic-bezier(.55,0,.35,1)'});
  });
  for(const [i,el] of [...document.querySelectorAll('.intro h1,.intro p')].entries()){
    exits.push(seq.animate(el,[{transform:'translateY(0)',opacity:1,clipPath:'inset(0 0 0 0)'},{transform:`translateY(${-80+i*40}px)`,opacity:0,clipPath:'inset(0 0 100% 0)'}],{duration:460,delay:i*60}));
  }
  for(const el of selectedGroup?.querySelectorAll('.category-label')||[]){
    exits.push(seq.animate(el,[{opacity:1},{opacity:0}],{duration:240}));
  }
  for(const el of selectedGroup?.querySelectorAll('.folder-tab')||[]){
    if(el!==source)exits.push(seq.animate(el,[{transform:'translateY(0)'},{transform:`translateY(${el.getBoundingClientRect().height+16}px)`}],{duration:300,easing:'cubic-bezier(.55,0,.35,1)'}));
  }
  await Promise.all(exits);
  const homeTab=tabSnapshot(source);
  commit();
  const target=folderBounds();
  const folder=document.querySelector('.open-folder');
  const showFolder=seq.hide(folder);
  const letters=titleLetters();letters.forEach(el=>el.style.opacity='0');
  seq.restorations.push(()=>letters.forEach(el=>el.style.opacity=''));
  const detailTab=tabSnapshot(document.querySelector('.case-tabs .active'));
  const {scene,book,cover,back}=turningFolder(seq,to.architect,target);
  const tabMotion=movingTab(seq,book,homeTab,detailTab,r,target);
  // Keep the document in its final, unscaled layout. Only the closed folder
  // rotates; its cover then opens over the very same paper and tab nodes.
  await Promise.all([
    seq.animate(book,[
      {transform:turnedTransform(r,target,-90,0),offset:0},
      {transform:turnedTransform(r,target,-67,.2),offset:.25},
      {transform:turnedTransform(r,target,-35,.6),offset:.55},
      {transform:turnedTransform(r,target,-6,.93),offset:.82},
      {transform:turnedTransform(r,target,0,1),offset:1}
    ],{duration:TIMING.turn,easing:'cubic-bezier(.45,0,.2,1)'}),
    titleMotion(seq,true,620),
    tabMotion.finished
  ]);
  scene.dataset.phase='opening';
  const revealTabs=caseTabMotion(seq,true);
  seq.hide(back);seq.hide(tabMotion.face);showFolder();
  await Promise.all([
    seq.animate(cover,[{transform:'rotateY(0deg)'},{transform:'rotateY(-180deg)'}],{duration:TIMING.open}),
    revealTabs
  ]);
}

async function closeToHome(seq,from,commit){
  const initial=folderBounds();
  const detailTab=tabSnapshot(document.querySelector('.case-tabs .active'));
  // Retract the actual rail behind the folder edge before creating a rotating
  // overlay. The live paper stays still until the closing cover masks it.
  const closing=hinge(seq,from.architect.color,initial);
  await Promise.all([
    caseTabMotion(seq,false),titleMotion(seq,false),
    seq.animate(closing.cover,[{transform:'rotateY(-180deg)'},{transform:'rotateY(0deg)'}],{duration:TIMING.close})
  ]);
  commit();
  const home=document.querySelector('main');
  const showHome=seq.hide(home);
  const link=home.querySelector(`a[href="${sitePath(`/cases/${from.architect.id}`)}"]`);
  const surface=homeFolderBounds(link);
  const {scene,book}=turningFolder(seq,from.architect,initial);
  scene.dataset.phase='returning';seq.hide(closing.scene);
  const tabMotion=movingTab(seq,book,tabSnapshot(link),detailTab,surface,initial,true);
  await Promise.all([
    seq.animate(book,[
      {transform:turnedTransform(surface,initial,0,1),offset:0},
      {transform:turnedTransform(surface,initial,-20,.75),offset:.3},
      {transform:turnedTransform(surface,initial,-65,.2),offset:.7},
      {transform:turnedTransform(surface,initial,-90,0),offset:1}
    ],{duration:TIMING.turn,easing:'cubic-bezier(.45,0,.2,1)'}),
    tabMotion.finished
  ]);
  const returnedGroup=link.closest('.folder-group');
  const tabs=returnedGroup.querySelector('.folder-tabs');
  const restoreClip=seq.style(tabs,'clip-path','inset(-30px -30px 0 -30px)');
  const siblings=[...tabs.querySelectorAll('.folder-tab')].filter(el=>el!==link);
  const siblingArrivals=siblings.flatMap((el,i)=>{
    const leaf=returnedGroup.querySelector(`[data-file="${el.getAttribute('href').split('/').pop()}"]`);
    const rise=Math.max(el.getBoundingClientRect().height,38)+16;
    return [el,leaf].filter(Boolean).map(node=>seq.animate(node,[
      {transform:`translateY(${rise}px)`},
      {transform:'translateY(-4px)',offset:.8},
      {transform:'translateY(0)'}
    ],{duration:460,delay:80+i*65}));
  });
  const arrivals=[...home.querySelectorAll('.folder-group,.archive-bottom')].filter(el=>el!==returnedGroup).map((el,i)=>{
    const rise=Math.max(160,window.innerHeight-el.getBoundingClientRect().top+80);
    return seq.animate(el,[
      {transform:`translateY(${rise}px)`,offset:0},
      {transform:'translateY(-7px)',offset:.82},
      {transform:'translateY(0)',offset:1}
    ],{duration:680,delay:80+i*65,easing:'cubic-bezier(.22,.8,.22,1)'});
  });
  const intro=[...home.querySelectorAll('.intro h1,.intro p')].map((el,i)=>seq.animate(el,[
    {transform:'translateY(42px)',opacity:0,clipPath:'inset(0 0 100% 0)',offset:0},
    {transform:'translateY(-3px)',opacity:1,clipPath:'inset(0 0 0% 0)',offset:.82},
    {transform:'translateY(0)',opacity:1,clipPath:'inset(0 0 0% 0)',offset:1}
  ],{duration:560,delay:100+i*90}));
  // Start each child's entrance while the home page is still masked.
  showHome();seq.hide(scene);
  await Promise.all([
    ...arrivals,...intro,...siblingArrivals
  ]);
  restoreClip();
}

async function advanceFolder(seq,commit){
  const main=document.querySelector('main');
  const preview=main.querySelector('.next-folder-preview');
  const start=preview.getBoundingClientRect();
  const startTitle=preview.querySelector('.next-folder-title').getBoundingClientRect();
  const startFont=parseFloat(window.getComputedStyle(preview.querySelector('.next-folder-title')).fontSize);
  const outgoing=seq.node('folder-motion next-page-outgoing');
  const snapshot=main.cloneNode(true);
  snapshot.removeAttribute('id');
  snapshot.style.transform=`translateY(${main.getBoundingClientRect().top}px)`;
  snapshot.querySelector('.next-folder-preview').style.visibility='hidden';
  // The fixed navigation belongs to the live page, never to its moving copy.
  snapshot.querySelector('.collection-rail')?.remove();
  outgoing.append(snapshot);
  commit();
  const folder=main.querySelector('.open-folder');
  const target=folder.getBoundingClientRect();
  const heading=main.querySelector('h1');
  const titleRect=heading.getBoundingClientRect();
  const font=window.getComputedStyle(heading);
  const showMain=seq.hide(main);
  // Animate the actual folder and heading. Their final frame IS the resting
  // page: no estimated-height color proxy, duplicate title, or layer swap.
  seq.style(folder,'visibility','visible');seq.style(folder,'z-index','42');
  seq.style(heading,'visibility','visible');seq.style(heading,'position','relative');
  seq.style(heading,'z-index','43');seq.style(heading,'transform-origin','0 0');
  const height=target.height||folderBounds().height;
  const duration=TIMING.advance;
  const reveals=[...folder.children].map(node=>seq.animate(node,[
    {opacity:0,transform:'translateY(24px)'},
    {opacity:1,transform:'translateY(0)'}
  ],{duration:450,delay:node.matches('.case-tabs')?600:500}));
  await Promise.all([
    seq.animate(outgoing,[{transform:'translateY(0)',opacity:1},{transform:`translateY(${-window.innerHeight}px)`,opacity:0}],{duration:700}),
    seq.animate(folder,[
      {transform:`translate(${start.left-target.left}px,${start.top-target.top}px)`,clipPath:`inset(0 -70px ${Math.max(0,height-start.height)}px 0 round 3px)`},
      {transform:'translate(0px,0px)',clipPath:'inset(0 -70px 0px 0 round 3px)'}
    ],{duration}),
    seq.animate(heading,[
      {transform:`translate(${startTitle.left-titleRect.left}px,${startTitle.top-titleRect.top}px) scale(${startFont/parseFloat(font.fontSize)||1})`},
      {transform:'translate(0px,0px) scale(1)'}
    ],{duration}),
    ...reveals
  ]);
  // Make the surrounding page visible while the live nodes still hold their
  // identical final frame; cleanup only removes the old page and animations.
  showMain();
}

export async function transitionFolder({from,to,source,commit,signal}){
  const seq=new Sequence(signal);
  activeSequence=seq;
  // Preserve the current hover angle before disabling hover for navigation.
  const tilted=from.type==='home'?[...document.querySelectorAll('.folder-group,.folder-surface,.folder-front-sheet,.folder-back-sheet,.folder-tabs .folder-tab,.archive-bottom')].map(node=>({node,transform:window.getComputedStyle(node).transform})).filter(({transform})=>transform&&transform!=='none'):[];
  document.body.classList.add('folder-motion-running');
  try{
    if(tilted.length)await Promise.all(tilted.map(({node,transform})=>seq.animate(node,[{transform},{transform:'none'}],{duration:180})));
    if(from.type==='home'&&to.type==='case')await openFromHome(seq,to,source,commit);
    else if(from.type==='case'&&to.type==='case'&&source?.matches('.next-file,.next-folder-preview'))await advanceFolder(seq,commit);
    else if(from.type==='case'&&to.type==='case')await switchCase(seq,from,commit);
    else if(from.type==='case'&&to.type==='home')await closeToHome(seq,from,commit);
    else{commit();await seq.animate(document.querySelector('main'),[{opacity:0},{opacity:1}],{duration:300});}
  }finally{seq.finish();if(activeSequence===seq)document.body.classList.remove('folder-motion-running');}
}
