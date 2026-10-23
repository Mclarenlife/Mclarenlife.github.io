const $=s=>document.querySelector(s);const $$=s=>[...document.querySelectorAll(s)];
const paths={sun:'M12 3v2m0 14v2M3 12h2m14 0h2M5.6 5.6 1.4 1.4m10 10 1.4 1.4M5.6 18.4 1.4-1.4m10-10 1.4-1.4 M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0',download:'M12 3v12m-5-5 5 5 5-5M5 16v4h14v-4',files:'M14 3H6v16h12V7zM14 3v5h5M9 22h12V10',history:'M3 10a9 9 0 1 1 1 7M3 4v6h6M12 7v6l4 2',book:'M12 5v16M3 4c4 0 7 0 9 2 2-2 5-2 9-2v14c-4 0-7 0-9 2-2-2-5-2-9-2z',sparkles:'m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5zM20 2v4m-2-2h4',expand:'M8 3H3v5m13-5h5v5M3 16v5h5m13-5v5h-5',play:'m8 5 11 7-11 7z',pause:'M8 5v14M16 5v14',reset:'M3 10a9 9 0 1 1 2 8M3 4v6h6',chart:'M4 3v18h17M8 16v-5m5 5V7m5 9V4',windows:'M3 5 11 4v8H3zm10-1 8-1v9h-8zM3 14h8v7l-8-1zm10 0h8v9l-8-1z',apple:'M14 5c0-3 2-4 4-4 0 2-1 4-4 4M12 7c-2-2-7-2-8 3-1 5 3 11 5 11l3-1 3 1c2 0 4-4 5-6-4-1-5-5-2-7-2-2-4-2-6-1',check:'m5 12 4 4L19 6',close:'m6 6 12 12M6 18 18 6',plus:'M12 5v14M5 12h14',file:'M14 3H5v18h14V8zM14 3v5h5',image:'M3 3h18v18H3zM3 17l6-6 4 4 3-3 5 5M15 7h.01'};
const icon=name=>`<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${paths[name]||paths.file}"></path></svg>`;
function icons(){ $$('[data-icon]').forEach(e=>e.innerHTML=icon(e.dataset.icon)); }
icons();

const frame=$('#workbench-frame');let ready=false,playing=false,scene='write';
const names={write:'01 / 编辑与编译',tools:'02 / 右键与行内 AI',search:'03 / 项目搜索',references:'04 / 快捷引用',history:'05 / 历史与备份',ai:'06 / AI 助手',settings:'07 / 设置'};
const say=text=>$('#demo-caption').textContent=text;
const send=(command,data={})=>frame.contentWindow?.postMessage({type:'texite-demo-command',command,...data},location.origin);
function setScene(next,sendCommand=true){scene=next;$('#scene-label').textContent=names[next];if(sendCommand&&ready)send('scene',{scene:next});}
function setPlaying(value){playing=value;$('#stop-demo').hidden=!value;$('#experience').classList.toggle('playing',value);$$('[data-play]').forEach(b=>b.classList.toggle('is-playing',value&&b.dataset.play===scene));}
function resizeFrame(){const width=$('#ipad-screen').clientWidth;frame.style.transform=`scale(${width/1200})`;}
new ResizeObserver(resizeFrame).observe($('#ipad-screen'));resizeFrame();
function expand(){const expanded=$('#experience').classList.toggle('is-expanded');$('#expand').setAttribute('aria-label',expanded?'缩小工作区':'放大工作区');resizeFrame();}
$('#expand').onclick=expand;
$('#stop-demo').onclick=()=>send('stop');
$$('[data-play]').forEach(b=>b.onclick=()=>{if(!ready){say('工作区还在载入，稍后即可播放。');return;}setScene(b.dataset.play,false);send('play',{scene:b.dataset.play});if(innerWidth<=950&&$('#experience').getBoundingClientRect().top>innerHeight*.5)$('#experience').scrollIntoView({behavior:'smooth',block:'start'});});
$('#reset').onclick=()=>{send('stop');$('#confirm-dialog').returnValue='';$('#confirm-dialog').showModal();};
$('#confirm-dialog').addEventListener('close',()=>{if($('#confirm-dialog').returnValue==='confirm'){ready=false;$('#workbench-loading').hidden=false;send('reset');say('正在备份当前项目并重置示例…');}});
document.addEventListener('keydown',e=>{if(e.key==='Escape'){send('stop');if($('#experience').classList.contains('is-expanded'))expand();}});
window.addEventListener('message',event=>{
 if(event.origin!==location.origin||event.source!==frame.contentWindow||event.data?.type!=='texite-demo')return;
 const data=event.data;
 if(data.event==='ready'){ready=true;$('#workbench-loading').hidden=true;send('scene',{scene});say('可直接编辑、切换视图、查看 PDF。点击播放，看鼠标逐步操作。');}
 if(data.event==='started'){setScene(data.scene,false);setPlaying(true);$('#tour-progress').style.width='0%';}
 if(data.event==='step'){say(`${data.step} / ${data.total}　${data.text}`);$('#tour-progress').style.width=(data.step/data.total*100)+'%';}
 if(data.event==='stopped'||data.event==='finished'){setPlaying(false);say(data.text);if(data.event==='finished')$('#tour-progress').style.width='100%';}
 if(data.event==='notice')say(data.text);
 if(data.event==='window-control'){if(data.action==='maximize')expand();else say('这是网站内的真实界面体验。窗口大小请使用设备下方的放大按钮调整。');}
});
let scheduled=false;window.addEventListener('scroll',()=>{if(scheduled||playing||$('#experience').classList.contains('is-expanded'))return;scheduled=true;requestAnimationFrame(()=>{scheduled=false;const target=innerWidth>700&&innerWidth<=950?Math.min(innerHeight-35,$('#experience').getBoundingClientRect().bottom+85):innerHeight*.5;let next='write';for(const section of $$('.story-section'))if(section.getBoundingClientRect().top<=target)next=section.dataset.scene;if(next!==scene)setScene(next);});},{passive:true});
frame.addEventListener('error',()=>say('工作区载入失败，请刷新或确认通过 START.cmd 打开网站。'));
