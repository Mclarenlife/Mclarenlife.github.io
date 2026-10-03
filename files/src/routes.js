import {routePath} from './site-path.js';
import {byId} from './data.js';
export function resolveRoute(pathname) {
 const path = routePath(pathname).replace(/\/+$/, '') || '/';
 if(path === '/') return {type:'home', title:"MCLARY‘S FILES — 好奇心档案"};
 if(path === '/about') return {type:'about', title:"About — MCLARY‘S FILES"};
 const match = path.match(/^\/cases\/([a-z-]+)$/);
 if(match && byId[match[1]]) return {type:'case', architect:byId[match[1]], title:`${byId[match[1]].name} — MCLARY‘S FILES`};
 return {type:'not-found',title:"File not found — MCLARY‘S FILES"};
}
