# Emergency Viewer PWA

A **vanilla JS + HTML + CSS** progressive web-app meant for first-responders/doctors to quickly access a patient’s medical data when their QR/NFC tag is scanned.

## 1. How It Works

1. Flutter app generates a QR code with an **encrypted URL**: `https://medassist.me/viewer/#<token>`.
2. Doctor scans QR → opens this PWA in any mobile browser.
3. `script.js` decrypts token locally (AES) & fetches patient JSON from MedAssist cloud (or local device over BLE in offline mode).
4. Displays patient photo, blood group, allergies, conditions, emergency contacts. Large buttons for **Call / SMS**.

_No backend required – full static PWA._

## 2. Files

| File | Role |
|------|------|
| `index.html` | Single page layout, meta tags for `apple-mobile-web-app-capable`. |
| `style.css` | Mobile-first responsive style, dark-mode media query. |
| `script.js` | Routing, decryption, fetch, DOM rendering, offline cache via `localStorage`. |

## 3. Dev & Build

```bash
# Live reload
npx serve -l 5500 .

# Lighthouse audit (PWAscore > 0.95)
npx lighthouse http://localhost:5500 --preset pwa
```

## 4. Deployment

Simply host these three static files on **GitHub Pages**, **Firebase Hosting**, or integrate into Flutter web build.

**Size**: <45 KB total. Boots in <150 ms on mid-range Android.
