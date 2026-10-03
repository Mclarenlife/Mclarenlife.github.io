// Keep the archive usable at / locally and /files/ on GitHub Pages.
export function siteBase() {
 const value=typeof document==='undefined'?'/':document.querySelector('meta[name="site-base"]')?.content||'/';
 return value.endsWith('/')?value:value+'/';
}
export function sitePath(path,base=siteBase()) {
 if(!path.startsWith('/')||path.startsWith('//')||base==='/')return path;
 if(path===base.slice(0,-1)||path.startsWith(base))return path;
 return base+path.slice(1);
}
export function routePath(path,base=siteBase()) {
 if(base==='/')return path;
 if(path===base.slice(0,-1))return '/';
 return path.startsWith(base)?'/'+path.slice(base.length):path;
}
export function isSitePath(path,base=siteBase()) {
 return base==='/'||path===base.slice(0,-1)||path.startsWith(base);
}
export function siteMarkup(markup,base=siteBase()) {
 return markup.replace(/\b(href|src|data-photo)=(["'])(\/(?!\/)[^"']*)\2/g,(_,attr,quote,path)=>attr+'='+quote+sitePath(path,base)+quote);
}
