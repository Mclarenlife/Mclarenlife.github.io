// Opaque backdrop, encoded sRGB channels, source-over. W3C Compositing §10.1.
export function blendColor(backdrop,source,mode='normal',opacity=1){
 const channels=hex=>hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255);
 const b=channels(backdrop),s=channels(source);
 const blend=(B,S)=>mode==='multiply'?B*S:mode==='screen'?1-(1-B)*(1-S):mode==='overlay'?(B<=.5?2*B*S:1-2*(1-B)*(1-S)):S;
 const alpha=Math.min(1,Math.max(0,opacity));
 return '#'+b.map((B,i)=>Math.round(255*((1-alpha)*B+alpha*blend(B,s[i]))).toString(16).padStart(2,'0')).join('');
}
export function colorLabView(){
 return `<section class="color-lab" aria-labelledby="blend-lab-heading"><span class="lesson-subtitle">COLOR LAB / 动手实验</span><h2 id="blend-lab-heading">同样两种颜色，换一种叠法</h2><p>调整颜色、模式与不透明度，比较结果。底层固定不透明，按 sRGB 编码通道计算，不模拟真实颜料或灯光。</p><div class="color-lab-controls"><label>底层颜色<input type="color" name="backdrop" value="#246f8f"></label><label>上层颜色<input type="color" name="source" value="#ef984d"></label><label>混合模式<select name="mode" aria-label="混合模式"><option value="normal">正常 Normal</option><option value="multiply">正片叠底 Multiply</option><option value="screen">滤色 Screen</option><option value="overlay">叠加 Overlay</option></select></label><label>上层不透明度 <output data-opacity>50%</output><input type="range" aria-label="上层不透明度" name="opacity" min="0" max="100" value="50" step="1"></label></div><div class="color-lab-swatches">${[['backdrop','底层'],['source','上层原色'],['result','合成结果']].map(([key,label])=>`<figure><div data-swatch="${key}"></div><figcaption>${label}<output data-hex="${key}"></output></figcaption></figure>`).join('')}</div><p class="color-lab-formula" data-formula></p><button type="button" class="color-lab-swap">交换上下层</button></section>`;
}
export function updateColorLab(root){
 const lab=root.matches?.('.color-lab')?root:root.querySelector('.color-lab');if(!lab)return;
 const value=name=>lab.querySelector(`[name="${name}"]`).value;
 const backdrop=value('backdrop'),source=value('source'),mode=value('mode'),opacity=Number(value('opacity'))/100;
 const colors={backdrop,source,result:blendColor(backdrop,source,mode,opacity)};
 for(const [key,color] of Object.entries(colors)){
  lab.querySelector(`[data-swatch="${key}"]`).style.backgroundColor=color;
  lab.querySelector(`[data-hex="${key}"]`).textContent=color.toUpperCase();
 }
 lab.querySelector('[data-opacity]').textContent=`${Math.round(opacity*100)}%`;
 const formulas={normal:'F = S',multiply:'F = B × S',screen:'F = 1 − (1 − B)(1 − S)',overlay:'B ≤ 0.5：F = 2BS；否则 F = 1 − 2(1 − B)(1 − S)'};
 lab.querySelector('[data-formula]').textContent=`${formulas[mode]}。最终 R = αF + (1 − α)B；B 为底层，S 为上层，α 为不透明度。`;
}
