/* openface × No Judgment Gathering · ANNYEONG – door check-in (staff only)
 * Talks to the same Apps Script web app as the registration site (config.js → API_URL).
 * Nothing is ever admitted offline: if the server can't be reached the screen says NOT CHECKED. */
(function () {
'use strict';

const DOOR_VERSION = '2.10.0';
const DOOR_DATE = '15 Oct 2026';
const APP = window.APP_CONFIG || {};
const API_URL = String(APP.API_URL || '').trim();
const DEMO = /[?&]demo=1/.test(location.search) || !API_URL;
const PREFIX = 'ANN-';
const TOKEN_KEY = 'of_door_token_v1';
const HIST_KEY = 'of_door_hist_v1';

const $ = id => document.getElementById(id);
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const store = {
  get(k) { try { return JSON.parse(localStorage.getItem(k) || 'null'); } catch (e) { return null; } },
  set(k, v) { try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  del(k) { try { localStorage.removeItem(k); } catch (e) {} }
};
const rid = () => (window.crypto && crypto.randomUUID) ? crypto.randomUUID()
  : 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 12);

let session = store.get(TOKEN_KEY);           // { token, staff, expires, version }
let history = store.get(HIST_KEY) || [];
let backendVersion = '';

/* ================= API ================= */
class NetError extends Error {}
async function api(action, data, timeoutMs) {
  if (DEMO) return demoApi(action, data || {});
  if (!navigator.onLine) throw new NetError('offline');
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), timeoutMs || 20000);
  let r;
  try {
    r = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action, data: data || {} }), redirect: 'follow', signal: ctl.signal, cache: 'no-store' });
  } catch (e) {
    throw new NetError(e && e.name === 'AbortError' ? 'timeout' : 'network');
  } finally { clearTimeout(timer); }
  if (!r.ok) throw new NetError('http ' + r.status);
  let j;
  try { j = await r.json(); } catch (e) { throw new NetError('bad response'); }
  if (!j.ok) {
    const msg = String(j.error || 'Error');
    if (/^DOOR_AUTH/.test(msg)) { logout(msg.replace(/^DOOR_AUTH:\s*/, '')); throw new Error('AUTH'); }
    if (/Unknown action/.test(msg)) throw new Error('ระบบหลังบ้านยังเป็นเวอร์ชันเก่า (ยังไม่ได้ Deploy ใหม่) · Backend not updated – deploy a new version');
    throw new Error(msg);
  }
  return j.result;
}

/* ================= screens ================= */
function show(which) {
  $('login').classList.toggle('hidden', which !== 'login');
  $('main').classList.toggle('hidden', which !== 'main');
  $('logoutBtn').classList.toggle('hidden', which !== 'main');
  $('whoLine').classList.toggle('hidden', which !== 'main');
  if (which === 'main') {
    $('whoLine').textContent = 'เข้าสู่ระบบเป็น · Logged in as ' + session.staff;
    renderHistory();
    refreshStats();
    preloadJsQR();
  } else {
    stopCam();
    setTimeout(() => $('pin').focus(), 50);
  }
  renderVersion();
}

function validSession() { return session && session.token && Date.parse(session.expires) > Date.now(); }

function logout(msg) {
  session = null; store.del(TOKEN_KEY);
  closeRes();
  $('pin').value = '';
  $('loginErr').textContent = msg || '';
  show('login');
}

$('loginForm').addEventListener('submit', async e => {
  e.preventDefault();
  unlockAudio();
  const pin = $('pin').value.trim(), staff = $('staff').value.trim();
  if (!pin) return;
  const btn = $('loginBtn');
  btn.disabled = true; btn.textContent = 'กำลังเข้าสู่ระบบ…'; $('loginErr').textContent = '';
  try {
    const r = await api('doorLogin', { pin, staff });
    session = { token: r.token, staff: r.staff, expires: r.expires };
    backendVersion = r.version || '';
    store.set(TOKEN_KEY, session);
    try { localStorage.setItem('of_door_staff', staff); } catch (x) {}
    $('pin').value = '';
    if (r.stats) renderStats(r.stats);
    show('main');
  } catch (err) {
    $('loginErr').textContent = err instanceof NetError
      ? 'เชื่อมต่อไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่ · No connection – check the internet and try again'
      : err.message;
  } finally {
    btn.disabled = false; btn.textContent = 'เข้าสู่ระบบ · Log in';
  }
});
$('logoutBtn').onclick = () => { if (confirm('ออกจากระบบเครื่องนี้? · Log out this phone?')) logout(''); };

/* ================= stats ================= */
function renderStats(s) {
  if (!s) return;
  if (s.version && s.version !== backendVersion) { backendVersion = s.version; renderVersion(); }
  $('stIn').innerHTML = `${esc(s.inGuests)}<span> / ${esc(s.guests)}</span>`;
  $('stSub').innerHTML = `เข้างานแล้ว · guests in<br>${esc(s.inBookings)} / ${esc(s.bookings)} bookings`;
  $('stBar').style.width = (s.guests ? Math.min(100, Math.round(s.inGuests / s.guests * 100)) : 0) + '%';
}
let statsBusy = false;
async function refreshStats() {
  if (statsBusy || !validSession() || document.hidden) return;
  statsBusy = true;
  try { renderStats(await api('doorStats', { token: session.token }, 12000)); } catch (e) { /* shown by banner */ }
  finally { statsBusy = false; }
}
setInterval(refreshStats, 60000);

/* ================= network state ================= */
function renderNet() {
  const on = navigator.onLine;
  $('net').textContent = on ? 'ONLINE' : 'OFFLINE';
  $('net').classList.toggle('off', !on);
  $('offBar').classList.toggle('hidden', on);
}
window.addEventListener('online', () => { renderNet(); refreshStats(); });
window.addEventListener('offline', renderNet);

/* ================= check-in ================= */
let inFlight = false, pending = null;

/** Same rules as the server: "ann-7kq3xp", "7KQ3XP" or a scanned QR → "ANN-7KQ3XP"; '' if not a code. */
function normCode(raw) {
  const s = String(raw || '').toUpperCase().replace(/\s+/g, '').slice(0, 200);
  const m = s.match(/(?:^|[^A-Z0-9])ANN-?([A-Z0-9]{4,8})(?![A-Z0-9])/);
  if (m) return PREFIX + m[1];
  if (/^[A-Z0-9]{4,8}$/.test(s) && s.indexOf('ANN') !== 0) return PREFIX + s;
  return '';
}

async function checkIn(target, source) {
  if (inFlight) return;
  if (!validSession()) return logout('หมดเวลาเข้าสู่ระบบ · Session expired – log in again');
  pending = { data: Object.assign({ token: session.token, reqId: rid() }, target), source };
  await send();
}

async function send() {
  if (!pending || inFlight) return;
  inFlight = true; $('camBusy').classList.remove('hidden');
  if (pending.source === 'search' || resOpen) showRes('error', { busy: true });
  try {
    const r = await api('doorCheckIn', Object.assign({}, pending.data, { token: session.token }), 20000);
    renderStats(r.stats);
    addHistory(r);
    showResult(r);
    buzz(r.result === 'valid');
    pending = null;
  } catch (err) {
    if (err.message === 'AUTH') return;
    buzz(false);
    showRes('error', { net: err instanceof NetError, msg: err.message });
  } finally {
    inFlight = false; $('camBusy').classList.add('hidden');
  }
}

/* ================= result screen ================= */
let resOpen = false, lastClosedCode = '', lastClosedAt = 0;
function showResult(r) {
  const who = r.name ? `<div class="nm">${esc(r.name)}</div>` : '';
  const ids = (r.code || r.ref) ? `<div class="mono">${[r.code, r.ref].filter(Boolean).map(esc).join('<br>')}</div>` : '';
  const replay = r.replay ? '<div class="note">ผลจากการตรวจครั้งก่อน (ส่งซ้ำหลังสัญญาณหลุด) · Result of the earlier attempt</div>' : '';
  if (r.result === 'valid') {
    showRes('valid', { ico: '✓', h1: 'Valid', th: 'เข้างานได้',
      body: `<div class="admit">${esc(r.qty)}<small>ADMIT · ให้เข้า ${esc(r.qty)} ท่าน</small></div>${who}${ids}`
        + `<div class="note">ตรวจบัตรประชาชน 20+ ทุกท่าน · Check ID (20+) for every guest</div>${replay}` });
  } else if (r.result === 'already') {
    showRes('already', { ico: '!', h1: 'Already in', th: 'รหัสนี้ใช้เข้างานแล้ว',
      body: `${who}${ids}<div class="note">เช็คอินแล้วเมื่อ ${esc(r.at || '-')}${r.by ? ' · โดย ' + esc(r.by) : ''}<br>Checked in at ${esc(r.at || '-')}${r.by ? ' by ' + esc(r.by) : ''}<br>อย่าให้เข้าซ้ำ แจ้งหัวหน้าทีม · Don't admit – call the team lead</div>${replay}` });
  } else if (r.result === 'not_approved') {
    const st = { Pending: 'ยังรอตรวจสลิป · Payment still pending', Problem: 'การชำระเงินมีปัญหา · Payment problem', Cancelled: 'ยกเลิกแล้ว · Cancelled' }[r.status] || esc(r.status);
    showRes('not_approved', { ico: '✕', h1: 'Not approved', th: 'ยังไม่อนุมัติ',
      body: `${who}${ids}<div class="note">${st}<br>ส่งไปโต๊ะทีมงาน ตรวจสลิปกับบัญชี · Send to the team table to check payment</div>` });
  } else {
    showRes('not_found', { ico: '?', h1: 'Not found', th: 'ไม่พบรหัสนี้',
      body: `${r.input ? `<div class="mono">${esc(r.input)}</div>` : ''}<div class="note">${r.badFormat ? 'รูปแบบรหัสไม่ถูกต้อง · Not an entry code<br>' : ''}ลองพิมพ์รหัสอีกครั้ง หรือค้นหาด้วยชื่อ/เบอร์ · Re-type the code or search by name/phone</div>` });
  }
}

function showRes(kind, o) {
  const el = $('res');
  el.className = 'res ' + kind;
  if (kind === 'error') {
    if (o.busy) {
      el.innerHTML = '<div class="ico">…</div><h1>Checking</h1><div class="th">กำลังตรวจ…</div>';
    } else {
      el.innerHTML = '<div class="ico">⚠</div><h1>Not checked</h1><div class="th">ยังไม่ได้ตรวจ – อย่าเพิ่งให้เข้า</div>'
        + `<div class="note">${o.net
            ? 'สัญญาณหลุดหรือระบบตอบช้า กดลองอีกครั้ง (ไม่นับซ้ำ)<br>Connection problem – tap Retry (it won\'t double-count)'
            : esc(o.msg)}</div>`
        + '<div class="acts">' + (o.net ? '<button type="button" class="btn" data-a="retry">ลองอีกครั้ง · Retry</button>' : '')
        + '<button type="button" class="btn ghost" data-a="close">ยกเลิก · Cancel</button></div>';
    }
  } else if (kind === 'confirm') {
    el.innerHTML = o.body;
  } else {
    el.innerHTML = `<div class="ico">${o.ico}</div><h1>${esc(o.h1)}</h1><div class="th">${esc(o.th)}</div>${o.body}`
      + '<div class="acts"><button type="button" class="btn" data-a="close">ถัดไป · Next</button></div>';
  }
  el.classList.remove('hidden');
  resOpen = true;
  const b = el.querySelector('[data-a]'); if (b) setTimeout(() => b.focus(), 30);
}
function closeRes() {
  if (!resOpen) return;
  $('res').classList.add('hidden'); resOpen = false;
  lastClosedAt = Date.now();
  if (!pending) $('codeIn').value = '';
}
$('res').addEventListener('click', e => {
  const b = e.target.closest('[data-a]'); if (!b) return;
  const a = b.dataset.a;
  if (a === 'retry') send();
  else if (a === 'close') { pending = null; closeRes(); }
  else if (a === 'admit') { const ref = b.dataset.ref; closeRes(); checkIn({ ref }, 'search'); }
});
document.addEventListener('keydown', e => { if (resOpen && e.key === 'Escape' && !inFlight) { pending = null; closeRes(); } });

/* ================= typed code ================= */
$('codeForm').addEventListener('submit', e => {
  e.preventDefault();
  unlockAudio();
  const raw = $('codeIn').value;
  const code = normCode(raw);
  if (!code) { toast('รหัส 4–8 ตัว เช่น 7KQ3XP · Enter the code after ANN-'); return; }
  $('codeIn').blur();
  checkIn({ code }, 'typed');
});

/* ================= search ================= */
let lastResults = [];
$('searchForm').addEventListener('submit', async e => {
  e.preventDefault();
  const q = $('q').value.trim();
  if (q.length < 2) { $('searchErr').textContent = 'พิมพ์อย่างน้อย 2 ตัวอักษร · Type at least 2 characters'; return; }
  const btn = $('searchBtn');
  btn.disabled = true; btn.textContent = 'กำลังค้นหา…'; $('searchErr').textContent = '';
  try {
    const r = await api('doorSearch', { token: session.token, q }, 20000);
    lastResults = r.results || [];
    renderResults(r);
  } catch (err) {
    if (err.message === 'AUTH') return;
    $('searchErr').textContent = err instanceof NetError ? 'เชื่อมต่อไม่ได้ · No connection – try again' : err.message;
  } finally { btn.disabled = false; btn.textContent = 'ค้นหา · Search'; }
});
function statusTag(b) {
  if (b.status === 'Approved') return b.checkedIn ? `<span class="tag warn">เข้างานแล้ว ${esc(b.at)}</span>` : '<span class="tag ok">อนุมัติ · Approved</span>';
  const t = { Pending: 'รอตรวจ · Pending', Problem: 'มีปัญหา · Problem', Cancelled: 'ยกเลิก · Cancelled' }[b.status] || b.status;
  return `<span class="tag bad">${esc(t)}</span>`;
}
function renderResults(r) {
  const box = $('results');
  if (!lastResults.length) { box.innerHTML = '<p class="hint">ไม่พบ · No match</p>'; return; }
  box.innerHTML = lastResults.map((b, i) => {
    const can = b.status === 'Approved' && !b.checkedIn;
    return `<div class="item"><div class="who"><b>${esc(b.name)}</b>`
      + `<span class="meta">${statusTag(b)}${esc(b.qty)} ท่าน · ${esc(b.ref)}${b.phone ? ' · ' + esc(b.phone) : ''}${b.viaGuest ? ' · พบในรายชื่อผู้ร่วม' : ''}</span></div>`
      + (can ? `<button type="button" class="btn sm" data-pick="${i}">เช็คอิน</button>` : '') + '</div>';
  }).join('') + (r.more ? `<p class="hint">และอีก ${esc(r.more)} รายการ – พิมพ์ให้เจาะจงขึ้น · ${esc(r.more)} more, refine the search</p>` : '');
}
$('results').addEventListener('click', e => {
  const b = e.target.closest('[data-pick]'); if (!b) return;
  const g = lastResults[Number(b.dataset.pick)]; if (!g) return;
  unlockAudio();
  showRes('confirm', { body:
    `<h1 style="font-size:40px">Check in?</h1><div class="th">ยืนยันเช็คอิน</div><div class="nm">${esc(g.name)}</div>`
    + `<div class="admit">${esc(g.qty)}<small>ท่าน · guests</small></div><div class="mono">${esc(g.ref)}</div>`
    + '<div class="note">ตรวจบัตรประชาชนตรงกับชื่อผู้จอง และ 20+ ทุกท่าน<br>ID must match the booking name · everyone 20+</div>'
    + `<div class="acts"><button type="button" class="btn" data-a="admit" data-ref="${esc(g.ref)}">✓ เช็คอิน · Check in</button>`
    + '<button type="button" class="btn ghost" data-a="close">ยกเลิก · Cancel</button></div>' });
});

/* ================= history (this phone) ================= */
function addHistory(r) {
  history.unshift({ t: Date.now(), result: r.result, name: r.name || '', qty: r.qty || '', code: r.code || r.input || '', ref: r.ref || '' });
  history = history.slice(0, 40);
  store.set(HIST_KEY, history);
  renderHistory();
}
function renderHistory() {
  const lab = { valid: 'เข้างาน · Valid', already: 'ใช้แล้ว · Already in', not_approved: 'ไม่อนุมัติ · Not approved', not_found: 'ไม่พบ · Not found' };
  $('history').innerHTML = history.length ? history.slice(0, 15).map(h => {
    const t = new Date(h.t).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
    return `<div class="item"><span class="dot ${esc(h.result)}"></span><div class="who"><b>${esc(h.name || h.code || '-')}</b>`
      + `<span class="meta">${esc(t)} · ${esc(lab[h.result] || h.result)}${h.qty ? ' · ' + esc(h.qty) + ' ท่าน' : ''}${h.code && h.name ? ' · ' + esc(h.code) : ''}</span></div></div>`;
  }).join('') : '<p class="hint">ยังไม่มี · Nothing yet</p>';
}

/* ================= camera + QR ================= */
let stream = null, track = null, detector = null, scanTimer = 0, torchOn = false, wakeLock = null, wantCam = false;
const canvas = document.createElement('canvas');
const ctx = canvas.getContext('2d', { willReadFrequently: true });

function preloadJsQR() {
  if (window.jsQR || document.querySelector('script[data-jsqr]')) return;
  const s = document.createElement('script'); s.src = 'vendor/jsQR-1.4.0.js'; s.async = true; s.dataset.jsqr = '1';
  document.head.appendChild(s);
}
async function makeDetector() {
  if (!('BarcodeDetector' in window)) return null;
  try {
    const f = await window.BarcodeDetector.getSupportedFormats();
    return f.indexOf('qr_code') >= 0 ? new window.BarcodeDetector({ formats: ['qr_code'] }) : null;
  } catch (e) { return null; }
}
function camMsg(t) { $('camMsg').textContent = t; }

async function startCam() {
  unlockAudio();
  wantCam = true;
  if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
    camMsg('เบราว์เซอร์นี้เปิดกล้องไม่ได้ ใช้ช่องพิมพ์รหัสแทน · Camera not available here – type the code');
    return;
  }
  $('camBtn').disabled = true; camMsg('กำลังเปิดกล้อง…');
  try {
    stream = await navigator.mediaDevices.getUserMedia({ audio: false,
      video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } } });
    const v = $('video');
    v.srcObject = stream; v.setAttribute('playsinline', ''); v.muted = true;
    await v.play();
    track = stream.getVideoTracks()[0];
    detector = detector || await makeDetector();
    if (!detector) preloadJsQR();
    const caps = track.getCapabilities ? track.getCapabilities() : {};
    $('torchBtn').classList.toggle('hidden', !caps.torch);
    $('camIdle').classList.add('hidden'); $('frame').classList.remove('hidden'); $('laser').classList.remove('hidden');
    $('camBtn').textContent = 'ปิดกล้อง · Stop camera';
    keepAwake();
    loop();
  } catch (e) {
    wantCam = false;
    camMsg(e && e.name === 'NotAllowedError'
      ? 'ไม่ได้รับอนุญาตใช้กล้อง เปิดสิทธิ์กล้องในการตั้งค่าเบราว์เซอร์ · Camera blocked – allow it in browser settings'
      : 'เปิดกล้องไม่ได้ · Could not start the camera (' + (e && e.name || e) + ')');
  } finally { $('camBtn').disabled = false; }
}
function stopCam(keepWish) {
  if (!keepWish) wantCam = false;
  clearTimeout(scanTimer);
  if (stream) stream.getTracks().forEach(t => t.stop());
  stream = null; track = null; torchOn = false;
  $('video').srcObject = null;
  $('camIdle').classList.remove('hidden'); $('frame').classList.add('hidden'); $('laser').classList.add('hidden');
  $('torchBtn').classList.add('hidden');
  $('camBtn').textContent = 'เปิดกล้อง · Start camera';
  camMsg('กดเปิดกล้องด้านล่าง');
  if (wakeLock) { try { wakeLock.release(); } catch (e) {} wakeLock = null; }
}
$('camBtn').onclick = () => (stream ? stopCam() : startCam());
$('torchBtn').onclick = async () => {
  if (!track) return;
  try { torchOn = !torchOn; await track.applyConstraints({ advanced: [{ torch: torchOn }] }); } catch (e) { torchOn = false; }
};
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { if (stream) stopCam(true); }
  else { if (wantCam && validSession()) startCam(); refreshStats(); }
});
async function keepAwake() {
  try { if ('wakeLock' in navigator && !wakeLock) wakeLock = await navigator.wakeLock.request('screen'); } catch (e) {}
}

let lastBadQr = '', lastBadAt = 0;
async function loop() {
  if (!stream) return;
  const v = $('video');
  if (!resOpen && !inFlight && v.readyState >= 2) {
    let text = '';
    try {
      if (detector) {
        const codes = await detector.detect(v);
        text = codes && codes[0] ? codes[0].rawValue : '';
      } else if (window.jsQR) {
        const vw = v.videoWidth, vh = v.videoHeight, side = Math.min(vw, vh) * 0.8;      // centre square = the frame
        const size = 480;
        canvas.width = size; canvas.height = size;
        ctx.drawImage(v, (vw - side) / 2, (vh - side) / 2, side, side, 0, 0, size, size);
        const c = window.jsQR(ctx.getImageData(0, 0, size, size).data, size, size, { inversionAttempts: 'attemptBoth' });
        text = c ? c.data : '';
      }
    } catch (e) { /* frame not ready */ }
    if (text) onScan(text);
  }
  scanTimer = setTimeout(loop, detector ? 90 : 140);
}
function onScan(text) {
  const code = normCode(text);
  if (!code) {
    if (text !== lastBadQr || Date.now() - lastBadAt > 4000) {
      lastBadQr = text; lastBadAt = Date.now();
      toast('QR นี้ไม่ใช่รหัสเข้างาน · Not an entry-code QR');
    }
    return;
  }
  // the guest's phone is often still in front of the camera after "Next" – ignore the same code for a moment
  if (code === lastClosedCode && Date.now() - lastClosedAt < 4000) return;
  lastClosedCode = code;
  checkIn({ code }, 'scan');
}

/* ================= feedback ================= */
let audio = null;
function unlockAudio() {
  if (audio) return;
  try { audio = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { audio = null; }
}
function tone(freq, start, dur) {
  if (!audio) return;
  const o = audio.createOscillator(), g = audio.createGain();
  o.type = 'square'; o.frequency.value = freq;
  g.gain.setValueAtTime(0.0001, audio.currentTime + start);
  g.gain.exponentialRampToValueAtTime(0.25, audio.currentTime + start + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, audio.currentTime + start + dur);
  o.connect(g); g.connect(audio.destination);
  o.start(audio.currentTime + start); o.stop(audio.currentTime + start + dur + 0.02);
}
function buzz(ok) {
  try { if (audio && audio.state === 'suspended') audio.resume(); } catch (e) {}
  if (ok) { tone(1320, 0, 0.09); tone(1760, 0.11, 0.12); } else { tone(220, 0, 0.35); }
  if (navigator.vibrate) navigator.vibrate(ok ? 80 : [200, 80, 200]);
}
let toastTimer = 0;
function toast(msg) {
  document.querySelectorAll('.toast').forEach(n => n.remove());
  const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t);
  clearTimeout(toastTimer); toastTimer = setTimeout(() => t.remove(), 2600);
}

/* ================= version ================= */
const parts = v => String(v || '').split('.').map(n => parseInt(n, 10) || 0);
const sameMinor = (a, b) => parts(a).slice(0, 2).join('.') === parts(b).slice(0, 2).join('.');
function renderVersion() {
  const mode = DEMO ? 'DEMO' : 'LIVE';
  let be = '';
  if (!DEMO && backendVersion) be = sameMinor(backendVersion, DOOR_VERSION) ? ` · backend v${esc(backendVersion)} ✓` : ` · <span class="warn">backend v${esc(backendVersion)} ⚠</span>`;
  $('verLine').innerHTML = `<b>door v${DOOR_VERSION}</b> · ${DOOR_DATE} · ${mode}${be}`;
}

/* ================= demo backend (?demo=1, or no API_URL) ================= */
const demo = { checked: {}, list: [
  { ref: 'OF-HW26-0001', code: 'ANN-DEMO01', name: 'Somchai K.', phone: '0812345671', qty: 2, status: 'Approved' },
  { ref: 'OF-HW26-0002', code: 'ANN-DEMO02', name: 'Mina P.', phone: '0898765432', qty: 1, status: 'Pending' },
  { ref: 'OF-HW26-0003', code: 'ANN-DEMO03', name: 'Jisoo L.', phone: '0861112223', qty: 4, status: 'Approved' },
  { ref: 'OF-HW26-0004', code: '', name: 'Nok S.', phone: '0855556667', qty: 3, status: 'Problem' }] };
function demoStats() {
  const ap = demo.list.filter(b => b.status === 'Approved');
  const inn = ap.filter(b => demo.checked[b.ref]);
  return { bookings: ap.length, guests: ap.reduce((s, b) => s + b.qty, 0), inBookings: inn.length, inGuests: inn.reduce((s, b) => s + b.qty, 0) };
}
async function demoApi(action, d) {
  await new Promise(r => setTimeout(r, 450));
  if (action === 'doorLogin') {
    if (String(d.pin) !== '123456') throw new Error('PIN ไม่ถูกต้อง / Wrong PIN (demo: 123456)');
    return { token: 'demo', staff: (d.staff || 'Door').slice(0, 24), expires: new Date(Date.now() + 14 * 3600000).toISOString(), version: DOOR_VERSION, stats: demoStats() };
  }
  if (action === 'doorStats') return demoStats();
  if (action === 'doorSearch') {
    const q = String(d.q).toLowerCase();
    const res = demo.list.filter(b => (b.name + b.phone + b.ref).toLowerCase().indexOf(q) >= 0).map(b => ({
      ref: b.ref, name: b.name, phone: '•••' + b.phone.slice(-4), qty: b.qty, status: b.status,
      checkedIn: !!demo.checked[b.ref], at: demo.checked[b.ref] ? demo.checked[b.ref].at : '', by: '' }));
    return { results: res, more: 0 };
  }
  if (action === 'doorCheckIn') {
    const b = demo.list.filter(x => (d.code && x.code === d.code) || (d.ref && x.ref === d.ref))[0];
    if (!b) return { result: 'not_found', input: d.code || d.ref, stats: demoStats() };
    const o = { ref: b.ref, code: b.code, name: b.name, qty: b.qty, status: b.status };
    if (b.status !== 'Approved') o.result = 'not_approved';
    else if (demo.checked[b.ref]) Object.assign(o, { result: 'already' }, demo.checked[b.ref]);
    else {
      demo.checked[b.ref] = { at: new Date().toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' }) + ' · 31 Oct', by: session ? session.staff : 'Door' };
      Object.assign(o, { result: 'valid' }, demo.checked[b.ref]);
    }
    o.stats = demoStats();
    return o;
  }
  throw new Error('Unknown action');
}

/* ================= start ================= */
if (DEMO) $('demoBar').classList.remove('hidden');
try { $('staff').value = localStorage.getItem('of_door_staff') || ''; } catch (e) {}
renderNet();
if (validSession() && !(DEMO && session.token !== 'demo') && !(!DEMO && session.token === 'demo')) show('main');
else { session = null; store.del(TOKEN_KEY); show('login'); }
})();
