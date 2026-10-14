/**
 * openface × No Judgment Gathering – ANNYONG SPOOKY HALLOWEEN NIGHT (31 Oct 2026)
 * Backend for the Vercel registration site (Google Apps Script, bound to the event Google Sheet).
 *
 * PROCESS
 *   1. Guest registers + uploads slip on the site          → row added, Payment Status = "Pending"
 *   2. Admin checks the slip against the bank statement    → sets Payment Status in the Sheet
 *   3a. "Approved"  → entry code issued + APPROVED email   (with the status-check link)
 *   3b. "Problem"   → choose a Problem Reason → PROBLEM email (with the link to fix / re-upload)
 *       (picking a Problem Reason on a Pending row sets it to Problem automatically)
 *   4. Guest enters their phone number on the site          → sees status + entry code (when approved)
 *
 * Setup: paste this file, fill the // TODO values, run setup() once, deploy as Web app (Execute as Me, Anyone).
 * SlipOK key (optional pre-check) goes in Project Settings → Script properties → SLIPOK_API_KEY.
 */

const CONFIG = {
  BRAND:            'openface',
  EVENT_NAME:       'ANNYONG SPOOKY HALLOWEEN NIGHT',
  TIME_EN:          '10:00 PM – 02:00 AM',
  CO_HOST:          'No Judgment Gathering',
  THEME:            'Korean Halloween in Bangkok',
  EVENT_DATE:       'เสาร์ 31 ต.ค. 2026 · Sat 31 Oct 2026',
  EVENT_TIME:       'ลงทะเบียน 22:00 · DJ 22:30 – 02:00',
  SCHEDULE:         [['22:00', 'ลงทะเบียน · Registration'], ['22:30', 'DJ ขึ้น · DJ up'], ['02:00', 'ปิดงาน · Till 02:00']],
  VENUE:            'openface · 86/2 ถ.รามคำแหง 21 (ซ.นวศรี 15) แขวงพลับพลา เขตวังทองหลาง กรุงเทพฯ',
  MAP_URL:          'https://share.google/kdPgH8cJINAYblTop',
  PRICE_PER_PERSON: 1199,          // THB
  PRICE_INCLUDES:   'DJ · Free-flow alcohol · Korean bites',
  DRESS_CODE:       'Everything Korean',
  MIN_AGE:          20,
  MAX_PER_BOOKING:  50,
  CAPACITY:         0,             // 0 = unlimited
  CLOSE_AT:         '',            // e.g. '2026-10-31T18:00:00+07:00' to stop registrations

  // Payment – openface K SHOP (KBank) Thai QR. The site re-issues it with the exact amount filled in.
  PAY_QR_PAYLOAD:   '00020101021130810016A00000067701011201150107536000315010214KB0000022995670320KPS004KB00000229956731690016A00000067701011301030040214KB0000022995670420KPS004KB00000229956753037645802TH63044D15',
  PROMPTPAY_ID:     '',
  SHOP_NAME:        'โอเพ่น เฟซ',
  BANK_NAME:        'กสิกรไทย (K SHOP)',
  ACCOUNT_NAME:     'บจก. โอเพ่น คิทเช่น',
  ACCOUNT_NO:       '',
  PAY_REF:          'KPS004KB000002299567',

  // Optional automatic PRE-check of slips (SlipOK). It only helps the guest catch mistakes and gives the
  // admin a hint in the "Auto Check" column – it never approves anything. Leave the branch ID empty to turn it off.
  SLIP_CHECK: {
    ENABLED:          true,
    SLIPOK_BRANCH_ID: '',          // TODO (optional)
    // openface's own K SHOP shop code ("รหัสร้านค้า" on slips). Do NOT use the Biller ID 010753600031501 –
    // that is KBank's shared K SHOP biller and every K SHOP shop has it.
    RECEIVER_SHOP_CODES:     ['KB000002299567'],
    RECEIVER_ACCOUNT_DIGITS: [],
    RECEIVER_NAME_KEYWORDS:  ['โอเพ่นคิทเช่น', 'โอเพ่นเฟซ', 'openkitchen', 'openface'],
    NOT_BEFORE:       '2026-09-28T00:00:00+07:00',
    MAX_AGE_HOURS:    48
  },

  /* ---------- Emails ----------
   * Templates are placeholders until the final letters are supplied – edit SUBJECT/BODY below.
   * BODY is simple HTML; {{placeholders}} are filled in automatically:
   *   {{name}} {{ref}} {{entryCode}} {{qty}} {{amount}} {{event}} {{date}} {{time}} {{venue}} {{mapUrl}}
   *   {{problem}} {{fix}} {{note}} {{statusLink}} {{line}} {{lineUrl}} {{phone}}
   * The letter is wrapped in the poster-style frame (logo, event band, footer) automatically.  */
  EMAIL: {
    // false = MANUAL: nothing is emailed to guests. Approving / flagging a row writes a ready-to-send draft into
    // "Email Draft" and sets "Email Status" to "To send …"; the team sends it from Gmail and marks it "Sent …".
    // true  = the script emails guests automatically (RECEIVED / APPROVED / PROBLEM).
    SEND:           false,
    SENDER_NAME:    'openface × No Judgment Gathering',
    REPLY_TO:       'nojudgmentgathering@gmail.com',   // guest replies go here
    SEND_RECEIVED:  true,          // short "we got your registration" email right after registering
    TEMPLATES: {
      RECEIVED: {
        SUBJECT: '[{{ref}}] ได้รับการลงทะเบียนแล้ว – {{event}}',
        BODY: '<p>สวัสดีคุณ {{name}},</p>'
          + '<p>เราได้รับการลงทะเบียนและสลิปของคุณแล้ว ทีมงานจะตรวจสอบการชำระเงินกับบัญชีธนาคาร และส่งอีเมลแจ้งผลอีกครั้ง (โดยปกติภายใน 24 ชม.)</p>'
          + '<p>เลขที่การจอง: <b>{{ref}}</b> · {{qty}} ท่าน · {{amount}} บาท</p>'
          + '<p>ตรวจสอบสถานะได้ตลอดด้วยเบอร์โทรที่ลงทะเบียน: <a href="{{statusLink}}">{{statusLink}}</a></p>'
      },
      APPROVED: {
        SUBJECT: "[{{ref}}] You're in! ยืนยันการชำระเงินเรียบร้อย – {{event}}",
        BODY: '<p>สวัสดีคุณ {{name}},</p>'
          + '<p>ทีมงานตรวจสอบการชำระเงินของคุณเรียบร้อยแล้ว พบกันคืนวันเสาร์ที่ 31 ต.ค. นี้!</p>'
          + '<p style="font-size:13px;color:#5b5d62;margin-bottom:4px">รหัสเข้างาน / Entry code</p>'
          + '<p style="font-size:30px;font-weight:bold;letter-spacing:3px;margin:0 0 12px">{{entryCode}}</p>'
          + '<p>แสดงรหัสนี้พร้อมบัตรประชาชนที่หน้างาน (ผู้เข้าร่วมทุกท่านอายุ 20+) · {{qty}} ท่าน · {{amount}} บาท</p>'
          + '<p>{{date}} · {{time}}<br>{{venue}} · <a href="{{mapUrl}}">แผนที่</a><br>Dress code: Everything Korean</p>'
          + '<p>ดูรหัสเข้างานได้ตลอดที่ <a href="{{statusLink}}">{{statusLink}}</a></p>'
      },
      PROBLEM: {
        SUBJECT: '[{{ref}}] ต้องแก้ไขการชำระเงิน – {{event}}',
        BODY: '<p>สวัสดีคุณ {{name}},</p>'
          + '<p>ทีมงานตรวจสอบการชำระเงินสำหรับเลขที่การจอง <b>{{ref}}</b> แล้ว พบปัญหาดังนี้:</p>'
          + '<p style="padding:10px 14px;border:2px solid #a8412f;border-radius:10px;background:#f7dcd2"><b>{{problem}}</b><br>{{note}}</p>'
          + '<p><b>วิธีแก้ไข:</b> {{fix}}</p>'
          + '<p>แก้ไข / แนบสลิปใหม่ได้ที่: <a href="{{statusLink}}">{{statusLink}}</a> (ใช้เบอร์โทรที่ลงทะเบียน)</p>'
          + '<p>หากมีข้อสงสัย ทัก LINE <a href="{{lineUrl}}">{{line}}</a></p>'
      }
    }
  },

  /* ---------- Common payment problems (admin picks one in "Problem Reason") ----------
   * key: what appears in the Sheet dropdown · th: what the guest sees · fix: what the guest should do
   * reupload: show the "upload a new slip" button on the status page                                  */
  PROBLEMS: [
    { key: 'Amount short – โอนไม่ครบ',             th: 'ยอดโอนไม่ครบตามจำนวนผู้เข้าร่วม',                fix: 'โอนส่วนที่ขาดผ่าน QR เดิม แล้วแนบสลิปเพิ่มในหน้าตรวจสอบสถานะ', reupload: true },
    { key: 'Amount over – โอนเกิน',                th: 'ยอดโอนเกินจากยอดที่ต้องชำระ',                   fix: 'ทีมงานจะติดต่อกลับเพื่อคืนส่วนต่างหรือปรับจำนวนผู้เข้าร่วม ทัก LINE ได้เลย', reupload: false },
    { key: 'Not received – ไม่พบยอดเงินเข้า',      th: 'ไม่พบยอดเงินเข้าบัญชีตามสลิป',                   fix: 'ตรวจกับธนาคารว่าการโอนสำเร็จ แล้วแนบสลิปที่ถูกต้องอีกครั้ง', reupload: true },
    { key: 'Wrong account – โอนผิดบัญชี',          th: 'สลิปนี้ไม่ได้โอนเข้าบัญชี บจก. โอเพ่น คิทเช่น',     fix: 'ติดต่อธนาคารของคุณเรื่องรายการเดิม แล้วชำระใหม่ด้วย QR บนเว็บ และแนบสลิปใหม่', reupload: true },
    { key: 'Unclear slip – สลิปไม่ชัด/ไม่ครบ',      th: 'สลิปไม่ชัดหรือข้อมูลไม่ครบ ตรวจสอบไม่ได้',           fix: 'แนบรูปสลิปต้นฉบับที่บันทึกจากแอปธนาคารอีกครั้ง (ไม่ครอป ไม่ถ่ายจากหน้าจอ)', reupload: true },
    { key: 'Duplicate slip – สลิปซ้ำ',             th: 'สลิปนี้ถูกใช้กับการลงทะเบียนอื่นแล้ว',              fix: 'หากเป็นการลงทะเบียนซ้ำของคุณเอง ไม่ต้องทำอะไรเพิ่ม หากไม่ใช่ กรุณาแนบสลิปของรายการนี้', reupload: true },
    { key: 'Wrong slip / date – สลิปไม่ใช่รายการนี้', th: 'วันที่หรือรายการในสลิปไม่ตรงกับการลงทะเบียน',        fix: 'แนบสลิปที่โอนสำหรับงานนี้', reupload: true },
    { key: 'Guest count – จำนวนคนไม่ตรงยอด',        th: 'จำนวนผู้เข้าร่วมไม่ตรงกับยอดที่โอน',                fix: 'ทัก LINE เพื่อปรับจำนวนผู้เข้าร่วมให้ตรงกับยอดโอน', reupload: false },
    { key: 'Contact info – ข้อมูลติดต่อไม่ถูกต้อง',   th: 'ข้อมูลชื่อ/เบอร์/อีเมลไม่ถูกต้องหรือไม่ครบ',          fix: 'ทัก LINE เพื่อยืนยันข้อมูลให้ถูกต้อง', reupload: false },
    { key: 'Other – อื่น ๆ (ดู Note to Guest)',         th: 'มีรายละเอียดที่ต้องตรวจสอบเพิ่มเติม',                fix: 'ดูรายละเอียดด้านบน หรือทัก LINE', reupload: true }
  ],

  CONTACT_LINE:     '@openfacebkk',
  LINE_URL:         'https://lin.ee/9pQIgO3',
  CONTACT_PHONE:    '082-556-3659',
  IG_URL:           'https://www.instagram.com/openfacebkk/',
  SITE_URL:         'https://openface-halloween2026.vercel.app',
  ADMIN_EMAIL:      'nojudgmentgathering@gmail.com',   // event admin: notice for every new registration / re-uploaded slip
  CONTACT_EMAIL:    'nojudgmentgathering@gmail.com',   // shown to guests on the site and in every email
  REFUND_POLICY:    'ไม่รับยกเลิกและไม่คืนเงินทุกกรณี · No cancellation, no refund',
  HOUSE_RULES:      'ผู้เข้าร่วมต้องอายุ 20 ปีขึ้นไป (ตรวจบัตรหน้างาน) · งดเด็กและสัตว์เลี้ยงสำหรับงานนี้ · 20+ only (ID check at the door) · No kids, no pets',

  SLIP_FOLDER_ID:   '',
  SPREADSHEET_ID:   '128yKL_9i4V_-R6YXYeiU3kYDy_uKV57sGoe0DQKAr8k',
  SHEET_NAME:       'Registrations',
  ID_PREFIX:        'OF-HW26-',
  CODE_PREFIX:      'ANN-',

  // Status lookup on the site. false = phone number only (as requested). true = phone + booking ref
  // (safer: anyone who knows a guest's phone number could otherwise see their entry code).
  STATUS_REQUIRE_REF: false
};

// Must match APP_VERSION in index.html (major.minor). Bump both together, then Deploy → New version.
const CODE_VERSION = '2.5.0';

// "Email Status" column – the guest-email confirmation status (emails are sent by hand)
const MAIL = { WAITING: 'Waiting – payment check',
               TO_APPROVED: 'To send – Approved', SENT_APPROVED: 'Sent – Approved',
               TO_PROBLEM: 'To send – Problem', SENT_PROBLEM: 'Sent – Problem', NOT_NEEDED: 'Not needed' };

const STATUS = { PENDING: 'Pending', APPROVED: 'Approved', PROBLEM: 'Problem', CANCELLED: 'Cancelled' };

const HEADERS = [
  'Timestamp', 'Booking Ref', 'Full Name', 'Phone', 'Email', 'LINE ID',
  'Attendees', 'Guest Names', 'Parking', 'Amount (THB)', 'Slip Link',
  'Slip Amount', 'Slip Time', 'Sender', 'Sender Bank', 'Receiver on Slip', 'Trans Ref', 'Auto Check',
  'Notes', 'Payment Status', 'Problem Reason', 'Note to Guest', 'Entry Code', 'Email Status', 'Email Sent At', 'Email Draft', 'Email Log', 'Internal Note', 'Updated At'
];
const COL = name => HEADERS.indexOf(name) + 1;
const TZ = 'Asia/Bangkok';

/* ======================================================================
 *  JSON API for the Vercel site – POST {action, data} as text/plain
 * ====================================================================== */
const API = {
  getConfig:          () => getConfig(),
  verifySlip:         d  => verifySlip(d),
  recheckSlip:        d  => recheckSlip(d.token, d.qty),
  submitRegistration: d  => submitRegistration(d),
  checkStatus:        d  => checkStatus(d),
  resubmitSlip:       d  => resubmitSlip(d)
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

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, service: CONFIG.BRAND + ' registration API', event: CONFIG.EVENT_NAME }))
    .setMimeType(ContentService.MimeType.JSON);
}

function getConfig() {
  const c = JSON.parse(JSON.stringify(CONFIG));
  ['ADMIN_EMAIL', 'SLIP_FOLDER_ID', 'SHEET_NAME', 'SPREADSHEET_ID', 'SLIP_CHECK', 'EMAIL', 'PROBLEMS'].forEach(k => delete c[k]);
  c.VERSION = CODE_VERSION;
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
    receiverBank: bankName_(d.receivingBank),
    refs: [d.ref1, d.ref2, d.ref3, d.toMerchantId].filter(Boolean).join(' ')
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
  const blob = (String(slip.refs || '') + ' ' + String(slip.receiverAccount || '')).toUpperCase().replace(/[^A-Z0-9 ]/g, '');
  const digits = String(slip.receiverAccount || '').replace(/\D/g, '');
  const shopCfg = (sc.RECEIVER_SHOP_CODES || []).map(x => String(x).toUpperCase().replace(/[^A-Z0-9]/g, '')).filter(Boolean);
  const accCfg = (sc.RECEIVER_ACCOUNT_DIGITS || []).map(x => String(x).replace(/\D/g, '')).filter(x => x.length >= 4);
  const nameCfg = (sc.RECEIVER_NAME_KEYWORDS || []).map(norm_).filter(Boolean);
  let receiverOk = null;   // null = cannot decide (not configured / nothing on the slip) → staff review
  if (shopCfg.length || accCfg.length || nameCfg.length) {
    const shopMatch = shopCfg.some(c => blob.indexOf(c) >= 0 || blob.indexOf(c.replace(/^[A-Z]+/, '')) >= 0);
    const otherShop = !shopMatch && /KB\d{12}/.test(blob);           // paid to a DIFFERENT K SHOP shop
    const accMatch = !!digits && accCfg.some(a => digits.indexOf(a) >= 0);
    const nameMatch = nameCfg.some(k => norm_(slip.receiverName).indexOf(k) >= 0);
    receiverOk = otherShop ? false : (shopMatch || accMatch || nameMatch);
    if (!receiverOk && !otherShop && !slip.receiverName && !blob.trim()) receiverOk = null;   // slip shows nothing to compare
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
    fix: dupId ? 'ถ้าคุณลงทะเบียนไปแล้ว ไม่ต้องทำซ้ำ ตรวจสถานะด้วยเบอร์โทรได้เลย หรือทัก LINE ' + CONFIG.CONTACT_LINE : '' });

  const anyFail = checks.some(c => c.ok === false);
  const anyUnknown = checks.some(c => c.ok === null);
  const status = anyFail ? 'failed' : (anyUnknown ? 'review' : 'verified');
  // If ONLY the receiver looks wrong, our matching may be at fault – let the guest send it for admin review.
  const onlyReceiver = anyFail && checks.filter(c => c.ok === false).every(c => c.key === 'receiver');
  return {
    status: status, canManual: onlyReceiver, suggestQty: suggestQty, checks: checks,
    title: status === 'verified' ? 'สลิปถูกต้องครบทุกข้อ!' : status === 'review' ? 'สลิปผ่านการตรวจเบื้องต้น' : 'สลิปยังไม่ผ่าน',
    message: status === 'failed'
      ? (onlyReceiver ? 'บัญชีผู้รับดูไม่ตรง ถ้าแน่ใจว่าโอนเข้า openface กด "ส่งให้ทีมงานตรวจแทน" ได้ค่ะ' : 'ดูรายการที่ขึ้นเครื่องหมาย ✕ และวิธีแก้ด้านล่างนะคะ')
      : 'กดยืนยันด้านล่างได้เลย ทีมงานจะตรวจกับบัญชีธนาคารและส่งอีเมลยืนยันพร้อมรหัสเข้างานให้ค่ะ',
    slip: { amount: slip.amount, time: t ? Utilities.formatDate(t, TZ, 'd/MM/yyyy HH:mm') : '',
            senderName: slip.senderName, senderBank: slip.senderBank, receiverName: slip.receiverName }
  };
}

/* ======================================================================
 *  1 · REGISTRATION  – every booking lands as "Pending" for the admin
 * ====================================================================== */

function submitRegistration(f) {
  if (isClosed_()) throw new Error('ปิดรับลงทะเบียนแล้ว / Registration is closed');

  const name  = String(f.name || '').trim().slice(0, 120);
  const phone = String(f.phone || '').replace(/[^\d+]/g, '');
  const email = String(f.email || '').trim().slice(0, 160);
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
  let regId, amount, fileUrl, autoCheck, row;
  try {
    if (CONFIG.CAPACITY > 0 && countSeats_() + qty > CONFIG.CAPACITY) throw new Error('ที่นั่งไม่พอ / Not enough seats left');

    // Optional automatic pre-check – a hint for the admin, never an approval
    const pre = preCheck_(f.slipToken, qty, f.manualReason, true);
    const slip = pre.slip;
    autoCheck = pre.text;

    const props = PropertiesService.getScriptProperties();
    const seq = Number(props.getProperty('SEQ') || 0) + 1;
    props.setProperty('SEQ', String(seq));
    regId  = CONFIG.ID_PREFIX + ('0000' + seq).slice(-4);
    amount = qty * CONFIG.PRICE_PER_PERSON;

    fileUrl = saveSlip_(f.slipData, f.slipMime, regId + '_' + name);
    const now = new Date();

    const rec = {
      'Timestamp': now, 'Booking Ref': regId, 'Full Name': name, 'Phone': "'" + phone, 'Email': email,
      'LINE ID': String(f.line || '').slice(0, 80), 'Attendees': qty, 'Guest Names': String(f.guests || '').slice(0, 1000),
      'Parking': String(f.parking || 'No'), 'Amount (THB)': amount, 'Slip Link': fileUrl,
      'Slip Amount': slip ? slip.amount : '', 'Slip Time': slip && slip.time ? new Date(slip.time) : '',
      'Sender': slip ? slip.senderName : '', 'Sender Bank': slip ? slip.senderBank : '',
      'Receiver on Slip': slip ? (slip.receiverName + (slip.receiverAccount ? ' ' + slip.receiverAccount : '')) : '',
      'Trans Ref': slip && slip.transRef ? "'" + slip.transRef : '', 'Auto Check': autoCheck,
      'Notes': String(f.notes || '').slice(0, 1000), 'Payment Status': STATUS.PENDING, 'Problem Reason': '',
      'Note to Guest': '', 'Entry Code': '', 'Email Status': CONFIG.EMAIL.SEND ? '' : MAIL.WAITING, 'Email Sent At': '', 'Email Draft': '', 'Email Log': '', 'Internal Note': '', 'Updated At': now
    };
    const sh = getSheet_();
    sh.appendRow(HEADERS.map(h => rec[h] === undefined ? '' : rec[h]));
    row = sh.getLastRow();
    if (f.slipToken) CacheService.getScriptCache().remove('slip_' + f.slipToken);
  } finally {
    lock.releaseLock();
  }

  // Emails (outside the lock)
  const sh = getSheet_();
  if (CONFIG.EMAIL.SEND && CONFIG.EMAIL.SEND_RECEIVED) {
    const r = rowObj_(sh, row);
    logEmail_(sh, row, sendTemplate_('RECEIVED', r) ? 'RECEIVED → ' + r.email : 'RECEIVED FAILED');
  }
  notifyAdmin_('🆕 New booking – check payment: ' + regId,
    regId + ' · ' + name + ' · ' + phone + ' · ' + qty + ' pax · ' + fmt_(amount) + ' THB', autoCheck, fileUrl);

  return { regId: regId, amount: amount, qty: qty, status: STATUS.PENDING };
}

/** Turns the optional SlipOK result into the "Auto Check" text. Blocks only slips that are clearly wrong. */
function preCheck_(token, qty, manualReason, isNew) {
  if (!token) {
    return { slip: null, text: 'Not auto-checked' + (manualReason ? ' – guest: ' + String(manualReason).slice(0, 80) : '') };
  }
  const slip = getCachedSlip_(token);
  if (!slip) return { slip: null, text: 'Not auto-checked (check expired)' };
  const ev = evaluateSlip_(slip, qty);                          // includes the duplicate check (under lock)
  const bad = ev.checks.filter(c => c.ok === false);
  const dup = bad.filter(c => c.key === 'duplicate')[0];
  if (dup) throw new Error(dup.label);
  if (isNew && bad.length && !(ev.canManual && manualReason)) throw new Error(bad[0].label);
  const keys = arr => arr.map(c => c.key).join(', ');
  const unsure = ev.checks.filter(c => c.ok === null);
  let text;
  if (!bad.length && !unsure.length) text = '✓ SlipOK: amount / receiver / time OK';
  else if (!bad.length) text = '? SlipOK – please check: ' + keys(unsure);
  else text = '✕ SlipOK flagged: ' + keys(bad) + (manualReason ? ' – guest: ' + String(manualReason).slice(0, 80) : '');
  return { slip: slip, text: text };
}

/* ======================================================================
 *  2–4 · ADMIN APPROVAL IN THE SHEET  (installable onEdit trigger → setup())
 *  Payment Status = Approved → entry code + APPROVED email
 *  Payment Status = Problem + Problem Reason → PROBLEM email
 * ====================================================================== */

function onAdminEdit(e) {
  if (!e || !e.range) return;
  const sh = e.range.getSheet();
  if (sh.getName() !== CONFIG.SHEET_NAME) return;
  const c1 = e.range.getColumn(), c2 = c1 + e.range.getNumColumns() - 1;
  const has = h => COL(h) >= c1 && COL(h) <= c2;
  if (has('Email Status')) stampSent_(sh, e.range);
  const watch = [COL('Payment Status'), COL('Problem Reason'), COL('Note to Guest')];
  if (!watch.some(c => c >= c1 && c <= c2)) return;
  const reasonEdited = COL('Problem Reason') >= c1 && COL('Problem Reason') <= c2;
  const r1 = Math.max(2, e.range.getRow()), r2 = e.range.getRow() + e.range.getNumRows() - 1;
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    for (let r = r1; r <= r2; r++) processRow_(sh, r, false, reasonEdited);
  } finally {
    lock.releaseLock();
  }
}

/** Admin marked a guest email as sent (or not): fill / clear "Email Sent At" and log it. */
function stampSent_(sh, range) {
  const r1 = Math.max(2, range.getRow()), r2 = range.getRow() + range.getNumRows() - 1;
  for (let row = r1; row <= r2; row++) {
    const v = String(sh.getRange(row, COL('Email Status')).getValue() || '');
    const at = sh.getRange(row, COL('Email Sent At'));
    if (/^Sent/.test(v)) {
      if (!at.getValue()) { at.setValue(new Date()); logEmail_(sh, row, v.toUpperCase() + ' (marked by admin)'); }
    } else if (at.getValue()) {
      at.setValue(''); logEmail_(sh, row, 'Email Status changed to "' + (v || 'blank') + '" – Sent At cleared');
    }
  }
}

/** Sends whatever email the row's status calls for – once per status (force = resend). */
function processRow_(sh, row, force, reasonEdited) {
  const r = rowObj_(sh, row);
  if (!r.ref) return 'empty row';
  let status = r.status;

  // Picking a reason on a Pending row means "Problem"
  if (reasonEdited && r.reason && (status === STATUS.PENDING || !status)) {
    status = STATUS.PROBLEM;
    sh.getRange(row, COL('Payment Status')).setValue(status);
  }

  const since = r.log.split('SLIP RE-UPLOADED').pop();          // only look after the latest re-upload
  let result = 'nothing to send';

  if (status === STATUS.APPROVED && !r.entryCode) {
    r.entryCode = newEntryCode_(sh);
    sh.getRange(row, COL('Entry Code')).setValue(r.entryCode);
  }
  if (!CONFIG.EMAIL.SEND) {                                      // MANUAL e-mail mode
    result = manualDraft_(sh, row, r, status, since, force);
    sh.getRange(row, COL('Updated At')).setValue(new Date());
    return result;
  }

  if (status === STATUS.APPROVED) {
    sh.getRange(row, COL('Problem Reason')).clearNote();
    if (force || since.indexOf('APPROVED →') < 0) {
      result = sendTemplate_('APPROVED', r) ? 'APPROVED → ' + r.email + ' (' + r.entryCode + ')' : 'APPROVED FAILED';
      logEmail_(sh, row, result);
    }
  } else if (status === STATUS.PROBLEM) {
    const cell = sh.getRange(row, COL('Problem Reason'));
    if (!r.reason) {
      cell.setNote('เลือก Problem Reason เพื่อส่งอีเมลแจ้งลูกค้า / Pick a reason to send the email');
      result = 'waiting for Problem Reason';
    } else {
      cell.clearNote();
      const tag = 'PROBLEM [' + problemOf_(r.reason).key + '] →';
      if (force || since.indexOf(tag) < 0) {
        result = sendTemplate_('PROBLEM', r) ? tag + ' ' + r.email : 'PROBLEM FAILED';
        logEmail_(sh, row, result);
      }
    }
  }
  sh.getRange(row, COL('Updated At')).setValue(new Date());
  return result;
}

/** Manual mode: keep "Email Draft" + "Email Status" in step with the payment status. */
function manualDraft_(sh, row, r, status, since, force) {
  const mailCell = sh.getRange(row, COL('Email Status'));
  const draftCell = sh.getRange(row, COL('Email Draft'));
  const reasonCell = sh.getRange(row, COL('Problem Reason'));
  let kind = null, tag = '';
  if (status === STATUS.APPROVED) { kind = 'APPROVED'; tag = 'APPROVED draft'; reasonCell.clearNote(); }
  else if (status === STATUS.PROBLEM) {
    if (!r.reason) { reasonCell.setNote('เลือก Problem Reason เพื่อสร้างอีเมลแจ้งลูกค้า / Pick a reason to create the email draft'); return 'waiting for Problem Reason'; }
    reasonCell.clearNote(); kind = 'PROBLEM'; tag = 'PROBLEM [' + problemOf_(r.reason).key + '] draft';
  }
  if (!kind) {                                                   // Pending / Cancelled: drop unsent drafts
    // Cancelled: no email needed (unless one already went out). Pending (e.g. new slip): waiting again.
    // An already-sent APPROVED email is never hidden – the guest has their code, so the admin must follow up.
    if (r.mailState === MAIL.SENT_APPROVED) return 'approval email already sent – follow up with the guest';
    const next = status === STATUS.CANCELLED ? MAIL.NOT_NEEDED : MAIL.WAITING;
    if (r.mailState !== next) {
      mailCell.setValue(next); draftCell.setValue(''); sh.getRange(row, COL('Email Sent At')).setValue('');
    }
    return 'no email for ' + (status || 'blank');
  }
  const sentLabel = kind === 'APPROVED' ? MAIL.SENT_APPROVED : MAIL.SENT_PROBLEM;
  const fresh = since.indexOf(tag) < 0;
  if (r.mailState === sentLabel && !fresh && !force) return 'already sent';
  const m = buildEmail_(kind, r);
  const compose = 'https://mail.google.com/mail/?view=cm&fs=1&to=' + encodeURIComponent(r.email)
                + '&su=' + encodeURIComponent(m.subject);
  const text = 'To: ' + r.email + '\nSubject: ' + m.subject + '\n\n' + m.text;
  draftCell.setRichTextValue(SpreadsheetApp.newRichTextValue().setText(text).setLinkUrl(compose).build());
  if (r.mailState !== (kind === 'APPROVED' ? MAIL.TO_APPROVED : MAIL.TO_PROBLEM)) sh.getRange(row, COL('Email Sent At')).setValue('');
  mailCell.setValue(kind === 'APPROVED' ? MAIL.TO_APPROVED : MAIL.TO_PROBLEM);
  if (fresh || force) logEmail_(sh, row, tag + ' ready → ' + r.email + (kind === 'APPROVED' ? ' (' + r.entryCode + ')' : ''));
  return tag + ' ready';
}

/* ======================================================================
 *  5 · STATUS CHECK BY PHONE  (+ re-upload a slip when there is a problem)
 * ====================================================================== */

function checkStatus(d) {
  const digits = phoneKey_(d && d.phone);
  if (digits.length < 9) throw new Error('กรุณากรอกเบอร์โทรที่ใช้ลงทะเบียน / Please enter the phone number you registered with');
  const ref = String((d && d.ref) || '').trim().toUpperCase();
  if (CONFIG.STATUS_REQUIRE_REF && !ref) throw new Error('กรุณากรอกเลขที่การจอง / Please enter your booking ref');
  throttle_('cs_' + digits, 12, 600);

  const sh = getSheet_();
  const n = sh.getLastRow() - 1;
  const out = [];
  if (n > 0) {
    const data = sh.getRange(2, 1, n, HEADERS.length).getValues();
    data.forEach(v => {
      const get = h => v[COL(h) - 1];
      if (phoneKey_(get('Phone')) !== digits) return;
      if (ref && String(get('Booking Ref')).toUpperCase() !== ref) return;
      const status = String(get('Payment Status') || STATUS.PENDING);
      const b = {
        ref: get('Booking Ref'), name: maskName_(get('Full Name')), qty: get('Attendees'),
        amount: get('Amount (THB)'), status: status,
        submitted: get('Timestamp') instanceof Date ? Utilities.formatDate(get('Timestamp'), TZ, 'd MMM yyyy HH:mm') : ''
      };
      if (status === STATUS.APPROVED) b.entryCode = get('Entry Code');
      if (status === STATUS.PROBLEM) {
        const reason = String(get('Problem Reason') || '');
        if (reason) {
          const p = problemOf_(reason);
          b.problem = { th: p.th, fix: p.fix, reupload: !!p.reupload, note: String(get('Note to Guest') || '') };
        } else {
          b.status = STATUS.PENDING;                                  // admin hasn't picked a reason yet
        }
      }
      out.push(b);
    });
  }
  return { found: out.length > 0, bookings: out.reverse(), line: CONFIG.CONTACT_LINE, lineUrl: CONFIG.LINE_URL };
}

function resubmitSlip(d) {
  const digits = phoneKey_(d && d.phone);
  const ref = String((d && d.ref) || '').trim().toUpperCase();
  if (!ref || digits.length < 9) throw new Error('ข้อมูลไม่ครบ / Missing booking ref or phone');
  if (!d.slipData) throw new Error('กรุณาแนบสลิป / Please attach the slip');
  throttle_('rs_' + digits, 6, 600);

  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  let row, r, autoText, fileUrl;
  const sh = getSheet_();
  try {
    row = findRowByRef_(ref);
    if (!row) throw new Error('ไม่พบการจองนี้ / Booking not found');
    r = rowObj_(sh, row);
    if (phoneKey_(r.phone) !== digits) throw new Error('ไม่พบการจองนี้ / Booking not found');
    if (r.status !== STATUS.PROBLEM) throw new Error('การจองนี้ไม่ต้องแนบสลิปเพิ่ม / This booking does not need a new slip');

    const pre = preCheck_(d.slipToken, r.qty, '', false);
    autoText = pre.text;
    fileUrl = saveSlip_(d.slipData, d.slipMime, ref + '_reupload_' + r.name);

    const set = (h, v) => sh.getRange(row, COL(h)).setValue(v);
    const stamp = Utilities.formatDate(new Date(), TZ, 'd/MM HH:mm');
    set('Slip Link', [r.slipLink, fileUrl].filter(Boolean).join('\n'));
    if (pre.slip && pre.slip.transRef) set('Trans Ref', "'" + [String(r.transRef).replace(/^'/, ''), pre.slip.transRef].filter(Boolean).join(', '));
    set('Auto Check', [r.autoCheck, stamp + ' re-upload: ' + autoText + (pre.slip ? ' (' + fmt_(pre.slip.amount) + ' THB)' : '')].filter(Boolean).join('\n'));
    set('Internal Note', [r.internal, stamp + ' previous problem: ' + r.reason + (r.note ? ' – ' + r.note : '')].filter(Boolean).join('\n'));
    set('Problem Reason', '');
    set('Note to Guest', '');
    set('Payment Status', STATUS.PENDING);
    set('Updated At', new Date());
    logEmail_(sh, row, 'SLIP RE-UPLOADED by guest');
    if (d.slipToken) CacheService.getScriptCache().remove('slip_' + d.slipToken);
  } finally {
    lock.releaseLock();
  }
  notifyAdmin_('🔁 New slip uploaded – check again: ' + ref,
    ref + ' · ' + r.name + ' · ' + r.qty + ' pax · ' + fmt_(r.amount) + ' THB · previous problem: ' + r.reason, autoText, fileUrl);
  return { ref: ref, status: STATUS.PENDING };
}

/* ======================================================================
 *  EMAILS
 * ====================================================================== */

function sendTemplate_(kind, r) {
  if (!CONFIG.EMAIL.SEND || !r.email) return false;
  const m = buildEmail_(kind, r);
  try {
    MailApp.sendEmail({ to: r.email, subject: m.subject, htmlBody: m.html, body: m.text,
      name: CONFIG.EMAIL.SENDER_NAME, replyTo: CONFIG.EMAIL.REPLY_TO || undefined });
    return true;
  } catch (e) {
    console.warn(kind + ' email failed for ' + r.ref + ': ' + e);
    return false;
  }
}

/** Fills a template → { subject, html (poster frame), text (plain, for pasting into Gmail) }. */
function buildEmail_(kind, r) {
  const t = CONFIG.EMAIL.TEMPLATES[kind];
  const p = r.reason ? problemOf_(r.reason) : { th: '', fix: '' };
  const statusLink = CONFIG.SITE_URL.replace(/\/$/, '') + '/#status';
  const vars = {
    name: r.name, ref: r.ref, entryCode: r.entryCode || '', qty: r.qty, amount: fmt_(r.amount),
    event: CONFIG.EVENT_NAME, date: CONFIG.EVENT_DATE, time: CONFIG.EVENT_TIME, venue: CONFIG.VENUE,
    mapUrl: CONFIG.MAP_URL, problem: p.th, fix: p.fix, note: r.note || '', statusLink: statusLink,
    line: CONFIG.CONTACT_LINE, lineUrl: CONFIG.LINE_URL, phone: CONFIG.CONTACT_PHONE
  };
  const fill = (s, html) => String(s).replace(/\{\{(\w+)\}\}/g, (m, k) => {
    if (!(k in vars)) return m;
    const v = String(vars[k] === undefined || vars[k] === null ? '' : vars[k]);
    return html && !/Url$|Link$/.test(k) ? esc_(v) : v;
  });
  const titles = { RECEIVED: 'ได้รับการลงทะเบียนแล้ว', APPROVED: "YOU'RE IN! · ยืนยันการชำระเงินแล้ว", PROBLEM: 'ต้องแก้ไขการชำระเงิน' };
  const body = fill(t.BODY, true);
  const text = htmlToText_(body) + '\n\n—\n' + CONFIG.HOUSE_RULES + '\n' + CONFIG.REFUND_POLICY
    + '\nLINE ' + CONFIG.CONTACT_LINE + ' (' + CONFIG.LINE_URL + ') · โทร ' + CONFIG.CONTACT_PHONE
    + (CONFIG.CONTACT_EMAIL ? ' · ' + CONFIG.CONTACT_EMAIL : '') + '\n' + CONFIG.BRAND + ' × ' + CONFIG.CO_HOST;
  return { subject: fill(t.SUBJECT, false), html: wrapEmail_(titles[kind] || '', body), text: text };
}

function htmlToText_(h) {
  return String(h)
    .replace(/<a [^>]*href="([^"]+)"[^>]*>(.*?)<\/a>/gi, (m, url, label) => label === url ? url : label + ' (' + url + ')')
    .replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;/g, "'")
    .replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
}

function notifyAdmin_(subject, line, autoCheck, slipUrl) {
  if (!CONFIG.ADMIN_EMAIL) return;
  try {
    MailApp.sendEmail({ to: CONFIG.ADMIN_EMAIL, name: CONFIG.BRAND + ' registration', subject: subject,
      htmlBody: esc_(line) + '<br>Auto check: ' + esc_(autoCheck || '-') + '<br>'
        + 'Slip: <a href="' + slipUrl + '">open</a> · Sheet: <a href="' + ss_().getUrl() + '">open</a><br>'
        + '<small>Set "Payment Status" in the Sheet to Approved or Problem (+ Problem Reason). '
        + (CONFIG.EMAIL.SEND ? 'The guest email goes out automatically.' : 'Then send the guest the text in "Email Draft" from Gmail and set "Email Status" to Sent.') + '</small>' });
  } catch (e) { console.warn('Admin email failed: ' + e); }
}

function wrapEmail_(title, inner) {
  const ink = '#33363c', slate = '#2f3640', cream = '#f2efc4', gold = '#8f5626';
  const logo = CONFIG.SITE_URL
    ? '<img src="' + CONFIG.SITE_URL.replace(/\/$/, '') + '/assets/logo.png" width="200" alt="openface" style="display:block;margin:0 auto 6px;width:200px;height:auto">'
    : '<div style="text-align:center;font-family:\'Courier New\',monospace;font-weight:bold;letter-spacing:4px;font-size:26px;color:' + ink + '">openface</div>';
  return '<div style="background:' + cream + ';padding:28px 16px;font-family:Helvetica,Arial,sans-serif">'
   + '<div style="max-width:520px;margin:0 auto;background:#f8f5d8;border:3px solid ' + ink + ';border-radius:16px;overflow:hidden">'
   + '<div style="padding:22px 24px 10px">' + logo
   + '<div style="text-align:center;font-size:11px;letter-spacing:3px;color:#5b5d62">× ' + (CONFIG.CO_HOST || '').toUpperCase() + '</div></div>'
   + '<div style="background:' + slate + ';color:' + cream + ';text-align:center;padding:14px 12px;font-family:Impact,\'Arial Narrow Bold\',sans-serif;font-size:26px;letter-spacing:1px">' + CONFIG.EVENT_NAME + '</div>'
   + '<div style="padding:22px 24px;color:' + ink + ';font-size:15px;line-height:1.55">'
   + (title ? '<h2 style="margin:0 0 10px;color:' + ink + ';font-family:Impact,\'Arial Narrow Bold\',sans-serif;font-weight:normal;font-size:24px;letter-spacing:.5px">' + title + '</h2>' : '')
   + inner
   + '<p style="color:#5b5d62;font-size:12px;margin-top:18px">' + CONFIG.HOUSE_RULES + '<br>' + CONFIG.REFUND_POLICY + '</p>'
   + '<p style="color:#5b5d62;font-size:13px">LINE <a href="' + CONFIG.LINE_URL + '" style="color:' + gold + '">' + CONFIG.CONTACT_LINE + '</a> · โทร ' + CONFIG.CONTACT_PHONE + (CONFIG.CONTACT_EMAIL ? ' · <a href="mailto:' + CONFIG.CONTACT_EMAIL + '" style="color:' + gold + '">' + CONFIG.CONTACT_EMAIL + '</a>' : '') + '</p>'
   + '</div>'
   + '<div style="background:' + slate + ';color:' + cream + ';text-align:center;padding:12px;font-family:Impact,\'Arial Narrow Bold\',sans-serif;font-size:22px;letter-spacing:1px">AT OPENFACE BKK</div>'
   + '</div></div>';
}

/** Preview every template to ADMIN_EMAIL with sample data (run from the editor or the menu). */
function sendTestEmails() {
  const sample = { ref: CONFIG.ID_PREFIX + '0000', name: 'ทดสอบ Test', email: CONFIG.ADMIN_EMAIL, qty: 2,
                   amount: 2 * CONFIG.PRICE_PER_PERSON, entryCode: CONFIG.CODE_PREFIX + 'TEST',
                   reason: CONFIG.PROBLEMS[0].key, note: 'ตัวอย่างข้อความถึงลูกค้า' };
  const parts = ['APPROVED', 'PROBLEM'].concat(CONFIG.EMAIL.SEND ? ['RECEIVED'] : []).map(k => {
    const m = buildEmail_(k, sample);
    return '<h3>' + k + ' · ' + esc_(m.subject) + '</h3>' + (CONFIG.EMAIL.SEND ? m.html : '<pre style="white-space:pre-wrap;font-family:inherit">' + esc_(m.text) + '</pre>');
  });
  MailApp.sendEmail({ to: CONFIG.ADMIN_EMAIL, subject: '[Preview] ' + CONFIG.EVENT_NAME + ' guest emails',
    htmlBody: parts.join('<hr>'), name: CONFIG.BRAND + ' registration' });
}

/* ======================================================================
 *  SHEET MENU + ONE-TIME SETUP
 * ====================================================================== */

function onOpen() {
  const manual = !CONFIG.EMAIL.SEND;
  SpreadsheetApp.getUi().createMenu('openface')
    .addItem(manual ? 'สร้างร่างอีเมลใหม่ (แถวที่เลือก) · Rebuild email draft for selected rows' : 'ส่งอีเมลซ้ำ (แถวที่เลือก) · Resend email for selected rows', 'menuResend')
    .addItem(manual ? 'อีเมลที่ยังไม่ได้ส่ง · List emails still to send' : 'ส่งอีเมลที่ยังค้าง · Send any missing emails', 'menuSweep')
    .addItem('ส่งตัวอย่างอีเมลหาแอดมิน · Send email preview to admin', 'sendTestEmails')
    .addSeparator()
    .addItem('Setup / repair sheet', 'setup')
    .addToUi();
}

function menuResend() {
  const sh = SpreadsheetApp.getActiveSheet();
  if (sh.getName() !== CONFIG.SHEET_NAME) return SpreadsheetApp.getUi().alert('เปิดชีต ' + CONFIG.SHEET_NAME + ' ก่อน');
  const rg = sh.getActiveRange();
  const res = [];
  for (let r = Math.max(2, rg.getRow()); r < rg.getRow() + rg.getNumRows(); r++) res.push('Row ' + r + ': ' + processRow_(sh, r, true, false));
  SpreadsheetApp.getUi().alert(res.join('\n'));
}

/** Catches rows edited while the trigger was off, or pasted in bulk. */
function menuSweep() {
  const sh = getSheet_();
  const res = [];
  for (let r = 2; r <= sh.getLastRow(); r++) {
    const x = processRow_(sh, r, false, false);
    if (CONFIG.EMAIL.SEND ? /→|FAILED/.test(x) : /^To send/.test(sh.getRange(r, COL('Email Status')).getValue()))
      res.push('Row ' + r + ' · ' + sh.getRange(r, COL('Booking Ref')).getValue() + ': ' + (CONFIG.EMAIL.SEND ? x : sh.getRange(r, COL('Email Status')).getValue()));
  }
  SpreadsheetApp.getUi().alert(res.length ? res.join('\n') : 'ไม่มีอีเมลค้าง · Nothing to send');
}

function setup() {
  const sh = getSheet_();
  getFolder_();
  styleSheet_(sh);
  ScriptApp.getProjectTriggers()
    .filter(t => ['onStatusEdit', 'onAdminEdit'].indexOf(t.getHandlerFunction()) >= 0)
    .forEach(t => ScriptApp.deleteTrigger(t));
  ScriptApp.newTrigger('onAdminEdit').forSpreadsheet(ss_()).onEdit().create();
}

function styleSheet_(sh) {
  const N = 2000;
  sh.getRange(1, 1, 1, HEADERS.length).setFontWeight('bold').setBackground('#33363c').setFontColor('#f2efc4');
  ['Payment Status', 'Problem Reason', 'Note to Guest', 'Email Status'].forEach(h =>
    sh.getRange(1, COL(h)).setBackground('#c98a3c').setFontColor('#2f3640'));
  sh.getRange(2, COL('Payment Status'), N, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList([STATUS.PENDING, STATUS.APPROVED, STATUS.PROBLEM, STATUS.CANCELLED], true).build());
  sh.getRange(2, COL('Problem Reason'), N, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList(CONFIG.PROBLEMS.map(p => p.key), true).setAllowInvalid(false).build());
  sh.getRange(2, COL('Email Status'), N, 1).setDataValidation(
    SpreadsheetApp.newDataValidation().requireValueInList([MAIL.WAITING, MAIL.TO_APPROVED, MAIL.SENT_APPROVED, MAIL.TO_PROBLEM, MAIL.SENT_PROBLEM, MAIL.NOT_NEEDED], true).build());
  const rng = sh.getRange(2, COL('Payment Status'), N, 1);
  const mrng = sh.getRange(2, COL('Email Status'), N, 1);
  const colors = [[STATUS.APPROVED, '#d4ecd1', '#1e5a2a'], [STATUS.PENDING, '#fbe6bf', '#7a4b0c'],
                  [STATUS.PROBLEM, '#f7d2c8', '#8a2b1a'], [STATUS.CANCELLED, '#e1e1e1', '#666666']];
  const mcolors = [['To send', '#fbe6bf', '#7a4b0c'], ['Sent', '#d4ecd1', '#1e5a2a'], ['Waiting', '#ececec', '#666666'], ['Not needed', '#e1e1e1', '#666666']];
  const keep = sh.getConditionalFormatRules().filter(rule =>
    !rule.getRanges().some(r => r.getColumn() === COL('Payment Status') || r.getColumn() === COL('Email Status')));
  sh.setConditionalFormatRules(keep
    .concat(colors.map(c => SpreadsheetApp.newConditionalFormatRule()
      .whenTextEqualTo(c[0]).setBackground(c[1]).setFontColor(c[2]).setRanges([rng]).build()))
    .concat(mcolors.map(c => SpreadsheetApp.newConditionalFormatRule()
      .whenTextStartsWith(c[0]).setBackground(c[1]).setFontColor(c[2]).setRanges([mrng]).build())));
  sh.getRange(2, COL('Email Draft'), N, 1).setWrapStrategy(SpreadsheetApp.WrapStrategy.CLIP);
  sh.setColumnWidth(COL('Email Status'), 190);
  sh.getRange(2, COL('Email Sent At'), N, 1).setNumberFormat('d/mm/yyyy hh:mm');
  sh.setColumnWidth(COL('Email Draft'), 220);
  sh.getRange(2, COL('Slip Time'), N, 1).setNumberFormat('d/mm/yyyy hh:mm');
  sh.getRange(2, COL('Updated At'), N, 1).setNumberFormat('d/mm/yyyy hh:mm');
  sh.setColumnWidth(COL('Problem Reason'), 240);
  sh.setColumnWidth(COL('Email Log'), 260);
}

/* ======================================================================
 *  HELPERS
 * ====================================================================== */

function rowObj_(sh, row) {
  const v = sh.getRange(row, 1, 1, HEADERS.length).getValues()[0];
  const g = h => v[COL(h) - 1];
  return {
    row: row, ref: String(g('Booking Ref') || ''), name: String(g('Full Name') || ''), phone: String(g('Phone') || ''),
    email: String(g('Email') || '').trim(), qty: g('Attendees'), amount: g('Amount (THB)'),
    status: String(g('Payment Status') || ''), reason: String(g('Problem Reason') || ''), note: String(g('Note to Guest') || ''),
    entryCode: String(g('Entry Code') || ''), mailState: String(g('Email Status') || ''), log: String(g('Email Log') || ''), internal: String(g('Internal Note') || ''),
    slipLink: String(g('Slip Link') || ''), transRef: String(g('Trans Ref') || ''), autoCheck: String(g('Auto Check') || '')
  };
}

function logEmail_(sh, row, text) {
  const cell = sh.getRange(row, COL('Email Log'));
  const prev = String(cell.getValue() || '');
  cell.setValue((prev ? prev + '\n' : '') + Utilities.formatDate(new Date(), TZ, 'd/MM HH:mm') + ' ' + text);
}

function problemOf_(key) {
  return CONFIG.PROBLEMS.filter(p => p.key === key)[0]
      || { key: String(key), th: String(key), fix: 'ทัก LINE ' + CONFIG.CONTACT_LINE, reupload: true };
}

function newEntryCode_(sh) {
  const n = sh.getLastRow() - 1;
  const used = n > 0 ? sh.getRange(2, COL('Entry Code'), n, 1).getValues().map(x => String(x[0])) : [];
  const abc = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
  for (let i = 0; i < 50; i++) {
    let c = CONFIG.CODE_PREFIX;
    for (let j = 0; j < 4; j++) c += abc.charAt(Math.floor(Math.random() * abc.length));
    if (used.indexOf(c) < 0) return c;
  }
  throw new Error('Could not create a unique entry code');
}

function findRowByRef_(ref) {
  const sh = getSheet_();
  const n = sh.getLastRow() - 1;
  if (n <= 0) return 0;
  const ids = sh.getRange(2, COL('Booking Ref'), n, 1).getValues();
  for (let i = 0; i < n; i++) if (String(ids[i][0]).toUpperCase() === ref) return i + 2;
  return 0;
}

function saveSlip_(dataUrl, mime, baseName) {
  const m = mime || 'image/jpeg';
  const ext = /png/.test(m) ? '.png' : /pdf/.test(m) ? '.pdf' : '.jpg';
  const b64 = String(dataUrl).split(',').pop();
  const blob = Utilities.newBlob(Utilities.base64Decode(b64), m, String(baseName).slice(0, 80) + ext);
  return getFolder_().createFile(blob).getUrl();
}

/** Last 9 digits, so 0812345678, 081-234-5678 and +66812345678 all match. */
function phoneKey_(p) { return String(p || '').replace(/\D/g, '').slice(-9); }

function maskName_(s) {
  const parts = String(s || '').trim().split(/\s+/);
  return parts[0] + (parts[1] ? ' ' + parts[1].charAt(0) + '.' : '');
}

function throttle_(key, max, seconds) {
  const cache = CacheService.getScriptCache();
  const n = Number(cache.get(key) || 0) + 1;
  if (n > max) throw new Error('ลองใหม่อีกครั้งในอีกสักครู่ / Too many tries, please wait a few minutes');
  cache.put(key, String(n), seconds);
}

function esc_(s) {
  return String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

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

/** Booking ref that already used this bank transaction (ignores Cancelled rows). */
function findTransRef_(ref) {
  const sh = getSheet_();
  const n = sh.getLastRow() - 1;
  if (n <= 0 || !ref) return null;
  const data = sh.getRange(2, 1, n, HEADERS.length).getValues();
  for (let i = 0; i < n; i++) {
    const v = data[i];
    if (v[COL('Payment Status') - 1] === STATUS.CANCELLED) continue;
    const refs = String(v[COL('Trans Ref') - 1]).replace(/^'/, '').split(/[,\s]+/);
    if (refs.indexOf(ref) >= 0) return v[COL('Booking Ref') - 1];
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

/** Returns the Registrations sheet with the current headers. An older layout is renamed, never deleted. */
function getSheet_() {
  const ss = ss_();
  let sh = ss.getSheetByName(CONFIG.SHEET_NAME);
  if (sh && sh.getLastRow() > 0) {
    const head = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0].map(String);
    if (head.slice(0, HEADERS.length).join('|') !== HEADERS.join('|') && migrateHeaders_(sh, head)) {
      // upgraded in place – keep going with the same sheet
    } else if (head.slice(0, HEADERS.length).join('|') !== HEADERS.join('|')) {
      if (sh.getLastRow() === 1) { sh.clear(); }
      else { sh.setName(CONFIG.SHEET_NAME + ' (old ' + Utilities.formatDate(new Date(), TZ, 'd MMM HH:mm') + ')'); sh = null; }
    }
  }
  if (!sh) sh = ss.insertSheet(CONFIG.SHEET_NAME);
  if (sh.getLastRow() === 0) {
    sh.appendRow(HEADERS);
    sh.setFrozenRows(1);
    styleSheet_(sh);
  }
  return sh;
}

/** Upgrades an older column layout in place (renames + inserts new columns) so existing bookings stay put.
 *  Returns false when the layout can't be upgraded safely (then the caller keeps the old tab and starts fresh). */
function migrateHeaders_(sh, head) {
  const RENAMED = { 'Customer Email': 'Email Status' };
  let cur = head.map(h => RENAMED[h] || h);
  // every existing column must still exist, in the same relative order
  const known = cur.filter(h => h !== '');
  if (known.some(h => HEADERS.indexOf(h) < 0)) return false;
  for (let i = 1; i < known.length; i++) if (HEADERS.indexOf(known[i]) < HEADERS.indexOf(known[i - 1])) return false;
  head.forEach((h, i) => { if (RENAMED[h]) sh.getRange(1, i + 1).setValue(RENAMED[h]); });
  HEADERS.forEach((h, i) => {
    if (cur[i] === h) return;
    sh.insertColumnBefore(i + 1);
    sh.getRange(1, i + 1).setValue(h);
    cur.splice(i, 0, h);
  });
  // fill the new "Email Status" for rows that never had one
  const n = sh.getLastRow() - 1;
  if (n > 0 && !CONFIG.EMAIL.SEND) {
    const rng = sh.getRange(2, COL('Email Status'), n, 1);
    const st = sh.getRange(2, COL('Payment Status'), n, 1).getValues();
    rng.setValues(rng.getValues().map((v, i) => [v[0] ||                     // Approved/Problem rows: admin decides
      (st[i][0] === STATUS.CANCELLED ? MAIL.NOT_NEEDED : st[i][0] === STATUS.PENDING ? MAIL.WAITING : '')]));
  }
  styleSheet_(sh);
  return true;
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
  return data.reduce((sum, r) =>
    r[COL('Payment Status') - 1] === STATUS.CANCELLED ? sum : sum + (Number(r[COL('Attendees') - 1]) || 0), 0);
}
