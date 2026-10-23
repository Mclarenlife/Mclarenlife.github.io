// Local adaptation layer. The visual and animation implementation lives in the
// archived public Butter bundles; this file does not recreate their effects.
window.__localAudit={errors:[],resources:[]};
addEventListener('error',e=>{const s=e.message||e.target?.src||'resource error';window.__localAudit.errors.push(s.startsWith('data:')?'Codec capability probe':s);},true);
addEventListener('unhandledrejection',e=>window.__localAudit.errors.push(String(e.reason)));
// Home wordmarks return to the top while preserving the current static page.
document.addEventListener('click',e=>{
 const a=e.target.closest?.('a[href]');if(!a)return;
 const u=new URL(a.href,location.href);
 if(u.origin===location.origin&&u.pathname==='/collection/'&&!u.hash){
   e.preventDefault();e.stopImmediatePropagation();window.scrollTo({top:0,behavior:'smooth'});
 }
},true);
