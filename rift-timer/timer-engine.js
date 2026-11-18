(function (root) {
  'use strict';
  const spells = [
    { id: 'SummonerFlash', name: '闪现', en: 'FLASH', seconds: 300 },
    { id: 'SummonerTeleport', name: '传送', en: 'TELEPORT', seconds: 300 },
    { id: 'SummonerDot', name: '引燃', en: 'IGNITE', seconds: 180 },
    { id: 'SummonerSmite', name: '惩戒', en: 'SMITE', seconds: 15, note: '两次施放间隔' },
    { id: 'SummonerHeal', name: '治疗术', en: 'HEAL', seconds: 240 },
    { id: 'SummonerBarrier', name: '屏障', en: 'BARRIER', seconds: 180 },
    { id: 'SummonerExhaust', name: '虚弱', en: 'EXHAUST', seconds: 240 },
    { id: 'SummonerBoost', name: '净化', en: 'CLEANSE', seconds: 240 },
    { id: 'SummonerHaste', name: '幽灵疾步', en: 'GHOST', seconds: 240 },
  ];
  const roles = [
    { name: '上单', en: 'TOP', icon: 'top', second: 'SummonerTeleport' },
    { name: '打野', en: 'JUNGLE', icon: 'jungle', second: 'SummonerSmite' },
    { name: '中单', en: 'MID', icon: 'middle', second: 'SummonerDot' },
    { name: '射手', en: 'BOT', icon: 'bottom', second: 'SummonerBarrier' },
    { name: '辅助', en: 'SUPPORT', icon: 'utility', second: 'SummonerExhaust' },
  ];
  const findSpell = id => spells.find(spell => spell.id === id);
  const freshSlot = spellId => ({ spellId, endAt: null, alerted: false });
  const defaults = () => ({ version: 1, loadout: [0,0,0,0,0], settings: { autoDeduct: 0, lead: 0, sound: true, voice: false }, slots: roles.flatMap(role => [freshSlot('SummonerFlash'), freshSlot(role.second)]) });
  function restore(raw, now = Date.now()) {
    const state = defaults();
    if (!raw || raw.version !== 1) return state;
    if (Array.isArray(raw.loadout) && raw.loadout.length===5) state.loadout=raw.loadout.map(mask=>Number.isInteger(mask)&&mask>=0&&mask<=15&&(mask&3)!==3?mask:0);
    if (raw.settings) {
      if(Number.isInteger(raw.settings.autoDeduct)&&raw.settings.autoDeduct>=0&&raw.settings.autoDeduct<=300)state.settings.autoDeduct=raw.settings.autoDeduct;
      if (Number.isInteger(raw.settings.lead) && raw.settings.lead >= 0 && raw.settings.lead <= 600) state.settings.lead = raw.settings.lead;
      for (const k of ['sound', 'voice']) if (typeof raw.settings[k] === 'boolean') state.settings[k] = raw.settings[k];
    }
    if (Array.isArray(raw.slots) && raw.slots.length === 10) {
      state.slots = raw.slots.map((slot, i) => {
        if (!slot || !findSpell(slot.spellId)) return state.slots[i];
        const endAt = typeof slot.endAt === 'number' && Number.isFinite(slot.endAt) && slot.endAt > 0 && slot.endAt <= now + findSpell(slot.spellId).seconds * 1000 ? slot.endAt : null;
        return { spellId: slot.spellId, endAt, alerted: slot.alerted === true };
      });
      for (let i = 0; i < 10; i += 2) if (state.slots[i].spellId === state.slots[i + 1].spellId) {
        state.slots[i + 1] = freshSlot(spells.find(s => s.id !== state.slots[i].spellId).id);
      }
    }
    return state;
  }
  function remaining(slot, now) { return slot.endAt === null ? 0 : Math.max(0, Math.ceil((slot.endAt - now) / 1000)); }
  function haste(mask){return ((mask&2)?20:(mask&1)?10:0)+((mask&4)?18:0);}
  function durationMs(id,mask){return id==='SummonerSmite'?15000:Math.round(findSpell(id).seconds*100000/(100+haste(mask)));}
  function record(state,index,now){return start(state.slots[index],now,state.loadout?.[index>>1]||0,state.settings.autoDeduct||0);}
  function configure(state,role,mask,now){
    if(!state.loadout)state.loadout=[0,0,0,0,0];const old=state.loadout[role];state.loadout[role]=mask;
    for(let i=role*2;i<role*2+2;i++){const slot=state.slots[i];if(remaining(slot,now)>0)slot.endAt=Math.max(now,slot.endAt+durationMs(slot.spellId,mask)-durationMs(slot.spellId,old));}
  }
  function start(slot, now, mask=0, debit=0) {
    if (remaining(slot, now) > 0) return false;
    slot.endAt = now + Math.max(0,durationMs(slot.spellId,mask)-debit*1000);
    slot.alerted = false;
    return true;
  }
  function reset(slot) { slot.endAt = null; slot.alerted = false; }
  function select(state, index, id) {
    if (!findSpell(id) || state.slots[index ^ 1].spellId === id) return false;
    state.slots[index] = freshSlot(id);
    return true;
  }
  function advance(state, now) {
    const events = [];
    state.slots.forEach((slot, index) => {
      if (slot.endAt !== null && !slot.alerted && now >= slot.endAt - state.settings.lead * 1000) {
        slot.alerted = true;
        events.push({ index, spellId: slot.spellId, remaining: remaining(slot, now) });
      }
    });
    return events;
  }
  const format = seconds => `${String(Math.floor(Math.max(0, seconds) / 60)).padStart(2, '0')}:${String(Math.max(0, seconds) % 60).padStart(2, '0')}`;
  const api = { haste,durationMs,record,configure,spells, roles, findSpell, defaults, restore, remaining, start, reset, select, advance, format };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.TimerEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
