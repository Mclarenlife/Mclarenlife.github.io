'use strict';
(() => {
  const E = window.TimerEngine;
  const $ = id => document.getElementById(id);
  const flashImage = "data:image/png;base64,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";
  const spellImage = id => id === "SummonerFlash" ? flashImage : `assets/lol/${id}.png`;
  const STORAGE_KEY = 'rift-timer-v1';
  const iconPaths = {
    settings: '<path d="m9 3 .8-2h4.4l.8 2 2 .9 2.1-.3 2.2 3.8-1.3 1.7v2.3l1.3 1.7-2.2 3.8-2.1-.3-2 .9-.8 2H9l-.8-2-2-.9-2.1.3L1.9 15l1.3-1.7V11L1.9 9.3l2.2-3.8 2.1.3L8.2 5Z" transform="translate(1 1) scale(.9)"/><circle cx="12" cy="12" r="3"/>',
    reset: '<path d="M3 10a9 9 0 1 1 2 8M3 4v6h6"/>',
    bell: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4M12 1v1"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    mouse: '<rect x="6" y="2" width="12" height="20" rx="6"/><path d="M12 2v7"/>',
    close: '<path d="m6 6 12 12M18 6 6 18"/>',
    volume: '<path d="m11 4-5 4H2v8h4l5 4ZM15 8a6 6 0 0 1 0 8m3-12a11 11 0 0 1 0 16"/>',
    check: '<path d="m5 12 4 4L19 6"/>',
    chevron: '<path d="m6 9 6 6 6-6"/>',
    play: '<path d="m8 5 11 7-11 7Z"/>',
    clock: '<circle cx="12" cy="13" r="8"/><path d="M9 1h6m-3 0v4m0 3v5l3 2"/>',
    info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6m0-10v.1"/>',
  };
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true">${iconPaths[name] || ''}</svg>`;
  document.querySelectorAll('[data-icon]').forEach(node => { node.innerHTML = icon(node.dataset.icon); });
  let storageWorks = true;
  let state;
  try { state = E.restore(JSON.parse(localStorage.getItem(STORAGE_KEY))); } catch { state = E.defaults(); }
  const rooms = connectRooms({
    getState: () => state,
    setState: next => { state = next; buildBoard(); renderSettingsSummary(); tick(); },
    tell: message => toast(message),
    onLeave: () => { try { state = E.restore(JSON.parse(localStorage.getItem(STORAGE_KEY))); } catch { state = E.defaults(); } buildBoard(); renderSettingsSummary(); tick(); }
  });
  let adjustIndex = 0;
  function save() {
    if (rooms.active()) return;
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); storageWorks = true; }
    catch { storageWorks = false; }
    $('storage-status').textContent = storageWorks ? '本地自动保存' : '无法保存 · 请保持页面打开';
  }
  let audioContext;
  function unlockAudio() {
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      if (!audioContext) audioContext = new Audio();
      if (audioContext.state === 'suspended') audioContext.resume().catch(() => {});
    } catch { /* The visual reminder stays available when audio is unavailable. */ }
  }
  function playSound() {
    unlockAudio();
    if (!audioContext) return false;
    try {
      [660, 880].forEach((frequency, i) => {
        const oscillator = audioContext.createOscillator();
        const gain = audioContext.createGain();
        const at = audioContext.currentTime + i * .19;
        oscillator.type = 'sine';
        oscillator.frequency.value = frequency;
        gain.gain.setValueAtTime(0, at);
        gain.gain.linearRampToValueAtTime(.12, at + .015);
        gain.gain.exponentialRampToValueAtTime(.001, at + .30);
        oscillator.connect(gain); gain.connect(audioContext.destination);
        oscillator.start(at); oscillator.stop(at + .32);
        oscillator.onended = () => { oscillator.disconnect(); gain.disconnect(); };
      });
      return true;
    } catch { return false; }
  }
  function speak(message) {
    if (!('speechSynthesis' in window)) return false;
    const utterance = new SpeechSynthesisUtterance(message);
    utterance.lang = 'zh-CN'; utterance.rate = 1.05;
    window.speechSynthesis.speak(utterance);
    return true;
  }
  function toast(title, message = '', spellId) {
    const node = document.createElement('div'); node.className = 'toast';
    if (spellId) { const img = document.createElement('img'); img.src = `assets/lol/${spellId}.png`; img.alt = ''; node.append(img); }
    const copy = document.createElement('div');
    const heading = document.createElement('strong'); heading.textContent = title; copy.append(heading);
    if (message) { const p = document.createElement('p'); p.textContent = message; copy.append(p); }
    const close = document.createElement('button'); close.className = 'icon-button'; close.ariaLabel = '关闭提醒'; close.innerHTML = icon('close'); close.onclick = () => node.remove();
    node.append(copy, close); $('toasts').append(node);
    while ($('toasts').children.length > 4) $('toasts').firstElementChild.remove();
    setTimeout(() => node.remove(), 12000);
  }
  const history = [];
  function renderHistory() {
    $('alert-count').textContent = history.length;
    $('clear-alerts').disabled = !history.length;
    $('alert-list').replaceChildren();
    if (!history.length) { const p = document.createElement('p'); p.className = 'empty-alert'; p.textContent = '暂无提醒。技能进入提醒时间后，记录会显示在这里。'; $('alert-list').append(p); return; }
    history.forEach(entry => {
      const line = document.createElement('div'); line.className = 'alert-entry';
      const img = document.createElement('img'); img.src = `assets/lol/${entry.spellId}.png`; img.alt = '';
      const label = document.createElement('span'); label.textContent = entry.title;
      const note = document.createElement('span'); note.className = 'entry-note'; note.textContent = entry.message;
      const time = document.createElement('time'); time.dateTime = new Date(entry.at).toISOString(); time.textContent = new Date(entry.at).toLocaleTimeString('zh-CN', { hour12: false, hour: '2-digit', minute: '2-digit', second: '2-digit' });
      line.append(img, label, note, time); $('alert-list').append(line);
    });
  }
  function deliver(events, now) {
    if (!events.length) return;
    save(); // Persist the one-shot flag before presenting the reminder.
    const speech = [];
    for (const event of events) {
      const title = `${E.roles[Math.floor(event.index / 2)].name} · ${E.findSpell(event.spellId).name}`;
      const message = event.remaining > 0 ? `${event.remaining} 秒后就绪` : '技能已就绪';
      toast(title, message, event.spellId);
      history.unshift({ title, message, spellId: event.spellId, at: now });
      speech.push(`${title.replace(' · ', '，')}，${message}`);
    }
    history.splice(30); renderHistory();
    if (state.settings.sound) playSound();
    if (state.settings.voice) speak(speech.join('。'));
  }
  let slotNodes = [];
  function buildBoard() {
    $('role-grid').innerHTML = E.roles.map((role, roleIndex) => `<article class="role-card" aria-label="${role.name}">
      <div class="role-header"><div class="role-emblem"><img src="assets/lol/${role.icon}.svg" alt="${role.name}位置图标"></div><div><h3>${role.name}</h3><small>${role.en}</small></div></div>
      ${[0, 1].map(slotIndex => {
        const index = roleIndex * 2 + slotIndex; const spell = E.findSpell(state.slots[index].spellId);
        return `<div class="spell-slot" data-slot="${index}"><button class="spell-picker" data-select="${index}" aria-label="更换${role.name}技能${slotIndex + 1}：${spell.name}" aria-haspopup="dialog"><img src="${spellImage(spell.id)}" alt=""><span><strong>${spell.name}</strong><small>${spell.en}</small></span><span class="chevron">${icon('chevron')}</span></button><div class="timer-line"><span class="timer-value">${E.format(spell.seconds)}</span><button class="adjust-time" data-adjust="${index}" aria-label="调整${role.name}${spell.name}的剩余时间" title="扣减计时">${icon('arrow')}</button></div><div class="timer-caption">${spell.note || '基础冷却'} ${spell.seconds} 秒</div><div class="progress" aria-hidden="true"><span></span></div><div class="timer-actions"><button class="start-timer" data-start="${index}" aria-label="开始${role.name}${spell.name}计时">${icon('play')}<span>开始计时</span></button><button class="reset-timer" data-reset="${index}" aria-label="重置${role.name}${spell.name}计时" title="重置此计时">${icon('reset')}</button></div></div>`;
      }).join('')}</article>`).join('');
    slotNodes = Array.from(document.querySelectorAll('.spell-slot')).map(el => ({ el, time: el.querySelector('.timer-value'), progress: el.querySelector('.progress>span'), start: el.querySelector('.start-timer'), startLabel: el.querySelector('.start-timer>span'), reset: el.querySelector('.reset-timer') }));
    updateDisplay(rooms.clock());
  }
  function updateDisplay(now) {
    let active = 0; let next = null;
    state.slots.forEach((slot, index) => {
      const node = slotNodes[index]; const spell = E.findSpell(slot.spellId);
      const left = E.remaining(slot, now); const running = left > 0;
      const soon = running && left <= 60;
      node.el.classList.toggle('running', running); node.el.classList.toggle('soon', soon);
      const shownTime = E.format(running ? left : spell.seconds);
      if (node.time.textContent !== shownTime) node.time.textContent = shownTime;
      node.progress.style.width = `${!running ? 100 : Math.min(100, left / spell.seconds * 100)}%`;
      node.start.disabled = running; node.startLabel.textContent = running ? '计时中' : '开始计时';
      node.reset.disabled = !running;
      if (running) { active++; if (!next || left < next.left) next = { left, index, spell }; }
    });
    $('active-count').textContent = active;
    $('next-time').textContent = next ? E.format(next.left) : '--:--';
    $('next-label').textContent = next ? `${E.roles[Math.floor(next.index / 2)].name} · ${next.spell.name}` : '等待开始计时';
    document.title = active ? `${active} 个技能冷却中 · RIFT TIMER` : 'RIFT TIMER · 召唤师技能计时';
  }
  function tick() { const now = rooms.clock(); deliver(E.advance(state, now), now); updateDisplay(now); }
  let selectedIndex = 0;
  function openSpell(index) {
    selectedIndex = index;
    const current = state.slots[index].spellId; const other = state.slots[index ^ 1].spellId;
    $('spell-context').textContent = `${E.roles[Math.floor(index / 2)].name} · 技能 ${index % 2 + 1} / 当前：${E.findSpell(current).name}`;
    $('spell-options').innerHTML = E.spells.map(spell => `<button class="spell-option ${spell.id === current ? 'selected' : ''}" data-spell="${spell.id}" ${spell.id === other ? 'disabled' : ''} aria-pressed="${spell.id === current}"><img src="${spellImage(spell.id)}" alt=""><strong>${spell.name}</strong><small>${spell.id === other ? '另一技能已选' : `${spell.seconds} 秒`}</small></button>`).join('');
    $('spell-dialog').showModal();
  }
  $('role-grid').addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.hasAttribute('data-select')) openSpell(Number(button.dataset.select));
    if (button.hasAttribute('data-adjust')) {
      adjustIndex = Number(button.dataset.adjust);
      const slot = state.slots[adjustIndex];
      $('adjust-info').textContent = E.roles[Math.floor(adjustIndex / 2)].name + ' · ' + E.findSpell(slot.spellId).name + (E.remaining(slot, rooms.clock()) ? '，立即扣减剩余时间。' : '，从扣减后的时间开始计时。');
      $('adjust-dialog').showModal();
    }
    if (button.hasAttribute('data-start')) { unlockAudio(); rooms.edit(() => { E.start(state.slots[Number(button.dataset.start)], rooms.clock()); save(); tick(); }); }
    if (button.hasAttribute('data-reset')) { rooms.edit(() => { E.reset(state.slots[Number(button.dataset.reset)]); save(); tick(); }); }
  });
  $('adjust-dialog').addEventListener('click', event => {
    const button = event.target.closest('[data-seconds]');
    if (!button) return;
    const index = adjustIndex;
    unlockAudio();
    rooms.edit(() => {
      const now = rooms.clock();
      const slot = state.slots[index];
      if (!E.remaining(slot, now)) E.start(slot, now);
      slot.endAt = Math.max(now, slot.endAt - Number(button.dataset.seconds) * 1000);
      save(); tick();
    });
    $('adjust-dialog').close();
  });
  $('spell-options').addEventListener('click', event => {
    const button = event.target.closest('[data-spell]'); if (!button || button.disabled) return;
    if (button.dataset.spell !== state.slots[selectedIndex].spellId) { rooms.edit(() => { E.select(state, selectedIndex, button.dataset.spell); save(); buildBoard(); }); }
    $('spell-dialog').close(); document.querySelector(`[data-select="${selectedIndex}"]`).focus();
  });
  function renderSettingsSummary() {
    const lead = state.settings.lead;
    $('reminder-summary').textContent = lead === 0 ? '技能就绪时提醒' : `技能就绪前 ${lead % 60 === 0 ? `${lead / 60} 分钟` : `${lead} 秒`}提醒`;
    $('reminder-detail').textContent = `页面提醒 · 提示音${state.settings.sound ? '开启' : '关闭'}${state.settings.voice ? ' · 语音播报开启' : ''}`;
  }
  function setCustomVisibility() {
    const custom = new FormData($('settings-form')).get('lead') === 'custom';
    $('custom-wrap').hidden = !custom; $('custom-seconds').disabled = !custom; $('custom-seconds').required = custom;
  }
  function openSettings() {
    const lead = state.settings.lead;
    document.querySelector(`input[name="lead"][value="${[0, 30, 60].includes(lead) ? lead : 'custom'}"]`).checked = true;
    $('custom-seconds').value = [0, 30, 60].includes(lead) ? 90 : lead;
    $('sound-setting').checked = state.settings.sound; $('voice-setting').checked = state.settings.voice;
    setCustomVisibility(); $('settings-dialog').showModal();
  }
  document.querySelectorAll('[data-open-settings]').forEach(button => button.addEventListener('click', openSettings));
  document.querySelectorAll('input[name="lead"]').forEach(input => input.addEventListener('change', setCustomVisibility));
  $('settings-form').addEventListener('submit', async event => {
    event.preventDefault(); const value = new FormData(event.currentTarget).get('lead');
    const lead = Number(value === 'custom' ? $('custom-seconds').value : value);
    if (!Number.isInteger(lead) || lead < 0 || lead > 600) return;
    if (!await rooms.edit(() => { state.settings = { lead, sound: $('sound-setting').checked, voice: $('voice-setting').checked }; })) return;
    unlockAudio(); save(); renderSettingsSummary(); $('settings-dialog').close();
    toast(storageWorks ? '设置已保存' : '设置已应用，当前浏览器无法保存', '新的提醒时间已应用到尚未提醒的计时。'); tick();
  });
  $('test-alert').addEventListener('click', () => {
    unlockAudio(); const sound = $('sound-setting').checked; const voice = $('voice-setting').checked;
    const soundOk = !sound || playSound(); const voiceOk = !voice || speak('上单，闪现，技能已就绪');
    toast('测试提醒 · 上单闪现', !soundOk || !voiceOk ? '当前浏览器不支持所选声音方式，页面提醒可正常使用。' : (!sound && !voice ? '声音已关闭，仍会显示页面提醒。' : '正在试听所选提醒方式。'), 'SummonerFlash');
  });
  document.querySelectorAll('[data-close]').forEach(button => button.addEventListener('click', () => $(button.dataset.close).close()));
  document.querySelectorAll('dialog').forEach(dialog => dialog.addEventListener('click', event => {
    if (event.target !== dialog) return;
    const rect = dialog.getBoundingClientRect();
    if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
  }));
  $('reset-all').onclick = () => $('reset-dialog').showModal();
  $('confirm-reset').onclick = async () => {
    if (!await rooms.edit(() => state.slots.forEach(E.reset))) return;
    history.length = 0; $('toasts').replaceChildren();
    if ('speechSynthesis' in window) window.speechSynthesis.cancel();
    save(); tick(); renderHistory(); $('reset-dialog').close(); toast('已重置本局', '技能选择与提醒偏好已保留。');
  };
  $('clear-alerts').onclick = () => { history.length = 0; renderHistory(); };
  $('about-button').onclick = () => $('about-dialog').showModal();
  $('cooldown-table').innerHTML = E.spells.map(spell => `<div class="cooldown-row"><img src="${spellImage(spell.id)}" alt=""><span>${spell.name}${spell.note ? ` · ${spell.note}` : ''}</span><strong>${spell.seconds} s</strong></div>`).join('');
  window.addEventListener('storage', event => {
    if (rooms.active() || event.key !== STORAGE_KEY) return;
    try { state = E.restore(JSON.parse(event.newValue)); buildBoard(); renderSettingsSummary(); tick(); } catch { /* Ignore malformed state from other tabs. */ }
  });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) tick(); });
  window.addEventListener('pageshow', () => tick());
  buildBoard(); renderSettingsSummary(); renderHistory(); save(); tick();
  setInterval(tick, 250);
})();
