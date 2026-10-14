/* =====================================================================
 *  openface · ANYONG SPOOKY HALLOWEEN NIGHT – site settings
 *
 *  API_URL: paste the Google Apps Script web-app URL here (ends in /exec).
 *  While it is empty the site runs in DEMO mode (nothing is saved).
 *
 *  DEFAULTS are shown instantly while the page loads; the live values
 *  come from the Apps Script CONFIG (so edit event details THERE).
 * ===================================================================== */
window.APP_CONFIG = {
  API_URL: '',

  DEFAULTS: {
    BRAND: 'openface',
    EVENT_NAME: 'ANYONG SPOOKY HALLOWEEN NIGHT',
    THEME: 'Korean Halloween in Bangkok',
    EVENT_DATE: 'เสาร์ 31 ต.ค. 2026 · Sat 31 Oct 2026',
    EVENT_TIME: 'ลงทะเบียน 22:00 · DJ 22:30 – 01:30',
    SCHEDULE: [['22:00', 'ลงทะเบียน', 'Register'], ['22:30', 'DJ ขึ้น', 'DJ up'], ['01:30', 'ปิดงาน', 'Till 01:30']],
    VENUE: '86/2 ถ.รามคำแหง 21 (ซ.นวศรี 15) วังทองหลาง กรุงเทพฯ',
    MAP_URL: 'https://share.google/kdPgH8cJINAYblTop',
    PRICE_PER_PERSON: 1200,
    PRICE_INCLUDES: 'Free-flow alcohol & small bites',
    DRESS_CODE: 'Korean Halloween',
    MAX_PER_BOOKING: 50, CAPACITY: 0, SEATS_TAKEN: 0, CLOSED: false,
    PAY_QR_PAYLOAD: '00020101021130810016A00000067701011201150107536000315010214KB0000022995670320KPS004KB00000229956731690016A00000067701011301030040214KB0000022995670420KPS004KB00000229956753037645802TH63044D15',
    PROMPTPAY_ID: '', SHOP_NAME: 'โอเพ่น เฟซ', BANK_NAME: 'กสิกรไทย (K SHOP)',
    ACCOUNT_NAME: 'บจก. โอเพ่น คิทเช่น', ACCOUNT_NO: '',
    CONTACT_LINE: '@openfacebkk', LINE_URL: 'https://lin.ee/9pQIgO3', CONTACT_PHONE: '082-556-3659',
    IG_URL: 'https://www.instagram.com/openfacebkk/',
    REFUND_POLICY: 'ไม่รับยกเลิกและไม่คืนเงินทุกกรณี · No cancellation, no refund',
    SLIP_CHECK_ON: true
  }
};
