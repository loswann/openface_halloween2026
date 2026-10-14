/**
 * openface – ANYONG SPOOKY HALLOWEEN NIGHT (31 Oct 2026)
 * Backend API for the Vercel registration site: Google Sheet + Drive slips + emails + SlipOK slip checker.
 *
 * Values marked  // TODO  still need your input. Run setup() once after pasting.
 * Slip checker API key goes in Project Settings → Script properties → SLIPOK_API_KEY (never in code).
 */

const CONFIG = {
  BRAND:            'openface',
  EVENT_NAME:       'ANYONG SPOOKY HALLOWEEN NIGHT',
  THEME:            'Korean Halloween in Bangkok',
  EVENT_DATE:       'เสาร์ 31 ต.ค. 2026 · Sat 31 Oct 2026',
  EVENT_TIME:       'ลงทะเบียน 22:00 · DJ 22:30 – 01:30',
  SCHEDULE:         [['22:00', 'ลงทะเบียน · Registration'], ['22:30', 'DJ ขึ้น · DJ up'], ['01:30', 'ปิดงาน · Till 01:30']],
  VENUE:            'openface · 86/2 ถ.รามคำแหง 21 (ซ.นวศรี 15) แขวงพลับพลา เขตวังทองหลาง กรุงเทพฯ',
  MAP_URL:          'https://share.google/kdPgH8cJINAYblTop',
  PRICE_PER_PERSON: 1200,          // THB
  PRICE_INCLUDES:   'Free-flow alcohol & small bites',
  DRESS_CODE:       'Korean Halloween in Bangkok',
  MIN_AGE:          20,
  MAX_PER_BOOKING:  50,            // "no max" – kept at 50 only as a typo guard
  CAPACITY:         0,             // 0 = unlimited
  CLOSE_AT:         '',            // no deadline

  // Payment – openface K SHOP (KBank) Thai QR, decoded from the shop's QR image.
  // The page re-issues this QR with the exact amount filled in (guests × price).
  PAY_QR_PAYLOAD:   '00020101021130810016A00000067701011201150107536000315010214KB0000022995670320KPS004KB00000229956731690016A00000067701011301030040214KB0000022995670420KPS004KB00000229956753037645802TH63044D15',
  PROMPTPAY_ID:     '',            // not used while PAY_QR_PAYLOAD is set
  SHOP_NAME:        'โอเพ่น เฟซ',
  BANK_NAME:        'กสิกรไทย (K SHOP)',
  ACCOUNT_NAME:     'บจก. โอเพ่น คิทเช่น',
  ACCOUNT_NO:       '',            // K SHOP pays by QR only – leave blank to hide the account-number row
  PAY_REF:          'KPS004KB000002299567',

  // Automatic slip checker (SlipOK – verifies the slip's QR against real bank data)
  SLIP_CHECK: {
    ENABLED:          true,
    SLIPOK_BRANCH_ID: '',          // TODO from SlipOK dashboard (API key → Script properties SLIPOK_API_KEY)
    // How we recognise YOUR account on the slip (banks mask most digits, e.g. xxx-x-x1234-x):
    // From the K SHOP QR. Confirm with a 1 THB test transfer what the slip actually shows as receiver.
    RECEIVER_ACCOUNT_DIGITS: ['2299567', '010753600031501'],   // K SHOP ref / biller ID
    RECEIVER_NAME_KEYWORDS:  ['โอเพ่นคิทเช่น', 'โอเพ่นเฟซ', 'openkitchen', 'openface'],
    NOT_BEFORE:       '2026-09-28T00:00:00+07:00',  // slips older than registration opening are rejected
    MAX_AGE_HOURS:    48,          // slip must be from the last 48 h
    AUTO_CONFIRM:     true         // all 4 checks pass → Status "Confirmed" + confirmation email instantly
  },

  CONTACT_LINE:     '@openfacebkk',
  LINE_URL:         'https://lin.ee/9pQIgO3',
  CONTACT_PHONE:    '082-556-3659',
  IG_URL:           'https://www.instagram.com/openfacebkk/',
  ADMIN_EMAIL:      'openfacebkk@gmail.com',
  REFUND_POLICY:    'ไม่รับยกเลิกและไม่คืนเงินทุกกรณี · No cancellation, no refund',
  HOUSE_RULES:      'ผู้เข้าร่วมต้องอายุ 20 ปีขึ้นไป (ตรวจบัตรหน้างาน) · งดเด็กและสัตว์เลี้ยงสำหรับงานนี้ · 20+ only (ID check at the door) · No kids, no pets',

  SEND_EMAIL:       true,
  SLIP_FOLDER_ID:   '',
  SPREADSHEET_ID:   '128yKL_9i4V_-R6YXYeiU3kYDy_uKV57sGoe0DQKAr8k',   // openface Halloween Google Sheet
  SHEET_NAME:       'Registrations',
  ID_PREFIX:        'OF-HW26-'
};

const HEADERS = [
  'Timestamp', 'Registration ID', 'Full Name', 'Phone', 'Email', 'LINE ID',
  'Attendees', 'Guest Names', 'Parking', 'Amount (THB)',
  'Slip Amount', 'Slip Time', 'Sender', 'Sender Bank', 'Receiver on Slip', 'Trans Ref', 'Verification',
  'Slip Link', 'Notes', 'Status', 'Admin Remark'
];
const COL = name => HEADERS.indexOf(name) + 1;
const TZ = 'Asia/Bangkok';

/* ---------- Web app ---------- */

/* ---------- JSON API for the Vercel site ----------
 * The page on Vercel POSTs {action, data} as text/plain (no CORS preflight) to this
 * web app's /exec URL and gets {ok, result} or {ok:false, error} back.             */

const API = {
  getConfig:          () => getConfig(),
  verifySlip:         d  => verifySlip(d),
  recheckSlip:        d  => recheckSlip(d.token, d.qty),
  submitRegistration: d  => submitRegistration(d)
};

function doPost(e) {
  let out;
  try {
    const body = e && e.postData && e.postData.contents;
    if (!body || body.length > 6 * 1024 * 1024) throw new Error('คำขอไม่ถูกต้อง / Bad request');
    const req = JSON.parse(body);
    const fn = API[req.action];
    if (!fn) throw new Error('Unknown action');
    out = { ok: true, result: fn(req.data || {}) };
  } catch (err) {
    out = { ok: false, error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

// Opening the /exec URL in a browser just confirms the API is alive.
function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, service: CONFIG.BRAND + ' registration API', event: CONFIG.EVENT_NAME }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getConfig() {
  const c = JSON.parse(JSON.stringify(CONFIG));
  delete c.ADMIN_EMAIL; delete c.SLIP_FOLDER_ID; delete c.SHEET_NAME; delete c.SPREADSHEET_ID; delete c.SEND_EMAIL; delete c.SLIP_CHECK;
  c.SLIP_CHECK_ON = slipCheckReady_();
  c.SEATS_TAKEN = countSeats_();
  c.CLOSED = isClosed_();
  return c;
}

/* ======================================================================
 *  SLIP CHECKER
 *  verifySlip  – called the moment the customer picks a slip image
 *  recheckSlip – re-evaluates a cached slip when the guest count changes (no extra API call)
 * ====================================================================== */

function verifySlip(req) {
  const qty = clampQty_(req && req.qty);
  if (!slipCheckReady_()) {
    return { status: 'unavailable', canManual: true,
      title: 'ระบบตรวจสลิปอัตโนมัติยังไม่เปิดใช้', message: 'ส่งสลิปให้ทีมงานตรวจแทนได้เลยค่ะ' };
  }
  let body;
  try {
    body = callSlipOk_(req);
  } catch (e) {
    console.warn('SlipOK call failed: ' + e);
    return { status: 'unavailable', canManual: true,
      title: 'ระบบตรวจสลิปขัดข้องชั่วคราว', message: 'ไม่ต้องกังวล ส่งสลิปให้ทีมงานตรวจแทนได้เลยค่ะ' };
  }
  if (!body || !body.success || !body.data || body.data.success === false) {
    return mapSlipOkError_(body);
  }
  const slip = normalizeSlip_(body.data);
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put('slip_' + token, JSON.stringify(slip), 1800); // 30 min
  const ev = evaluateSlip_(slip, qty);
  ev.token = token;
  return ev;
}

function recheckSlip(token, qty) {
  const slip = getCachedSlip_(token);
  if (!slip) return { status: 'expired', canManual: false,
    title: 'หมดเวลาตรวจสลิป', message: 'กรุณาแนบสลิปอีกครั้งนะคะ' };
  const ev = evaluateSlip_(slip, clampQty_(qty));
  ev.token = token;
  return ev;
}

function callSlipOk_(req) {
  const key = PropertiesService.getScriptProperties().getProperty('SLIPOK_API_KEY');
  const url = 'https://api.slipok.com/api/line/apikey/' + encodeURIComponent(CONFIG.SLIP_CHECK.SLIPOK_BRANCH_ID);
  let options;
  if (req.qr) {
    options = { method: 'post', contentType: 'application/json', headers: { 'x-authorization': key },
                payload: JSON.stringify({ data: String(req.qr) }), muteHttpExceptions: true };
  } else if (req.image) {
    const b64 = String(req.image).split(',').pop();
    const blob = Utilities.newBlob(Utilities.base64Decode(b64), req.mime || 'image/jpeg', 'slip.jpg');
    options = { method: 'post', headers: { 'x-authorization': key }, payload: { files: blob }, muteHttpExceptions: true };
  } else {
    throw new Error('no slip data');
  }
  const res = UrlFetchApp.fetch(url, options);
  return JSON.parse(res.getContentText());
}

function mapSlipOkError_(body) {
  const code = body && (body.code || (body.data && body.data.code));
  const map = {
    1007: { status: 'noqr', canManual: true, retry: false,
            title: 'อ่าน QR บนสลิปไม่ได้',
            message: 'กรุณาใช้รูปสลิปต้นฉบับที่บันทึกจากแอปธนาคาร (ไม่ครอป ไม่ถ่ายหน้าจอด้วยกล้อง) แล้วแนบใหม่อีกครั้ง' },
    1011: { status: 'notfound', canManual: true, retry: true,
            title: 'ธนาคารยังไม่พบรายการนี้',
            message: 'ถ้าเพิ่งโอน อาจใช้เวลา 1–2 นาที กด "ตรวจอีกครั้ง" ได้เลย หรือตรวจว่าแนบสลิปถูกใบ' },
    1009: { status: 'unavailable', canManual: true, retry: true,
            title: 'ระบบธนาคารขัดข้องชั่วคราว', message: 'ลองตรวจอีกครั้งในอีกสักครู่ หรือส่งให้ทีมงานตรวจแทนได้ค่ะ' }
  };
  if (map[code]) return map[code];
  console.warn('SlipOK error ' + code + ': ' + JSON.stringify(body));   // 1002–1004 = key/package/quota
  return { status: 'unavailable', canManual: true, retry: false,
           title: 'ระบบตรวจสลิปขัดข้องชั่วคราว', message: 'ไม่ต้องกังวล ส่งสลิปให้ทีมงานตรวจแทนได้เลยค่ะ' };
}

function normalizeSlip_(d) {
  const sender = d.sender || {}, receiver = d.receiver || {};
  let t;
  if (d.transTimestamp) t = new Date(d.transTimestamp);
  if (!t || isNaN(t)) {
    const ds = String(d.transDate || ''), tm = String(d.transTime || '00:00:00');
    t = new Date(ds.slice(0, 4) + '-' + ds.slice(4, 6) + '-' + ds.slice(6, 8) + 'T' + tm + '+07:00');
  }
  const acc = [receiver.account && receiver.account.value, receiver.proxy && receiver.proxy.value]
    .filter(Boolean).join(' / ');
  return {
    transRef: String(d.transRef || ''),
    amount: Number(d.amount) || 0,
    time: isNaN(t) ? '' : t.toISOString(),
    senderName: sender.displayName || sender.name || '',
    senderBank: bankName_(d.sendingBank),
    receiverName: receiver.displayName || receiver.name || '',
    receiverAccount: acc,
    receiverBank: bankName_(d.receivingBank)
  };
}

function evaluateSlip_(slip, qty) {
  const sc = CONFIG.SLIP_CHECK, price = CONFIG.PRICE_PER_PERSON;
  const expected = qty * price;
  const checks = [];

  // 1) Amount
  const amountOk = Math.abs(slip.amount - expected) < 0.01;
  let suggestQty = null;
  if (!amountOk && slip.amount > 0 && slip.amount % price === 0 && slip.amount / price <= CONFIG.MAX_PER_BOOKING) {
    suggestQty = slip.amount / price;
  }
  checks.push({ key: 'amount', ok: amountOk,
    label: amountOk ? 'ยอดเงินถูกต้อง ' + fmt_(expected) + ' ฿'
                    : 'ยอดในสลิป ' + fmt_(slip.amount) + ' ฿ ไม่ตรงกับยอดที่ต้องชำระ ' + fmt_(expected) + ' ฿',
    fix: amountOk ? '' : (suggestQty
      ? 'ถ้าโอนสำหรับ ' + suggestQty + ' ท่าน กดปุ่ม "เปลี่ยนเป็น ' + suggestQty + ' ท่าน" ด้านล่างได้เลย'
      : (slip.amount < expected
          ? 'ยังขาดอีก ' + fmt_(expected - slip.amount) + ' ฿ กรุณาทัก LINE ' + CONFIG.CONTACT_LINE + ' ให้ทีมงานช่วยนะคะ'
          : 'โอนเกินมา ' + fmt_(slip.amount - expected) + ' ฿ กรุณาทัก LINE ' + CONFIG.CONTACT_LINE + ' ให้ทีมงานช่วยนะคะ')) });

  // 2) Receiver = openface's account
  const digits = String(slip.receiverAccount).replace(/\D/g, '');
  const accCfg = (sc.RECEIVER_ACCOUNT_DIGITS || []).map(x => String(x).replace(/\D/g, '')).filter(Boolean);
  const nameCfg = (sc.RECEIVER_NAME_KEYWORDS || []).map(norm_).filter(Boolean);
  let receiverOk = null;   // null = cannot decide (not configured) → staff review
  if (accCfg.length || nameCfg.length) {
    const accMatch = digits && accCfg.some(a => digits.indexOf(a) >= 0 || a.indexOf(digits) >= 0 && digits.length >= 4);
    const nameMatch = nameCfg.some(k => norm_(slip.receiverName).indexOf(k) >= 0);
    receiverOk = !!(accMatch || nameMatch);
  }
  checks.push({ key: 'receiver', ok: receiverOk,
    label: receiverOk === false
      ? 'สลิปนี้โอนเข้าบัญชี "' + (slip.receiverName || 'อื่น') + '" ไม่ใช่บัญชีของ openface'
      : 'โอนเข้าบัญชี ' + (slip.receiverName || CONFIG.ACCOUNT_NAME) + (slip.receiverBank ? ' (' + slip.receiverBank + ')' : '')
        + (receiverOk === null ? ' – ทีมงานจะตรวจชื่อบัญชีอีกครั้ง' : ''),
    fix: receiverOk === false
      ? 'กรุณาตรวจว่าโอนเข้าบัญชี ' + CONFIG.ACCOUNT_NAME + ' แล้วแนบสลิปที่ถูกต้อง หากโอนผิดบัญชีกรุณาติดต่อธนาคารของคุณ' : '' });

  // 3) Timestamp
  const t = slip.time ? new Date(slip.time) : null, now = new Date();
  let timeOk = !!t, timeFix = '';
  if (t) {
    if (t.getTime() > now.getTime() + 10 * 60000) { timeOk = false; timeFix = 'เวลาในสลิปอยู่ในอนาคต กรุณาแนบสลิปจริงจากแอปธนาคาร'; }
    else if (sc.NOT_BEFORE && t < new Date(sc.NOT_BEFORE)) { timeOk = false; timeFix = 'สลิปนี้เป็นรายการก่อนเปิดรับลงทะเบียน กรุณาแนบสลิปที่โอนสำหรับงานนี้'; }
    else if (sc.MAX_AGE_HOURS && now - t > sc.MAX_AGE_HOURS * 3600000) { timeOk = false; timeFix = 'สลิปนี้เก่าเกิน ' + sc.MAX_AGE_HOURS + ' ชั่วโมง กรุณาแนบสลิปล่าสุด หรือทัก LINE ' + CONFIG.CONTACT_LINE; }
  } else { timeFix = 'อ่านเวลาในสลิปไม่ได้'; }
  checks.push({ key: 'time', ok: timeOk,
    label: t ? 'เวลาโอน ' + Utilities.formatDate(t, TZ, 'd/MM/yyyy HH:mm') + ' น.' : 'ไม่พบเวลาในสลิป',
    fix: timeOk ? '' : timeFix });

  // 4) Not used before
  const dupId = slip.transRef ? findTransRef_(slip.transRef) : null;
  checks.push({ key: 'duplicate', ok: !dupId,
    label: dupId ? 'สลิปนี้ถูกใช้ลงทะเบียนไปแล้ว (' + dupId + ')' : 'สลิปนี้ยังไม่เคยใช้ลงทะเบียน',
    fix: dupId ? 'ถ้าคุณลงทะเบียนไปแล้ว ไม่ต้องทำซ้ำ ตรวจอีเมลยืนยันได้เลย หรือทัก LINE ' + CONFIG.CONTACT_LINE : '' });

  const anyFail = checks.some(c => c.ok === false);
  const anyUnknown = checks.some(c => c.ok === null);
  const status = anyFail ? 'failed' : (anyUnknown ? 'review' : 'verified');
  return {
    status: status, canManual: false, suggestQty: suggestQty, checks: checks,
    title: status === 'verified' ? 'สลิปถูกต้องครบทุกข้อ!' : status === 'review' ? 'สลิปผ่านการตรวจเบื้องต้น' : 'สลิปยังไม่ผ่าน',
    message: status === 'verified' ? 'กดยืนยันด้านล่างได้เลย ระบบจะยืนยันที่นั่งให้ทันที'
           : status === 'review' ? 'กดยืนยันได้เลย ทีมงานจะตรวจอีกรอบและส่งอีเมลยืนยันให้ค่ะ'
           : 'ดูรายการที่ขึ้นเครื่องหมาย ✕ และวิธีแก้ด้านล่างนะคะ',
    slip: { amount: slip.amount, time: t ? Utilities.formatDate(t, TZ, 'd/MM/yyyy HH:mm') : '',
            senderName: slip.senderName, senderBank: slip.senderBank, receiverName: slip.receiverName }
  };
}

/* ---------- Submit ---------- */

function submitRegistration(f) {
  if (isClosed_()) throw new Error('ปิดรับลงทะเบียนแล้ว / Registration is closed');

  const name  = String(f.name || '').trim();
  const phone = String(f.phone || '').replace(/[^\d+]/g, '');
  const email = String(f.email || '').trim();
  const qty   = parseInt(f.qty, 10);

  if (!name) throw new Error('กรุณากรอกชื่อ-นามสกุล / Please enter your name');
  if (!/^\+?\d{9,12}$/.test(phone)) throw new Error('เบอร์โทรไม่ถูกต้อง / Invalid phone number');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('อีเมลไม่ถูกต้อง / Invalid email');
  if (!(qty >= 1 && qty <= CONFIG.MAX_PER_BOOKING)) throw new Error('จำนวนผู้เข้าร่วมไม่ถูกต้อง / Invalid attendee count');
  if (!f.slipData) throw new Error('กรุณาแนบสลิปโอนเงิน / Please attach the payment slip');
  if (f.ageOk !== true) throw new Error('ผู้เข้าร่วมทุกท่านต้องอายุ 20 ปีขึ้นไป / All guests must be 20+');
  if (f.termsOk !== true) throw new Error('กรุณายอมรับเงื่อนไข / Please accept the terms');

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    if (CONFIG.CAPACITY > 0 && countSeats_() + qty > CONFIG.CAPACITY) throw new Error('ที่นั่งไม่พอ / Not enough seats left');

    // Re-check the slip on the server (never trust the browser)
    let slip = null, ev = null, verification, status = 'Pending';
    if (f.slipToken) {
      slip = getCachedSlip_(f.slipToken);
      if (!slip) throw new Error('หมดเวลาตรวจสลิป กรุณาแนบสลิปอีกครั้ง / Slip check expired, please re-upload');
      ev = evaluateSlip_(slip, qty);                       // includes duplicate check, under lock
      if (ev.status === 'failed') throw new Error(ev.checks.filter(c => c.ok === false)[0].label);
      if (ev.status === 'verified' && CONFIG.SLIP_CHECK.AUTO_CONFIRM) { status = 'Confirmed'; verification = 'Auto ✓ SlipOK'; }
      else verification = 'Review: ' + ev.checks.filter(c => c.ok === null).map(c => c.key).join(', ');
    } else {
      verification = 'Manual review – auto check unavailable' + (f.manualReason ? ' (' + String(f.manualReason).slice(0, 60) + ')' : '');
    }

    const props = PropertiesService.getScriptProperties();
    const seq = Number(props.getProperty('SEQ') || 0) + 1;
    props.setProperty('SEQ', String(seq));
    const regId  = CONFIG.ID_PREFIX + ('0000' + seq).slice(-4);
    const amount = qty * CONFIG.PRICE_PER_PERSON;

    const mime = f.slipMime || 'image/jpeg';
    const b64  = String(f.slipData).split(',').pop();
    const blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, regId + '_' + name + '.jpg');
    const file = getFolder_().createFile(blob);

    getSheet_().appendRow([
      new Date(), regId, name, "'" + phone, email, String(f.line || ''),
      qty, String(f.guests || ''), String(f.parking || 'No'), amount,
      slip ? slip.amount : '', slip && slip.time ? new Date(slip.time) : '',
      slip ? slip.senderName : '', slip ? slip.senderBank : '',
      slip ? (slip.receiverName + (slip.receiverAccount ? ' ' + slip.receiverAccount : '')) : '',
      slip ? "'" + slip.transRef : '', verification,
      file.getUrl(), String(f.notes || ''), status, ''
    ]);
    if (f.slipToken) CacheService.getScriptCache().remove('slip_' + f.slipToken);

    const confirmed = status === 'Confirmed';
    if (CONFIG.SEND_EMAIL) {
      try {
        MailApp.sendEmail({
          to: email, replyTo: CONFIG.ADMIN_EMAIL, name: CONFIG.BRAND,
          subject: '[' + regId + '] ' + (confirmed ? 'ยืนยันการชำระเงินเรียบร้อย' : 'ได้รับการลงทะเบียนแล้ว') + ' – ' + CONFIG.BRAND + ' ' + CONFIG.EVENT_NAME,
          htmlBody: emailHtml_(name, regId, qty, amount, confirmed)
        });
        if (CONFIG.ADMIN_EMAIL) {
          MailApp.sendEmail({
            to: CONFIG.ADMIN_EMAIL, name: CONFIG.BRAND + ' registration',
            subject: (confirmed ? '✅ Auto-confirmed' : '⚠️ Needs review') + ': ' + regId + ' · ' + name + ' · ' + qty + ' pax · ' + amount.toLocaleString() + ' THB',
            htmlBody: '<b>' + regId + '</b> · ' + name + ' · ' + phone + ' · ' + qty + ' pax · ' + amount.toLocaleString() + ' THB<br>'
              + 'Verification: ' + verification + '<br>'
              + 'Slip: <a href="' + file.getUrl() + '">open</a> · Sheet: <a href="' + ss_().getUrl() + '">open</a>'
          });
        }
      } catch (e) { console.warn('Email failed: ' + e); }
    }
    return { regId: regId, amount: amount, qty: qty, confirmed: confirmed };
  } finally {
    lock.releaseLock();
  }
}

/* ---------- Admin: confirmation email when Status is changed to Confirmed by hand ---------- */

function onStatusEdit(e) {
  const sh = e.range.getSheet();
  if (sh.getName() !== CONFIG.SHEET_NAME) return;
  if (e.range.getColumn() !== COL('Status') || e.range.getRow() < 2) return;
  if (e.value !== 'Confirmed' || !CONFIG.SEND_EMAIL) return;

  const r = sh.getRange(e.range.getRow(), 1, 1, HEADERS.length).getValues()[0];
  const email = r[COL('Email') - 1];
  if (!email) return;
  MailApp.sendEmail({
    to: email, replyTo: CONFIG.ADMIN_EMAIL, name: CONFIG.BRAND,
    subject: '[' + r[COL('Registration ID') - 1] + '] ยืนยันการชำระเงินเรียบร้อย – ' + CONFIG.BRAND + ' ' + CONFIG.EVENT_NAME,
    htmlBody: emailHtml_(r[COL('Full Name') - 1], r[COL('Registration ID') - 1],
                         r[COL('Attendees') - 1], r[COL('Amount (THB)') - 1], true)
  });
}

/* ---------- One-time setup ---------- */

function setup() {
  getSheet_();
  getFolder_();
  ScriptApp.getProjectTriggers()
    .filter(t => t.getHandlerFunction() === 'onStatusEdit')
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('onStatusEdit').forSpreadsheet(ss_()).onEdit().create();
}

/* ---------- Helpers ---------- */

function slipCheckReady_() {
  const sc = CONFIG.SLIP_CHECK;
  return !!(sc.ENABLED && sc.SLIPOK_BRANCH_ID &&
            PropertiesService.getScriptProperties().getProperty('SLIPOK_API_KEY'));
}

function getCachedSlip_(token) {
  if (!token) return null;
  const s = CacheService.getScriptCache().get('slip_' + String(token));
  return s ? JSON.parse(s) : null;
}

function findTransRef_(ref) {
  const sh = getSheet_();
  const n = sh.getLastRow() - 1;
  if (n <= 0) return null;
  const refs = sh.getRange(2, COL('Trans Ref'), n, 1).getValues();
  const ids  = sh.getRange(2, COL('Registration ID'), n, 1).getValues();
  const sts  = sh.getRange(2, COL('Status'), n, 1).getValues();
  for (let i = 0; i < n; i++) {
    if (String(refs[i][0]).replace(/^'/, '') === ref && sts[i][0] !== 'Rejected') return ids[i][0];
  }
  return null;
}

function clampQty_(q) {
  const n = parseInt(q, 10);
  return Math.min(CONFIG.MAX_PER_BOOKING, Math.max(1, isNaN(n) ? 1 : n));
}

function norm_(s) {
  return String(s || '').toLowerCase()
    .replace(/^(นาย|นางสาว|น\.ส\.|นาง|บจก\.|บริษัท|mr\.?|mrs\.?|ms\.?|miss)\s*/g, '')
    .replace(/[\s.\-_,()]/g, '');
}

function fmt_(n) { return Number(n).toLocaleString('en-US', { maximumFractionDigits: 2 }); }

function bankName_(code) {
  const m = { '002': 'BBL', '004': 'KBank', '006': 'KTB', '011': 'ttb', '014': 'SCB', '025': 'Krungsri',
              '030': 'GSB', '034': 'BAAC', '069': 'KKP', '022': 'CIMB', '024': 'UOB', '067': 'TISCO', '073': 'LH Bank' };
  return m[String(code)] || (code ? String(code) : '');
}

function isClosed_() {
  if (!CONFIG.CLOSE_AT) return false;
  return new Date() > new Date(CONFIG.CLOSE_AT);
}

function ss_() {
  return CONFIG.SPREADSHEET_ID ? SpreadsheetApp.openById(CONFIG.SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

function getSheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName(CONFIG.SHEET_NAME) || ss.insertSheet(CONFIG.SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    sh.getRange(1, 1, 1, HEADERS.length)
      .setFontWeight('bold').setBackground('#2b2622').setFontColor('#f4efdf');
    const rule = SpreadsheetApp.newDataValidation()
      .requireValueInList(['Pending', 'Confirmed', 'Rejected', 'Refunded'], true).build();
    sh.getRange(2, COL('Status'), 2000, 1).setDataValidation(rule);
  }
  return sh;
}

function getFolder_() {
  if (CONFIG.SLIP_FOLDER_ID) return DriveApp.getFolderById(CONFIG.SLIP_FOLDER_ID);
  const props = PropertiesService.getScriptProperties();
  const id = props.getProperty('SLIP_FOLDER_ID');
  if (id) { try { return DriveApp.getFolderById(id); } catch (e) {} }
  const folder = DriveApp.createFolder(CONFIG.BRAND + ' ' + CONFIG.EVENT_NAME + ' – Payment Slips');
  props.setProperty('SLIP_FOLDER_ID', folder.getId());
  return folder;
}

function countSeats_() {
  const sh = getSheet_();
  const n = sh.getLastRow() - 1;
  if (n <= 0) return 0;
  const data = sh.getRange(2, 1, n, HEADERS.length).getValues();
  return data.reduce((sum, r) => {
    const st = r[COL('Status') - 1];
    return (st === 'Rejected' || st === 'Refunded') ? sum : sum + (Number(r[COL('Attendees') - 1]) || 0);
  }, 0);
}

function emailHtml_(name, regId, qty, amount, confirmed) {
  const title = confirmed ? 'ยืนยันการชำระเงินเรียบร้อย' : 'ได้รับการลงทะเบียนแล้ว';
  const body  = confirmed
    ? 'เราตรวจสอบการชำระเงินของคุณเรียบร้อยแล้ว กรุณาแสดงรหัสลงทะเบียนนี้และบัตรประชาชนที่หน้างาน แล้วพบกันคืนฮาโลวีนค่ะ'
    : 'เราได้รับข้อมูลและสลิปของคุณแล้ว ทีมงานจะตรวจสอบและส่งอีเมลยืนยันอีกครั้งค่ะ';
  const row = (k, v) => '<tr><td style="padding:6px 16px 6px 0;color:#8a8175">' + k + '</td><td style="padding:6px 0;color:#2b2622">' + v + '</td></tr>';
  return '<div style="background:#f4efdf;padding:28px 16px;font-family:Georgia,\'Times New Roman\',serif">'
   + '<div style="max-width:520px;margin:0 auto;background:#fffdf5;border:1px solid #e3dcc6;padding:28px">'
   + '<div style="text-align:center;letter-spacing:4px;font-size:22px;color:#2b2622">' + CONFIG.BRAND + '</div>'
   + '<div style="text-align:center;font-size:11px;letter-spacing:3px;color:#8a8175;margin-bottom:18px">CAFE · BANGKOK</div>'
   + '<h2 style="font-weight:normal;color:#b5602a;margin:0 0 8px">' + title + '</h2>'
   + '<p style="font-family:sans-serif;color:#2b2622">สวัสดีคุณ ' + name + ',</p>'
   + '<p style="font-family:sans-serif;color:#2b2622">' + body + '</p>'
   + '<table style="font-family:sans-serif;font-size:14px;border-collapse:collapse">'
   + row('Registration ID', '<b>' + regId + '</b>')
   + row('Event', CONFIG.EVENT_NAME)
   + row('Date / Time', CONFIG.EVENT_DATE + ' · ' + CONFIG.EVENT_TIME)
   + row('Venue', CONFIG.VENUE + ' · <a href="' + CONFIG.MAP_URL + '" style="color:#b5602a">Map</a>')
   + row('Theme', CONFIG.THEME)
   + row('Includes', CONFIG.PRICE_INCLUDES)
   + row('Attendees', qty)
   + row('Amount', Number(amount).toLocaleString() + ' THB')
   + '</table>'
   + '<p style="font-family:sans-serif;color:#8a8175;font-size:12px;margin-top:16px">' + CONFIG.HOUSE_RULES + '<br>' + CONFIG.REFUND_POLICY + '</p>'
   + '<p style="font-family:sans-serif;color:#8a8175;font-size:13px;margin-top:20px">LINE <a href="' + CONFIG.LINE_URL + '" style="color:#b5602a">' + CONFIG.CONTACT_LINE + '</a> · โทร ' + CONFIG.CONTACT_PHONE + '</p>'
   + '</div></div>';
}
