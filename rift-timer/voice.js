'use strict';
const RiftVoice = (() => {
  const roles = [['上单','上路'],['打野'],['中单','中路'],['射手','下路','AD','ADC'],['辅助']];
  const names = [['闪现','闪'],['传送','TP'],['引燃','点燃'],['惩戒'],['治疗'],['屏障'],['虚弱'],['净化'],['疾跑']];
  const ids = ['SummonerFlash','SummonerTeleport','SummonerDot','SummonerSmite','SummonerHeal','SummonerBarrier','SummonerExhaust','SummonerBoost','SummonerHaste'];
  const phrases = new Map();
  roles.forEach((aliases, role) => aliases.forEach(lane => names.forEach((variants, i) => variants.forEach(name => phrases.set(lane+name,{role,id:ids[i]})))));
  function parse(text) { return typeof text === 'string' && phrases.get(text.toUpperCase().replace(/[\s，。！？、,.!?·]+/g,'')); }
  let modelPromise;
  async function resources() {
    if (!modelPromise) modelPromise = (async () => {
      if (!window.Vosk) await new Promise((resolve,reject) => {
        const script = document.createElement('script'); script.src='assets/speech/vosk.js'; script.onload=resolve; script.onerror=()=>reject(Error('识别库下载失败'));document.head.append(script);
      });
      const response=await fetch('assets/speech/commands.json?v=2.2.5'); if(!response.ok)throw Error('口令词表下载失败');
      const grammar=await response.text();
      const model=await Vosk.createModel(new URL('assets/speech/cn-022.tar.gz',location.href).href,-1);
      return {model,grammar};
    })().catch(error=>{modelPromise=null;throw error;});
    return modelPromise;
  }
  function microphone(state,command) {
    let session=null;
    function stop(message='语音已关闭') {
      const old=session;session=null;
      if(old){old.stream?.getTracks().forEach(t=>t.stop());old.node?.disconnect();old.source?.disconnect();old.rec?.remove();old.audio?.close().catch(()=>{});}
      state(false,message);
    }
    async function start() {
      if(session)return;
      const current={};session=current;
      try{
        state(true,'正在申请麦克风');
        current.audio=new AudioContext({sampleRate:16000});
        await current.audio.resume();
        if(session!==current)return;
        const stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true},video:false});
        if(session!==current){stream.getTracks().forEach(t=>t.stop());return;}
        current.stream=stream;stream.getAudioTracks()[0].onended=()=>{if(session===current)stop('麦克风已断开');};
        state(true,'准备中文模型 · 首次约 42 MB');
        const {model,grammar}=await resources();if(session!==current)return;
        await current.audio.audioWorklet.addModule('assets/speech/capture.js');if(session!==current)return;
        const rec=current.rec=new model.KaldiRecognizer(current.audio.sampleRate,grammar);rec.setWords(true);
        rec.on('result',({result})=>{
          if(session===current && result?.result?.length && result.result.every(w=>w.conf>=0.65) && parse(result.text))command(result.text.replace(/\s/g,''));
        });
        const node=current.node=new AudioWorkletNode(current.audio,'rift-microphone');node.port.onmessage=e=>{if(session===current)rec.acceptWaveformFloat(e.data,current.audio.sampleRate);};
        current.source=current.audio.createMediaStreamSource(stream);current.source.connect(node);node.connect(current.audio.destination);
        state(true,'正在聆听 · 说「上单闪现」');
      }catch(e){if(session===current)stop(e.name==='NotAllowedError'?'请允许此页面使用麦克风':e.name==='NotFoundError'?'未找到麦克风':'语音启动失败 · '+e.message);}
    }
    return {start,stop,active:()=>!!session};
  }
  const secureOrigin='https://mclarenlife.github.io';
  function attach(button,status,command){
    const display=(on,message)=>{button.textContent=on?'关闭语音':'开启语音';button.setAttribute('aria-pressed',String(on));status.textContent=message;};
    const mic=microphone(display,command);let peer,token,watch;
    const close=()=>{clearInterval(watch);if(peer&&!peer.closed)peer.close();peer=null;mic.stop();};
    button.onclick=()=>{
      if(peer||mic.active()){close();return;}
      if(window.isSecureContext&&navigator.mediaDevices){mic.start();return;}
      if(location.protocol!=='http:'){display(false,'请从 HTTPS 网址或 localhost 打开');return;}
      token=Array.from(crypto.getRandomValues(new Uint32Array(4))).join('-');
      peer=window.open(secureOrigin+'/rift-timer/microphone.html?v=2.2.5#'+new URLSearchParams({token,origin:location.origin}),'_blank','popup,width=440,height=420');
      if(!peer){display(false,'请允许打开语音窗口');return;}
      display(true,'在语音窗口中点击开启');watch=setInterval(()=>{if(peer?.closed)close();},600);
    };
    window.addEventListener('message',event=>{
      if(event.origin!==secureOrigin||!peer||event.source!==peer||event.data?.token!==token)return;
      if(event.data.type==='command'&&parse(event.data.text))command(event.data.text);
      if(event.data.type==='status')display(true,String(event.data.text).slice(0,100));
    });
    window.addEventListener('pagehide',close);
  }
  function companion(button,status) {
    const params=new URLSearchParams(location.hash.slice(1)), token=params.get('token'), roomOrigin=params.get('origin');
    const parent=window.opener;
    let valid=false;try{const url=new URL(roomOrigin);valid=/^https?:$/.test(url.protocol)&&url.origin===roomOrigin&&(!document.referrer||new URL(document.referrer).origin===roomOrigin);}catch{}
    if(valid)status.textContent='启用后，将向 '+roomOrigin+' 发送识别出的计时指令。';
    if(!parent||!valid||!/^(\d+-){3}\d+$/.test(token)){button.disabled=true;status.textContent='从对局页面点击「开启语音」进入';return;}
    const send=(type,text)=>parent.postMessage({type,text,token},roomOrigin);
    const mic=microphone((on,text)=>{status.textContent=text;button.textContent=on?'关闭麦克风':'开启麦克风';send('status',text);},text=>{status.textContent='听到 '+text;send('command',text);});
    button.onclick=()=>mic.active()?mic.stop():mic.start();
    const watch=setInterval(()=>{if(parent.closed){clearInterval(watch);mic.stop();window.close();}},750);
    window.addEventListener('pagehide',()=>{clearInterval(watch);mic.stop();},{once:true});
  }
  return {parse,attach,companion};
})();