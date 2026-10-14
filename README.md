# openface × No Judgment Gathering · ANNYONG SPOOKY HALLOWEEN NIGHT

The registration site for **ANNYONG 안녕 SPOOKY HALLOWEEN NIGHT** at openface BKK: **Sat 31 Oct 2026, 10 PM – 2 AM (register 22:00, DJ 22:30), DJ, free-flow alcohol, Korean bites. Dress code: everything Korean. 1,199 THB.**

The page (`index.html`) is hosted on **Vercel**. The **Google Apps Script** (`apps-script/Code.gs`) is the backend: it writes to the Google Sheet, saves slips to Drive and sends the emails.

## How a booking flows

| # | Who | What happens |
|---|---|---|
| 1 | Guest | Registers on the site, pays with the K SHOP QR and uploads the slip. A row is added to the Sheet with **Payment Status = Pending**. The guest gets a "we received your registration" email. The admin gets a notice. |
| 2 | Admin | Opens the Sheet, opens the slip (`Slip Link`) and checks it against the **bank statement** (amount, time, sender). The `Auto Check` column is only a hint. |
| 3a | Admin | Sets **Payment Status → Approved**. An entry code (e.g. `ANN-7KQ3`) is created and the **APPROVED** email goes out with it. |
| 3b | Admin | Sets **Payment Status → Problem** and picks a **Problem Reason** (picking a reason alone also sets Problem). Optional: type a message in **Note to Guest** *first*. The **PROBLEM** email goes out with the reason, how to fix it and the status link. |
| 4 | Guest | Goes to the site → **Check status** (`/#status`) → types the phone number. They see Pending / Approved + entry code / Problem + what to do. For most problems they can **upload a new slip** there; the row goes back to **Pending** and the admin gets a notice. |

Each email is sent once per status. The `Email Log` column records every email. To send one again, select the row and use **openface ▸ Resend email for selected rows**.

### Sheet columns the admin edits
| Column | Use |
|---|---|
| **Payment Status** | `Pending` · `Approved` · `Problem` · `Cancelled` (colour-coded) |
| **Problem Reason** | Dropdown, see below |
| **Note to Guest** | ⚠️ The guest **sees** this in the Problem email and on the status page. Fill it in *before* choosing the reason. |
| **Internal Note** | Team only. Re-upload history is written here. |

Do not edit: `Booking Ref`, `Phone`, `Entry Code`, `Email Log`.

### Problem reasons (dropdown)
| Reason | Guest sees | Guest can re-upload |
|---|---|---|
| Amount short – โอนไม่ครบ | ยอดโอนไม่ครบ → โอนส่วนที่ขาดแล้วแนบสลิปเพิ่ม | ✓ |
| Amount over – โอนเกิน | ยอดโอนเกิน → ทีมงานติดต่อกลับ / ทัก LINE | – |
| Not received – ไม่พบยอดเงินเข้า | ไม่พบยอดเงินเข้า → ตรวจกับธนาคาร แล้วแนบสลิปที่ถูกต้อง | ✓ |
| Wrong account – โอนผิดบัญชี | โอนผิดบัญชี → ติดต่อธนาคาร ชำระใหม่ด้วย QR บนเว็บ | ✓ |
| Unclear slip – สลิปไม่ชัด/ไม่ครบ | สลิปไม่ชัด → แนบรูปสลิปต้นฉบับจากแอป | ✓ |
| Duplicate slip – สลิปซ้ำ | สลิปถูกใช้กับการจองอื่น | ✓ |
| Wrong slip / date – สลิปไม่ใช่รายการนี้ | วันที่/รายการไม่ตรง → แนบสลิปของงานนี้ | ✓ |
| Guest count – จำนวนคนไม่ตรงยอด | จำนวนคนไม่ตรงยอด → ทัก LINE | – |
| Contact info – ข้อมูลติดต่อไม่ถูกต้อง | ข้อมูลติดต่อผิด → ทัก LINE | – |
| Other – อื่น ๆ (ดู Note to Guest) | Shows your *Note to Guest* | ✓ |

Edit the wording in `CONFIG.PROBLEMS` in Code.gs, then run **setup()** again so the dropdown updates.

## Files
| File | What it is |
|---|---|
| `index.html` | The site: poster hero, registration form, K SHOP Thai QR with the amount filled in, slip upload with an optional pre-check, and the **Check status** section |
| `assets/` | Poster and logos |
| `config.js` | **`API_URL`** (the Apps Script `/exec` URL) and display defaults. Empty = "Registration opens soon". `?demo=1` = demo with fake data. |
| `apps-script/Code.gs` | The backend. Event details, email templates (`CONFIG.EMAIL.TEMPLATES`), problem list and sender live in its `CONFIG`. |

## 1 · Backend (Google Apps Script)
1. Open the event Sheet → **Extensions → Apps Script**.
2. Replace `Code.gs` with `apps-script/Code.gs` from this repo.
3. Fill in the `// TODO` values:
   - `EMAIL.FROM_ALIAS`: the address the letters should come from. It must already be set up under Gmail → Settings → *Send mail as* for the Google account that owns the script. Leave it empty to send from that account itself.
   - `EMAIL.TEMPLATES`: paste the final RECEIVED / APPROVED / PROBLEM letters. They use `{{placeholders}}`; the list is in the comment above them.
4. Run **setup()** once and approve the permissions (Sheets, Drive, Gmail). This creates the columns, the dropdowns, the colours and the trigger that sends the emails when you change the status.
   - If the sheet already has rows in the old layout, `setup()` renames it to "Registrations (old …)" and starts a fresh one. Nothing is deleted.
5. Run **sendTestEmails()** to receive all 3 letters at `ADMIN_EMAIL`.
6. **Deploy → New deployment → Web app**, with *Execute as:* **Me** and *Who has access:* **Anyone**. Copy the URL ending in `/exec`.
   - After later edits: **Deploy → Manage deployments → Edit → New version**. That keeps the same URL.
7. Optional slip pre-check (SlipOK): add `SLIPOK_API_KEY` in Script properties and set `SLIP_CHECK.SLIPOK_BRANCH_ID`. Without it, guests upload the slip and the team checks everything.

## 2 · Point the site at the backend
Put the `/exec` URL into `config.js` (`API_URL: '…/exec'`) and commit. Vercel redeploys automatically.

## 3 · Test before announcing
- [ ] Scan the QR for 1 guest in KBank, SCB and one other bank app. Each should show **โอเพ่น เฟซ** with 1,199 pre-filled.
- [ ] Set `PRICE_PER_PERSON: 1` in Code.gs, deploy a new version, register with your own phone/email and pay 1 THB. The row must appear as **Pending** and the RECEIVED email must arrive.
- [ ] Set it to **Problem** + a reason → PROBLEM email. On the site → Check status → upload a new slip → the row goes back to **Pending**.
- [ ] Set it to **Approved** → APPROVED email with the entry code, and the code shows on Check status.
- [ ] Set the price back to 1199 and deploy a new version.

## Versions
The page footer shows e.g. `v2.1.0 · 14 Oct 2026 · LIVE · backend v2.1.0 ✓`.
- **Mode:** LIVE (backend connected) · DEMO (`?demo=1`, fake data) · SOON (no backend yet).
- **Backend:** ✓ when `CODE_VERSION` in Code.gs has the same MAJOR.MINOR as the site. ⚠ means Apps Script was not redeployed (Deploy → Manage deployments → Edit → **New version**), or it is offline.
- Open tabs check for a newer site every 10 minutes and when brought back into focus, then show a "มีเวอร์ชันใหม่ · รีเฟรช" bar. It never reloads by itself.
- Bump rule: `APP_VERSION` in index.html (and `APP_DATE`) on every release. MAJOR = booking process change, MINOR = feature/wording/flow, PATCH = fix only. Bump `CODE_VERSION` in Code.gs when the backend changes; keep MAJOR.MINOR in step.

| Version | Change |
|---|---|
| v2.3.0 | Event admin + guest contact email: nojudgmentgathering@gmail.com |
| v2.2.0 | Price 1,199 THB per person |
| v2.1.0 | Version footer, backend version check, "new version" notice |
| v2.0.0 | Admin approval in the Sheet, emails, status check by phone |
| v1.2.0 | Slip-check fix (shared K SHOP biller ID), demo only with `?demo=1` |
| v1.1.0 | Restyled to the ANNYONG poster and openface logo |
| v1.0.0 | First site |

## Notes and risks
- **Status by phone number only** (as requested): anyone who knows a guest's phone number can see that guest's booking and entry code. Names are shortened on screen. To require the booking ref too, set `STATUS_REQUIRE_REF: true`.
- **Check entry codes against the Sheet at the door.** A screenshot of someone else's code is the main way people would get in without paying.
- **This repo is public.** It holds no secrets, but the Sheet ID and the payment QR are visible to anyone.
- **The Apps Script URL is public.** Nothing is ever approved automatically, but watch for spam rows. Status lookups are rate-limited.
- **Gmail quota:** about 100 emails a day on a free Gmail account, 1,500 on Google Workspace. Each booking uses 2 to 3 emails.
