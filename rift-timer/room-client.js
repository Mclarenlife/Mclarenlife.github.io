'use strict';
function connectRooms({ getState, setState, tell, onLeave }) {
  const element = id => document.getElementById(id);
  const dialog = element('room-dialog');
  const form = element('room-form');
  const label = element('room-label');
  const status = element('room-status');
  const errorText = element('room-error');
  const hosted = /^https?:$/.test(location.protocol) && !location.hostname.endsWith('.github.io');
  let code = '';
  let revision = 0;
  let offset = 0;
  let busy = false;
  let writing = false;
  let mode = 'join';
  const clock = () => Date.now() + offset;
  try { code = sessionStorage.getItem('rift-room-code') || ''; } catch {}
  const showMode = () => {
    label.textContent = code ? '对局码 ' + code : '对局码设置';
    status.textContent = code ? '正在同步' : '单人模式';
    element('storage-status').textContent = code ? '服务器对局' : '本地自动保存';
    element('room-leave').hidden = !code;
    form.hidden = Boolean(code);
  };
  async function request(action, roomCode, extra = {}) {
    const start = Date.now();
    const response = await fetch('/rift-timer/api', {
      method: 'POST', headers: {'Content-Type':'application/json'},
      body: JSON.stringify({ action, code:roomCode, ...extra }),
      signal: AbortSignal.timeout(8000), cache:'no-store'
    });
    if (response.status === 429) throw new Error('操作频繁，请稍后重试');
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || '对局服务暂不可用');
    return { ...data, offset:data.now - Math.round((start + Date.now()) / 2) };
  }
  function accept(data, force = false) {
    if (!force && data.rev < revision) return;
    offset = data.offset;
    if (force || data.rev !== revision) {
      const old = getState();
      data.state.slots.forEach((slot, i) => {
        const previous = old.slots[i];
        if (!force && slot.spellId === previous.spellId && (slot.endAt === previous.endAt || (previous.endAt > clock() && slot.endAt && data.state.loadout?.[i>>1] !== old.loadout?.[i>>1])))
          slot.alerted = previous.alerted;
        else if (slot.endAt && slot.endAt <= clock()) slot.alerted = true;
      });
      revision = data.rev;
      setState(data.state);
    }
    status.textContent = '已同步';
  }
  async function refresh() {
    if (!code || busy || writing) return;
    const requested = code;
    busy = true;
    try {
      const result = await request('read', requested);
      if (requested === code && !writing) accept(result);
    } catch { if (requested === code) status.textContent = '连接中断，正在重试'; }
    finally { busy = false; }
  }
  async function edit(change) {
    if (!code) { change(); return true; }
    if (writing || !revision) { tell('请等待对局同步'); return false; }
    const previous = JSON.parse(JSON.stringify(getState()));
    const requested = code;
    writing = true;
    try {
      change();
      const result = await request('write', code, { rev:revision, state:getState() });
      if (requested === code) accept(result);
      return true;
    } catch (error) {
      if (requested === code) { setState(previous); tell(error.message || '同步失败'); }
      return false;
    } finally { writing = false; refresh(); }
  }
  element('room-open').onclick = () => {
    errorText.textContent = '';
    dialog.showModal();
  };
  async function enter(roomCode, action, initial) {
    const result = await request(action, roomCode, action === 'create' ? {state:initial, clientNow:Date.now()} : {});
    code = roomCode;
    try { sessionStorage.setItem('rift-room-code', code); } catch {}
    showMode(); accept(result, true); dialog.close();
  }
  form.onsubmit = async event => {
    event.preventDefault();
    const input = element('room-code').value;
    mode = form.elements.mode.value;
    if (!hosted) {
      const target = new URL('https://47.106.192.155/rift-timer/');
      target.hash = encodeURIComponent(JSON.stringify({code:input, mode, state:getState()}));
      location.assign(target.href);
      return;
    }
    element('room-submit').disabled = true;
    try { await enter(input, mode === 'create' ? 'create' : 'read', getState()); }
    catch (error) { errorText.textContent = error.message; }
    finally { element('room-submit').disabled = false; }
  };
  element('room-leave').onclick = () => {
    if (writing) return;
    code = ''; revision = 0; offset = 0;
    try { sessionStorage.removeItem('rift-room-code'); } catch {}
    showMode(); onLeave(); dialog.close();
  };
  showMode();
  async function begin() {
    if (hosted && location.hash.length > 1) {
      try {
        const transfer = JSON.parse(decodeURIComponent(location.hash.slice(1)));
        history.replaceState(null, '', location.pathname);
        if (!/^[0-9]{6,32}$/.test(transfer.code)) return;
        const create = transfer.mode === 'create';
        await enter(transfer.code, create ? 'create' : 'read', TimerEngine.restore(transfer.state));
      } catch (error) { errorText.textContent = error.message; dialog.showModal(); }
    } else refresh();
  }
  setTimeout(begin, 0);
  setInterval(refresh, 1000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh(); });
  return { edit, clock, active:() => Boolean(code) };
}

