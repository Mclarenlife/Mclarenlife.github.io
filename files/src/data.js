import {flightLessons} from './flight-lessons.js';
import {racingLessons} from './racing-lessons.js';
import {photographyLessons} from './lessons.js';
import {colorLessons} from './color-lessons.js';
export const groups = [
  { title:'摄影主题', color:'#2d50d6', ids:['frank-lloyd-wright','irving-gill'], description:'从相机操作到画面构图，学习摄影的基础知识。了解相机设置、曝光与对焦，掌握构图方法，用镜头表达自己的观察。' },
  { title:'色彩知识', color:'#087f6b', ids:['frank-gehry','color-relationships','color-palette','color-contrast','color-blending'], description:'从色相、明度与饱和度出发，理解颜色之间的关系，再把配色用到真实画面中。五份学习档案，从基础配色走向对比、互补与颜色叠加，配合示意图和实验。' },
  { title:'赛车技巧', color:'#c85632', ids:['louis-kahn','i-m-pei','paul-rudolph','race-practice'], description:'从驾驶位置与抓地分配，到制动、走线、出弯和遥测复盘。四份赛车工程笔记，用示意图、错误诊断和分步练习，把速度变成可理解、可重复的驾驶能力。' },
  { title:'飞行驾驶技巧', color:'#376f91', ids:['mary-colter','louis-sullivan','flight-navigation','flight-instruments'], description:'把天空装进一组飞行笔记。从姿态与配平、起飞与着陆，到航路天气和仪表判读，结合航图示意、教员便签与模拟练习，建立清楚的操纵和决策思路。' }
];
export const architects = [
  ...photographyLessons,
  ...colorLessons,
  ...racingLessons,
  ...flightLessons
];
export const byId = Object.fromEntries(architects.map(a => [a.id,a]));
