/* =====================================================================
 *  openface slip pre-screen  ·  reads a Thai bank slip (Thai or English)
 *  from OCR text + the slip's verification QR, and checks:
 *    amount · receiver (openface K SHOP) · transfer time · duplicate key
 *  It is a HELPER for the guest – the team still approves every payment
 *  by hand against the bank statement.
 *  Works in the browser (window.SlipCheck) and in Node (module.exports).
 * ===================================================================== */
(function (root) {
  'use strict';

  /* ---------- Thai / English dates ---------- */
  const TH_MONTHS = [
    ['มกราคม', 'มค'], ['กุมภาพันธ์', 'กพ'], ['มีนาคม', 'มีค'], ['เมษายน', 'เมย'], ['พฤษภาคม', 'พค'], ['มิถุนายน', 'มิย'],
    ['กรกฎาคม', 'กค'], ['สิงหาคม', 'สค'], ['กันยายน', 'กย'], ['ตุลาคม', 'ตค'], ['พฤศจิกายน', 'พย'], ['ธันวาคม', 'ธค']
  ];
  const EN_MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const THAI_DIGITS = '๐๑๒๓๔๕๖๗๘๙';

  function cleanText(t) {
    return String(t || '')
      .replace(/[๐-๙]/g, d => String(THAI_DIGITS.indexOf(d)))
      .replace(/\u0e4d\u0e32/g, '\u0e33')                   // OCR writes ำ as ํ + า
      .replace(/\r/g, '')
      .replace(/[“”"']/g, '')
      .replace(/[ \t]+/g, ' ');
  }

  /** Remove Thai vowel/tone marks OCR often confuses, spaces and punctuation. */
  function skeleton(s) {
    return String(s || '').toLowerCase()
      .replace(/[ัิ-ฺ็-๎]/g, '')
      .replace(/[^a-z0-9฀-๿]/g, '');
  }

  function levenshtein(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n; if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
      const cur = [i];
      for (let j = 1; j <= n; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
    return prev[n];
  }

  /** Is `needle` (approximately) inside `hay`? Both already skeletonised. */
  function fuzzyContains(hay, needle) {
    if (!needle) return false;
    if (hay.indexOf(needle) >= 0) return true;
    const tol = needle.length >= 8 ? 2 : needle.length >= 5 ? 1 : 0;
    if (!tol) return false;
    for (let L = needle.length - tol; L <= needle.length + tol; L++) {
      for (let i = 0; i + L <= hay.length; i++) if (levenshtein(hay.substr(i, L), needle) <= tol) return true;
    }
    return false;
  }

  function monthFromToken(tok) {
    const k = skeleton(tok).replace(/\./g, '');
    if (!k) return -1;
    for (let i = 0; i < 12; i++) {
      const full = skeleton(TH_MONTHS[i][0]), ab = skeleton(TH_MONTHS[i][1]);
      if (k === ab || k === full || (k.length >= 4 && fuzzyContains(full, k))) return { m: i, th: true };
    }
    for (let i = 0; i < 12; i++) if (k.slice(0, 3) === EN_MONTHS[i]) return { m: i, th: false };
    return -1;
  }

  function toYear(y, thaiMonth) {
    let n = parseInt(y, 10);
    if (isNaN(n)) return null;
    if (n >= 2400) return n - 543;                     // Buddhist year 2569
    if (n >= 1900) return n;                          // 2026
    if (n < 100) {                                    // 69 (BE) or 26 (CE)
      const be = 2500 + n - 543, ce = 2000 + n;
      const now = new Date().getFullYear();
      if (thaiMonth) return Math.abs(be - now) <= 1 ? be : ce;
      return Math.abs(ce - now) <= 1 ? ce : be;
    }
    return null;
  }

  /** Bangkok local time → Date */
  function bkk(y, mo, d, hh, mm, ss) {
    return new Date(Date.UTC(y, mo, d, (hh || 0) - 7, mm || 0, ss || 0));
  }

  function parseTime(text) {
    const t = cleanText(text);
    const tm = t.match(/(?:^|[^\d])([01]?\d|2[0-3])\s?[:.]\s?([0-5]\d)(?:\s?[:.]\s?([0-5]\d))?(?!\d)/);
    const time = tm ? { hh: +tm[1], mm: +tm[2], ss: tm[3] ? +tm[3] : 0 } : null;
    if (time && /^\s*(pm|p\.m\.)/i.test(t.slice(tm.index + tm[0].length)) && time.hh < 12) time.hh += 12;   // 08:15 PM
    if (time && /^\s*(am|a\.m\.)/i.test(t.slice(tm.index + tm[0].length)) && time.hh === 12) time.hh = 0;
    // 1) "14 ต.ค. 2569" / "14 Oct 2026" / "14 ต.ค. 69" / "Oct 14, 2026"
    const words = /(\d{1,2})[ \t]*([A-Za-z\u0e00-\u0e7f][A-Za-z\u0e00-\u0e7f. \t]{1,14}?)[ \t]*,?[ \t]*(\d{4}|\d{2})(?!\d)/g;
    let m, best = null;
    while ((m = words.exec(t))) {
      const mon = monthFromToken(m[2]);
      if (mon === -1) { words.lastIndex = m.index + 1; continue; }
      const y = toYear(m[3], mon.th);
      const d = +m[1];
      if (y && d >= 1 && d <= 31) { best = { y, mo: mon.m, d }; break; }
    }
    if (!best) {
      const en = t.match(/([A-Za-z]{3,9})\.?\s+(\d{1,2}),?\s+(\d{4})/);
      if (en) { const mon = monthFromToken(en[1]); if (mon !== -1) best = { y: toYear(en[3], false), mo: mon.m, d: +en[2] }; }
    }
    // 2) "14/10/2026", "14-10-69"
    if (!best) {
      const num = t.match(/(?:^|[^\d])(\d{1,2})[\/\-.](\d{1,2})[\/\-.](\d{4}|\d{2})(?!\d)/);
      if (num && +num[2] >= 1 && +num[2] <= 12) best = { y: toYear(num[3], true), mo: +num[2] - 1, d: +num[1] };
    }
    if (!best) {
      const iso = t.match(/(20\d{2}|25\d{2})[\/\-.](\d{1,2})[\/\-.](\d{1,2})(?!\d)/);   // 2026-10-14
      if (iso && +iso[2] >= 1 && +iso[2] <= 12) best = { y: toYear(iso[1], false), mo: +iso[2] - 1, d: +iso[3] };
    }
    if (!best || !best.y) return null;
    const date = bkk(best.y, best.mo, best.d, time ? time.hh : 12, time ? time.mm : 0, time ? time.ss : 0);
    return { date, hasTime: !!time };
  }

  /* ---------- Amount ---------- */
  const AMOUNT_KEYS = /(จ[ำา]นวน(?:เงิน)?|ยอด(?:เงิน|ชำระ|โอน|รวม)?|amount|total|thb|บาท|baht)/i;
  const NOT_AMOUNT = /(ค่าธรรมเนียม|fee|คงเหลือ|balance|available|วงเงิน|limit|เลขที่|ref|รหัส|id|account|บัญชี|xxx)/i;

  function moneyIn(line) {
    const out = [];
    const re = /(\d{1,3}(?:[,\s]\d{3})+|\d+)[.,](\d{2})(?!\d)/g;
    let m;
    while ((m = re.exec(line))) {
      const v = parseFloat(m[1].replace(/[,\s]/g, '') + '.' + m[2]);
      if (!isNaN(v)) out.push(v);
    }
    return out;
  }

  function parseAmount(text, expected) {
    const lines = cleanText(text).split('\n');
    const keyed = [], loose = [];
    lines.forEach((ln, i) => {
      const vals = moneyIn(ln);
      if (!vals.length) {
        // amount often sits on the line under "จำนวนเงิน"/"Amount"
        return;
      }
      const prev = lines[i - 1] || '';
      const isKey = AMOUNT_KEYS.test(ln) || (AMOUNT_KEYS.test(prev) && !moneyIn(prev).length);
      const isNot = NOT_AMOUNT.test(ln) && !/จ[ำา]นวนเงิน|amount/i.test(ln);
      vals.forEach(v => { if (v > 0) (isKey && !isNot ? keyed : isNot ? [] : loose).push(v); });
    });
    const eq = v => Math.abs(v - expected) < 0.005;
    if (keyed.some(eq) || (!keyed.length && loose.some(eq))) return { value: expected, match: true };
    if (keyed.length) return { value: keyed[0], match: false };
    if (loose.some(eq)) return { value: expected, match: true };
    if (loose.length === 1) return { value: loose[0], match: false, weak: true };
    return null;
  }

  /* ---------- Receiver ---------- */
  function parseReceiver(text, cfg) {
    const t = cleanText(text);
    const sk = skeleton(t);
    const names = (cfg.NAME_KEYWORDS || []).map(skeleton).filter(Boolean);
    const nameHit = names.some(n => fuzzyContains(sk, n));
    // shop codes: "รหัสร้านค้า : KB000002299567" – OCR may read KB as 8/K8/RB
    // keep only the significant digits: "KB000002299567" / OCR "48000002299567" / "8000001803690" → "2299567"
    const sig = d => { d = String(d).replace(/\D/g, ''); const m = d.match(/0{3,}([1-9]\d{4,9})$/); return m ? m[1] : d.replace(/^0+/, ''); };
    const ours = (cfg.SHOP_CODES || []).map(sig);
    const codeRe = /(?:ร้านค้า|merchant|shop)[^\n\d]{0,25}([A-Z8]{0,3}\s?\d[\d\s]{6,16})/gi;
    let m, codes = [];
    while ((m = codeRe.exec(t))) codes.push(sig(m[1]));
    (t.match(/\b(?:KB|K8|8B|48)\s?0{3,}\d{5,9}\b/gi) || []).forEach(x => codes.push(sig(x)));
    codes = codes.filter(c => c.length >= 6);
    const codeHit = codes.some(c => ours.indexOf(c) >= 0);
    const otherCode = codes.find(c => ours.indexOf(c) < 0);
    // receiver line: "ไปยัง X", "To X", "ผู้รับ X", "ชื่อบัญชี X"
    const rl = t.split('\n').map(s => s.trim()).find(s => /^(ไปยัง|ไปที่|ถึง|ผู้รับ(?:เงิน)?|to|receiver|payee|ชื่อร้าน)(?=[\s:]|$)/i.test(s));
    const recvName = rl ? rl.replace(/^(ไปยัง|ไปที่|ถึง|ผู้รับ(?:เงิน)?|to|receiver|payee|ชื่อร้าน)\s*[:\-]?\s*/i, '').replace(/[^฀-๿A-Za-z0-9 .]/g, '').trim() : '';
    if (codeHit || (nameHit && !otherCode)) return { ok: true, name: recvName, code: codeHit ? 'shop code' : '' };
    if (otherCode) return { ok: false, name: recvName, otherCode: otherCode };
    if (recvName && skeleton(recvName).length >= 6 && !nameHit) return { ok: false, name: recvName };
    return null;   // can't tell
  }

  /* ---------- Thai slip verification QR (mini-QR) ---------- */
  function parseTLV(s) {
    const out = {}; let i = 0;
    while (i + 4 <= s.length) {
      const id = s.substr(i, 2), n = parseInt(s.substr(i + 2, 2), 10);
      if (isNaN(n)) break;
      out[id] = s.substr(i + 4, n); i += 4 + n;
    }
    return out;
  }
  const BANKS = { '002': 'BBL', '004': 'KBank', '006': 'KTB', '011': 'ttb', '014': 'SCB', '025': 'Krungsri', '030': 'GSB',
                  '034': 'BAAC', '069': 'KKP', '022': 'CIMB', '024': 'UOB', '067': 'TISCO', '073': 'LH Bank', '033': 'GH Bank' };
  /** "0046 0006000001 0103014 0225<transRef> 5102TH 9104xxxx" → { bank, transRef } */
  function parseSlipQR(qr) {
    const s = String(qr || '').trim();
    if (!/^00\d{2}0006000001/.test(s)) return null;
    const top = parseTLV(s), inner = parseTLV(top['00'] || '');
    if (!inner['02']) return null;
    return { bankCode: inner['01'] || '', bank: BANKS[inner['01']] || inner['01'] || '', transRef: inner['02'] };
  }

  function parseRef(text) {
    const m = cleanText(text).match(/(?:รหัสอ้างอิง|เลขที่รายการ|เลขที่อ้างอิง|หมายเลขอ้างอิง|transaction\s*(?:id|no\.?|ref(?:erence)?)|ref(?:erence)?\s*(?:no\.?|id)?)\s*[:.]?\s*([A-Za-z0-9]{10,40})/i);
    return m ? m[1] : '';
  }

  /* ---------- The checker ---------- */
  const fmt = n => Number(n).toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
  const fmtTime = d => {
    const p = n => String(n).padStart(2, '0');
    const b = new Date(d.getTime() + 7 * 3600e3);
    return p(b.getUTCDate()) + '/' + p(b.getUTCMonth() + 1) + '/' + b.getUTCFullYear() + ' ' + p(b.getUTCHours()) + ':' + p(b.getUTCMinutes());
  };

  /**
   * analyze(ocrText, qrText, { qty, price, cfg, now })
   * cfg: { SHOP_CODES, NAME_KEYWORDS, SHOP_NAME, NOT_BEFORE, MAX_AGE_HOURS, CONTACT }
   * → { status: 'good'|'unsure'|'bad', checks:[{key,ok,label,fix}], suggestQty, slip:{...}, transRef }
   */
  function analyze(ocrText, qrText, o) {
    const cfg = o.cfg || {}, qty = o.qty, price = o.price, now = o.now || new Date();
    const expected = qty * price;
    const qr = parseSlipQR(qrText);
    const checks = [];
    let suggestQty = null;

    // amount
    const a = parseAmount(ocrText, expected);
    if (!a) checks.push({ key: 'amount', ok: null, label: 'อ่านยอดเงินในสลิปไม่ชัด · Amount unreadable',
                          fix: 'ไม่เป็นไร ทีมงานจะตรวจยอดให้ (ยอดที่ต้องโอน ' + fmt(expected) + ' ฿)' });
    else if (a.match) checks.push({ key: 'amount', ok: true, label: 'ยอดเงินถูกต้อง ' + fmt(expected) + ' ฿ · Amount OK' });
    else {
      if (a.value > 0 && Math.abs(a.value / price - Math.round(a.value / price)) < 1e-6 && Math.round(a.value / price) >= 1)
        suggestQty = Math.round(a.value / price);
      checks.push({ key: 'amount', ok: a.weak ? null : false,
        label: 'ยอดในสลิป ' + fmt(a.value) + ' ฿ ไม่ตรงกับยอดที่ต้องโอน ' + fmt(expected) + ' ฿ · Amount differs',
        fix: suggestQty ? 'ถ้าโอนสำหรับ ' + suggestQty + ' ท่าน กด "เปลี่ยนเป็น ' + suggestQty + ' ท่าน" ด้านล่าง'
           : a.value < expected ? 'โอนส่วนที่ขาด ' + fmt(expected - a.value) + ' ฿ ด้วย QR เดิม แล้วอีเมลสลิปทั้งสองใบถึงทีมงาน ' + (cfg.CONTACT || '')
           : 'ตรวจจำนวนผู้เข้าร่วม หรืออีเมลทีมงาน ' + (cfg.CONTACT || '') });
    }

    // receiver
    const r = parseReceiver(ocrText, cfg);
    const shop = cfg.SHOP_NAME || 'openface';
    if (!r) checks.push({ key: 'receiver', ok: null, label: 'อ่านชื่อผู้รับเงินไม่ชัด · Receiver unreadable',
                          fix: 'ตรวจว่าผู้รับคือ "' + shop + '" แล้วส่งได้เลย ทีมงานจะตรวจให้' });
    else if (r.ok) checks.push({ key: 'receiver', ok: true, label: 'โอนเข้า ' + shop + ' ถูกต้อง · Paid to openface' });
    else checks.push({ key: 'receiver', ok: false,
      label: 'สลิปนี้โอนให้ "' + (r.name || (r.otherCode ? 'ร้านค้าอื่น' : 'ผู้รับอื่น')) + '" ไม่ใช่ ' + shop + ' · Wrong receiver',
      fix: 'ตรวจว่าแนบสลิปถูกใบ หรือชำระใหม่ด้วย QR บนหน้านี้ หากโอนผิดบัญชีกรุณาติดต่อธนาคารของคุณ' });

    // a wrong receiver makes the "top up the difference" advice wrong – keep it simple
    if (r && !r.ok) checks.forEach(c => { if (c.key === 'amount' && c.ok === false) c.fix = 'ยอดที่ต้องโอนคือ ' + fmt(expected) + ' ฿ ผ่าน QR บนหน้านี้'; });

    // time
    const tp = parseTime(ocrText);
    if (!tp) checks.push({ key: 'time', ok: null, label: 'อ่านวันเวลาโอนไม่ชัด · Date unreadable', fix: 'ทีมงานจะตรวจให้' });
    else {
      const t = tp.date, notBefore = cfg.NOT_BEFORE ? new Date(cfg.NOT_BEFORE) : null;
      const maxAge = (cfg.MAX_AGE_HOURS || 48) * 3600e3;
      const slack = tp.hasTime ? 15 * 60e3 : 24 * 3600e3;
      const when = tp.hasTime ? fmtTime(t) : fmtTime(t).slice(0, 10);
      if (t.getTime() > now.getTime() + slack)
        checks.push({ key: 'time', ok: false, label: 'วันที่ในสลิป ' + when + ' อยู่ในอนาคต · Date in the future', fix: 'ตรวจว่าแนบสลิปถูกใบ' });
      else if (notBefore && t.getTime() < notBefore.getTime() - slack)
        checks.push({ key: 'time', ok: false, label: 'สลิปวันที่ ' + when + ' ก่อนเปิดลงทะเบียน · Too early', fix: 'กรุณาแนบสลิปที่โอนสำหรับงานนี้' });
      else if (now.getTime() - t.getTime() > maxAge + slack)
        checks.push({ key: 'time', ok: false, label: 'สลิปเก่า (' + when + ') · Older than ' + (cfg.MAX_AGE_HOURS || 48) + ' h',
                      fix: 'ถ้าเพิ่งโอนจริง กรุณาแนบสลิปล่าสุด ถ้าโอนไว้นานแล้ว ส่งให้ทีมงานตรวจได้' });
      else checks.push({ key: 'time', ok: true, label: 'เวลาโอน ' + when + ' น. · Time OK' });
    }

    // duplicate (needs the slip QR – the server answers whether it was used)
    if (qr) checks.push({ key: 'duplicate', ok: undefined, label: 'ตรวจว่าสลิปนี้ยังไม่เคยใช้…', pending: true });
    else checks.push({ key: 'duplicate', ok: null, label: 'อ่าน QR บนสลิปไม่ได้ · Slip QR unreadable',
                       fix: 'ใช้รูปสลิปเต็มใบจากแอปธนาคาร (ไม่ครอป) จะตรวจได้ครบกว่า หรือส่งได้เลย ทีมงานจะตรวจให้' });

    return {
      checks, suggestQty,
      transRef: qr ? qr.transRef : '',
      slip: { amount: a ? a.value : null, time: tp ? fmtTime(tp.date) : '', receiver: r ? r.name : '', bank: qr ? qr.bank : '',
              ref: (qr && qr.transRef) || parseRef(ocrText) }
    };
  }

  /** Overall verdict once every check (incl. duplicate) is known. */
  function verdict(checks) {
    if (checks.some(c => c.key === 'duplicate' && c.ok === false)) return 'blocked';
    if (checks.some(c => c.ok === false)) return 'bad';
    if (checks.some(c => c.ok !== true)) return 'unsure';
    return 'good';
  }

  /** One line for the admin's "Auto Check" column. */
  function summary(res, verdictStr, confirmed) {
    const mark = c => c.ok === true ? '✓' : c.ok === false ? '✕' : '?';
    return 'Pre-screen on guest phone (OCR, not proof): ' + res.checks.map(c => c.key + ' ' + mark(c)).join(' · ')
      + (res.slip.amount != null ? ' · read ' + fmt(res.slip.amount) + ' THB' : '')
      + (res.slip.time ? ' · ' + res.slip.time : '') + (res.slip.bank ? ' · ' + res.slip.bank : '')
      + (verdictStr === 'bad' && confirmed ? ' · guest says slip is correct' : '');
  }

  const api = { analyze, verdict, summary, parseSlipQR, parseTime, parseAmount, parseReceiver, parseRef, skeleton, fuzzyContains };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.SlipCheck = api;
})(typeof self !== 'undefined' ? self : this);
