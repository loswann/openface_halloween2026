# openface × No Judgment Gathering · ANNYONG SPOOKY HALLOWEEN NIGHT

The registration site for **ANNYONG 안녕 SPOOKY HALLOWEEN NIGHT** at openface BKK: **Sat 31 Oct 2026, 10 PM – 2 AM (register 22:00, DJ 22:30), DJ, free-flow alcohol, Korean bites. Dress code: everything Korean. 1,200 THB.**

The look follows the event poster: cream paper, charcoal ink, the slate bottom band, heavy condensed type, and the croissant-ghost DJ as the animated mascot.

The page itself (`index.html`) is hosted on **Vercel**. The **Google Apps Script** stays as the backend; it writes to the Google Sheet, saves slips to Drive, sends the emails and runs the SlipOK slip check.

```
Customer phone ──► Vercel (index.html + config.js)
                       │  fetch POST {action, data}
                       ▼
              Google Apps Script web app (apps-script/Code.gs)
                 ├─ Google Sheet "Registrations"
                 ├─ Drive folder (payment slips)
                 ├─ Gmail (confirmation + admin emails)
                 └─ SlipOK (verifies slip QR against bank data)
```

| File | What it is |
|---|---|
| `index.html` | The site: the poster as the hero, scrolling "LET'S GET FREE FLOW!" band, registration form, K SHOP Thai QR with the amount filled in, live slip checker with the croissant-ghost mascot, confirmation page with the croissant DJ |
| `assets/` | Poster (`poster.jpg`, `poster-540.jpg`, `og.jpg` for link previews) and the openface logo (`logo.png` in dark, `logo-cream.png` for the dark footer) |
| `config.js` | **`API_URL`** (the Apps Script `/exec` URL) and display defaults. While `API_URL` is empty the site runs in **demo mode**: nothing is saved, and a bar at the top lets you simulate each slip result. |
| `vercel.json` | Static hosting settings |
| `apps-script/Code.gs` | The backend. Paste it into Apps Script. Event details, price, QR payload and SlipOK settings live in its `CONFIG`. |

## 1 · Backend (Google Apps Script)
1. Open the event Sheet → **Extensions → Apps Script**.
2. Replace `Code.gs` with `apps-script/Code.gs` from this repo. If an `Index` HTML file is left over from the old version, you can delete it.
3. In **Project Settings → Script properties**, add `SLIPOK_API_KEY`. In `CONFIG.SLIP_CHECK`, set `SLIPOK_BRANCH_ID`.
4. Run `setup()` once and approve the permissions (Sheets, Drive, Gmail, external requests).
5. Optional: set `CONFIG.SITE_URL` to your Vercel address so the confirmation emails show the openface logo.
6. **Deploy → New deployment → Web app**, with *Execute as:* **Me** and *Who has access:* **Anyone**. Copy the URL ending in `/exec`.
   - When you change `Code.gs` later, go to **Deploy → Manage deployments → Edit → New version**. That keeps the same URL.

## 2 · Point the site at the backend
Put the `/exec` URL into `config.js`:
```js
API_URL: 'https://script.google.com/macros/s/XXXX/exec',
```
Commit it. Vercel redeploys automatically.

## 3 · Vercel (one-time)
1. vercel.com → **Add New… → Project → Import Git Repository** → `loswann/openface_halloween2026`.
2. Framework preset **Other**. Leave the build command and output directory empty, then click **Deploy**.
3. Optional: add a custom domain in Project → Settings → Domains.

From then on, every push to `main` goes live within about 30 seconds.

## 4 · Test before announcing
- [ ] Open the site and check the demo bar is gone, which means `API_URL` is set.
- [ ] Scan the QR for 1 guest (1,200 ฿) in KBank, SCB and one other bank app. Each should show **โอเพ่น เฟซ** with 1,200 pre-filled.
- [ ] Do one real registration. Temporarily set `PRICE_PER_PERSON: 1` in Code.gs and pay 1 THB. Check that the row lands in the Sheet as **Confirmed**, the slip is in Drive, and both emails arrive. Then set the price back to 1200 and deploy a new version.
- [ ] Try the same slip again. It must be rejected as a reused slip.

## Notes
- **This repo is public.** It holds no secrets: the SlipOK key lives in Script Properties, not in code. But the Sheet ID and the shop's payment QR are visible to anyone.
- **The Apps Script URL is public**, because the site needs to call it. Every submission still has to pass the slip check or land as *Pending* for a person to review. Watch the Sheet for spam.
- To change event details, edit `CONFIG` in Code.gs and deploy a new version. The site reads them live. `config.js` defaults are only shown for the split second before the live values load.
