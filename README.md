# openface × No Judgment Gathering · ANNYEONG SPOOKY HALLOWEEN NIGHT

The registration site for **ANNYEONG 안녕 SPOOKY HALLOWEEN NIGHT** at openface BKK: **Sat 31 Oct 2026, 10 PM – 2 AM (register 22:00, DJ 22:30), DJ, free-flow alcohol, Korean bites. Dress code: everything Korean. 1,199 THB.**

The page (`index.html`) is hosted on **Vercel**. The **Google Apps Script** (`apps-script/Code.gs`) is the backend: it writes to the Google Sheet, saves slips to Drive and sends the emails.

## How a booking flows

**Accounts:** the backend runs as **theerapatpa@gmail.com** (owns the Sheet and Apps Script). **nojudgmentgathering@gmail.com** is an editor of the Sheet, gets the admin notices, and receives guest replies.

**Guest emails are sent by hand** (`CONFIG.EMAIL.SEND: false`). The script never emails guests; it prepares the text.

| # | Who | What happens |
|---|---|---|
| 1 | Guest | Registers on the site, pays with the K SHOP QR and uploads the slip. A row is added with **Payment Status = Pending**. The admin gets a notice. |
| 2 | Admin | Opens the slip (`Slip Link`) and checks it against the **KBank statement**: amount, time, sender. `Auto Check` is only a hint. |
| 3a | Admin | Sets **Payment Status → Approved**. An entry code (e.g. `ANN-7KQ3`) is created, `Email Draft` gets the confirmation letter, and **Email Status** shows `To send – Approved`. |
| 3b | Admin | Types an optional **Note to Guest**, then picks a **Problem Reason**. Picking a reason sets **Payment Status → Problem** on its own. `Email Draft` gets the problem letter, and **Email Status** shows `To send – Problem`. |
| 4 | Admin | Clicks the `Email Draft` cell and opens the link. A Gmail window opens with the guest's address and the subject filled in. Copy the cell text below the "Subject" line into the email body, send it, then set **Email Status → Sent – …**. |
| 5 | Guest | On the site → **Check status** (`/#status`), types the phone number and sees Pending, Approved with the entry code, or Problem with what to do. For most problems they can **upload a new slip** there. The row goes back to **Pending** and the admin gets a notice. |

Use **openface ▸ List emails still to send** for everything still marked `To send`. Use **openface ▸ Rebuild email draft for selected rows** after editing a template. `Email Log` records when each draft was created.

**The guest sees the result on Check status immediately, whether or not the email has been sent.** The email is the courtesy copy.

### Sheet columns the admin edits
| Column | Use |
|---|---|
| **Payment Status** | **The payment-approval status:** `Pending` (yellow) · `Approved` (green) · `Problem` (red) · `Cancelled` (grey) |
| **Problem Reason** | Dropdown, see below |
| **Note to Guest** | ⚠️ The guest **sees** this in the Problem letter and on the status page |
| **Email Status** | **The guest-email confirmation status:** `Waiting – payment check` (grey, new booking) → `To send – Approved` / `To send – Problem` (yellow, set by the script when the letter is ready) → `Sent – Approved` / `Sent – Problem` (green, **you** set it after sending) · `Not needed` (cancelled before any email) |
| **Email Sent At** | Filled in automatically when you choose `Sent – …`, and cleared if you change it back. The log records each change. |
| **Internal Note** | Team only. Re-upload history is written here. |

Do not edit: `Booking Ref`, `Phone`, `Entry Code`, `Email Sent At`, `Email Draft`, `Email Log`.

**Upgrading from v2.4:** paste the new Code.gs and run `setup()`. It renames `Customer Email` to `Email Status` and inserts `Email Sent At` **in the same tab**, so existing bookings stay put. Then Deploy → Manage deployments → Edit → New version.

If a booking is set back from Approved after `Sent – Approved`, Email Status stays `Sent – Approved`. The guest already has an entry code, so contact them yourself.

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
1. Signed in as **theerapatpa@gmail.com**, open the event Sheet → **Share** → add **nojudgmentgathering@gmail.com** as **Editor**. Then go to **Extensions → Apps Script**.
2. Replace `Code.gs` with `apps-script/Code.gs` from this repo.
3. When the final letters are ready, paste them into `EMAIL.TEMPLATES` (APPROVED / PROBLEM). They use `{{placeholders}}`; the list is in the comment above them. `EMAIL.SEND` stays `false` (manual).
4. Run **setup()** once and approve the permissions (Sheets, Drive, Gmail). This creates the columns, the dropdowns, the colours and the trigger that issues entry codes and email drafts when you change the status. The trigger runs as theerapatpa even when nojudgmentgathering makes the edit.
   - If the sheet already has rows in the old layout, `setup()` renames it to "Registrations (old …)" and starts a fresh one. Nothing is deleted.
5. Run **sendTestEmails()**: nojudgmentgathering gets one preview email with the draft letters.
6. **Deploy → New deployment → Web app**, with *Execute as:* **Me** and *Who has access:* **Anyone**. Copy the URL ending in `/exec`.
   - After later edits: **Deploy → Manage deployments → Edit → New version**. That keeps the same URL.
7. Optional slip pre-check (SlipOK): add `SLIPOK_API_KEY` in Script properties and set `SLIP_CHECK.SLIPOK_BRANCH_ID`. Without it, guests upload the slip and the team checks everything.

## 2 · Point the site at the backend
Put the `/exec` URL into `config.js` (`API_URL: '…/exec'`) and commit. Vercel redeploys automatically.

## 3 · Test before announcing
- [ ] Scan the QR for 1 guest in KBank, SCB and one other bank app. Each should show **โอเพ่น เฟซ** with 1,199 pre-filled.
- [ ] Set `PRICE_PER_PERSON: 1` in Code.gs, deploy a new version, register with your own phone/email and pay 1 THB. The row must appear as **Pending**, and the admin notice must reach nojudgmentgathering.
- [ ] As **nojudgmentgathering**, pick a Problem Reason → Payment Status turns **Problem**, Email Status shows `To send – Problem`, and the draft is filled in. Open the Gmail link, paste the draft, send it to yourself, and mark it Sent. On the site → Check status → upload a new slip → the row goes back to **Pending**.
- [ ] Set it to **Approved** → entry code + `To send – Approved` draft, and the code shows on Check status.
- [ ] Set the price back to 1199 and deploy a new version.

## Versions
The page footer shows e.g. `v2.1.0 · 14 Oct 2026 · LIVE · backend v2.1.0 ✓`.
- **Mode:** LIVE (backend connected) · DEMO (`?demo=1`, fake data) · SOON (no backend yet).
- **Backend:** ✓ when `CODE_VERSION` in Code.gs has the same MAJOR.MINOR as the site. ⚠ means Apps Script was not redeployed (Deploy → Manage deployments → Edit → **New version**), or it is offline.
- Open tabs check for a newer site every 10 minutes and when brought back into focus, then show a "มีเวอร์ชันใหม่ · รีเฟรช" bar. It never reloads by itself.
- Bump rule: `APP_VERSION` in index.html (and `APP_DATE`) on every release. MAJOR = booking process change, MINOR = feature/wording/flow, PATCH = fix only. Bump `CODE_VERSION` in Code.gs when the backend changes; keep MAJOR.MINOR in step.

| Version | Change |
|---|---|
| v2.9.0 | Main contact everywhere is nojudgmentgathering@gmail.com (site, status page, slip hints, problem reasons, guest emails); LINE kept as a footer link |
| v2.8.1 | Slip-problem help button emails nojudgmentgathering@gmail.com (prefilled) instead of LINE |
| v2.8.0 | Animated "LET'S GET / FREE FLOW!" lines on the hero poster |
| v2.7.0 | Free slip reader on the guest's phone (Thai + English): amount, receiver, time, re-used slip. Approval stays manual |
| v2.6.0 | New promo artwork; event name ANNYEONG (poster spelling) |
| v2.5.0 | Email Status column (Waiting → To send → Sent), Email Sent At timestamp, Gmail permission narrowed to send-only |
| v2.4.1 | Mascot redrawn: croissant crescent with a record halo, all five moods |
| v2.4.0 | Guest emails sent by hand: Email Status + Email Draft with a Gmail link |
| v2.3.0 | Event admin + guest contact email: nojudgmentgathering@gmail.com |
| v2.2.0 | Price 1,199 THB per person |
| v2.1.0 | Version footer, backend version check, "new version" notice |
| v2.0.0 | Admin approval in the Sheet, emails, status check by phone |
| v1.2.0 | Slip-check fix (shared K SHOP biller ID), demo only with `?demo=1` |
| v1.1.0 | Restyled to the ANNYONG poster and openface logo |
| v1.0.0 | First site |

## Slip pre-screen (on the guest's phone)
When a guest attaches a slip, the page reads it **on their phone**. It uses Tesseract OCR with Thai and English, self-hosted in `ocr/v7/`, so there is no API key and no cost. It also reads the slip's bank QR. Then it checks:

| Check | How | If it fails |
|---|---|---|
| Amount | Reads `จำนวนเงิน / จำนวน / Amount / THB / บาท`. Ignores fee and balance lines. | ✕ + fix. Offers "change to N guests" when the amount fits another guest count |
| Receiver | `โอเพ่น เฟซ` / `โอเพ่น คิทเช่น` / openface, or shop code `KB000002299567`. Tolerates OCR misreads. | ✕ when another shop code or another receiver name is read |
| Time | Thai dates (`14 ต.ค. 69`, `14 ต.ค. 2569`) and English dates (`14 Oct 26`, `Oct 14, 2026`, `14/10/2026`) | ✕ if before registration opened, in the future, or older than 48 h |
| Re-used slip | The bank reference inside the slip QR, checked against the Sheet by the server | **Blocks** submitting. The server blocks it too, so it can't be bypassed |

- ✓ everywhere: the guest submits. ! (couldn't read): the guest can still submit. ✕: the guest fixes it, or taps "สลิปถูกต้อง ส่งให้ทีมงานตรวจ" (my slip is correct).
- The result is written to **Auto Check**, e.g. `Pre-screen on guest phone (OCR, not proof): amount ✓ · receiver ✕ · …`, plus the bank ref in **Trans Ref**.
- **It is not proof of payment.** An edited slip image can pass every check. Always approve against the KBank statement.
- First use downloads about 4 MB (cached afterwards). Reading takes about 2–4 s on a laptop and more on older phones. Phones without WebAssembly or DecompressionStream skip the reader and go straight to the team.
- To turn it off: `SLIP_CHECK.PRESCREEN: false` in Code.gs.

## Notes and risks
- **Status by phone number only** (as requested): anyone who knows a guest's phone number can see that guest's booking and entry code. Names are shortened on screen. To require the booking ref too, set `STATUS_REQUIRE_REF: true`.
- **Check entry codes against the Sheet at the door.** A screenshot of someone else's code is the main way people would get in without paying.
- **This repo is public.** It holds no secrets, but the Sheet ID and the payment QR are visible to anyone.
- **The Apps Script URL is public.** Nothing is ever approved automatically, but watch for spam rows. Status lookups are rate-limited.
- **Gmail quota:** about 100 emails a day on a free Gmail account, 1,500 on Google Workspace. Each booking uses 2 to 3 emails.
