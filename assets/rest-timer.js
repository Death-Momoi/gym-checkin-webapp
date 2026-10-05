/* Timestamp-based local timer, shared by pages in this project. */
(function () {
  'use strict';
  const KEY = 'gym-rest-timer-v1:' + new URL('.', location.href).pathname;
  const defaults = () => ({ version: 1, duration: 90, remaining: 90000, deadline: null, state: 'idle', sound: false });
  let data = defaults(), storageError = '', audio;
  function load() {
    try {
      const value = JSON.parse(localStorage.getItem(KEY) || 'null');
      if (value && value.version === 1 && ['idle', 'running', 'paused', 'done'].includes(value.state) &&
          Number.isInteger(value.duration) && value.duration >= 5 && value.duration <= 3600 &&
          Number.isFinite(value.remaining) && value.remaining >= 0 && value.remaining <= 3600000 &&
          (value.deadline === null || (Number.isFinite(value.deadline) && value.deadline > 0)) &&
          (value.state !== 'running' || value.deadline !== null)) {
        data = { ...value, sound: value.sound === true }; return;
      }
      data = defaults();
    } catch { storageError = '瀏覽器無法讀取計時設定；倒數僅在本頁有效。'; }
  }
  function persist() {
    try { localStorage.setItem(KEY, JSON.stringify(data)); storageError = ''; }
    catch { storageError = '計時狀態未能存入手機；離開或重整可能重設倒數。'; }
  }
  function remaining() { return data.state === 'running' ? Math.max(0, data.deadline - Date.now()) : data.remaining; }
  function format(ms) { const s = Math.ceil(ms / 1000); return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`; }
  function unlockAudio() {
    if (!data.sound) return;
    try {
      const Audio = window.AudioContext || window.webkitAudioContext;
      if (!Audio) return;
      audio ||= new Audio();
      audio.resume().catch(() => {});
    } catch { /* Visual completion remains available. */ }
  }
  function beep() {
    if (!data.sound || !audio || audio.state !== 'running' || document.hidden) return;
    try {
      for (let i = 0; i < 3; i++) {
        const oscillator = audio.createOscillator(), gain = audio.createGain();
        oscillator.connect(gain); gain.connect(audio.destination); oscillator.frequency.value = 740;
        const start = audio.currentTime + i * 0.3;
        gain.gain.setValueAtTime(0, start); gain.gain.linearRampToValueAtTime(0.13, start + 0.02);
        gain.gain.linearRampToValueAtTime(0, start + 0.18);
        oscillator.start(start); oscillator.stop(start + 0.2);
      }
    } catch { /* Sound is best effort on mobile browsers. */ }
  }
  function emit() { document.dispatchEvent(new CustomEvent('rest-timer-change', { detail: snapshot() })); renderMini(); }
  function snapshot() { return { ...data, remaining: remaining(), formatted: format(remaining()), storageError }; }
  function tick() {
    if (data.state === 'running' && remaining() <= 0) {
      data.state = 'done'; data.remaining = 0; data.deadline = null; persist(); beep();
    }
    emit();
  }
  function setDuration(seconds) {
    if (!Number.isInteger(seconds) || seconds < 5 || seconds > 3600) throw new Error('休息秒數請填 5～3600 的整數。');
    data.duration = seconds; data.remaining = seconds * 1000; data.deadline = null; data.state = 'idle'; persist(); emit();
  }
  function start(fresh = false) {
    if (!fresh && data.state === 'running') return;
    const ms = !fresh && ['paused', 'idle'].includes(data.state) ? data.remaining : data.duration * 1000;
    data.remaining = ms; data.deadline = Date.now() + ms; data.state = 'running'; unlockAudio(); persist(); emit();
  }
  function pause() {
    if (data.state !== 'running') return;
    data.remaining = remaining(); data.deadline = null; data.state = data.remaining > 0 ? 'paused' : 'done'; persist(); emit();
  }
  function add() {
    if (data.state === 'done') { data.remaining = 15000; data.state = 'paused'; }
    else data.remaining = Math.min(3600000, remaining() + 15000);
    if (data.state === 'running') data.deadline = Date.now() + data.remaining;
    persist(); emit();
  }
  function reset() { setDuration(data.duration); }
  function sound(enabled) { data.sound = enabled; unlockAudio(); persist(); emit(); }
  function renderMini() {
    if (document.body?.dataset.page === 'training') return;
    let mini = document.getElementById('rest-mini');
    if (!mini) {
      mini = document.createElement('aside'); mini.id = 'rest-mini'; mini.className = 'rest-mini';
      mini.setAttribute('aria-label', '組間休息計時器');
      const link = document.createElement('a'); link.href = './training.html';
      const button = document.createElement('button'); button.type = 'button'; button.className = 'secondary-button';
      button.addEventListener('click', () => data.state === 'running' ? pause() : data.state === 'done' ? reset() : start());
      mini.append(link, button); document.body.append(mini);
    }
    const active = data.state !== 'idle'; mini.hidden = !active;
    document.body.classList.toggle('has-rest-mini', active);
    mini.querySelector('a').textContent = data.state === 'done' ? '✓ 休息結束' : `休息 ${format(remaining())}${data.state === 'paused' ? ' · 已暫停' : ''}`;
    mini.querySelector('button').textContent = data.state === 'running' ? '暫停' : data.state === 'done' ? '收起' : '繼續';
  }
  load();
  window.RestTimer = { snapshot, setDuration, start, pause, add, reset, sound, unlockAudio };
  window.addEventListener('storage', event => { if (event.key === KEY || event.key === null) { load(); tick(); } });
  document.addEventListener('visibilitychange', () => { if (!document.hidden) { load(); tick(); } });
  document.addEventListener('DOMContentLoaded', () => { tick(); setInterval(tick, 250); });
})();
