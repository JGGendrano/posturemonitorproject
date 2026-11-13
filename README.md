# PostureGuard Dashboard

Web dashboard for PostureGuard, a wearable posture monitor (ESP32 + flex sensor + MPU-6050 + vibration motor).

- `index.html` is the login page (email and password, sign up, password reset).
- `dashboard.html` shows live posture, the sitting timer, today's stats, a live deviation chart and an activity log, and sends settings and a calibrate command back to the device. It sends anyone not signed in back to the login page.
- After a user's first sign-in, the dashboard shows a one-time guided tour with a Skip option. The **?** button in the header replays it.

## Run it

Plain HTML, no server code. Open the folder in VS Code and use the **Live Server** extension (right-click `index.html` > Open with Live Server). Opening the file by double-clicking won't work, because browsers block the JavaScript modules on `file://`.

`dashboard.html?demo=1` (the "Try the demo" link on the login page) skips sign-in and shows simulated data at 10x speed. Add `&tour=1` to force the tour to show.

## Connect Firebase

The web config for `postureguardesp32` is already in `assets/js/firebase-config.js`.

**Turn on sign-in:** Firebase console > Build > **Authentication** > Get started > Sign-in method > enable **Email/Password**.

**Add the database** (the one value still missing):

1. Firebase console > Build > **Realtime Database** > Create database (pick Singapore, `asia-southeast1`), start in test mode.
2. Copy the database link shown at the top of the Data tab (like `https://postureguardesp32-default-rtdb.asia-southeast1.firebasedatabase.app`).
3. Paste it as `databaseURL` in `assets/js/firebase-config.js`.

Test mode lets anyone read and write for 30 days. Before the defense, replace the rules with these so only signed-in users can use the data:

```json
{
  "rules": {
    "devices": { ".read": "auth != null", ".write": "auth != null" },
    "users": { "$uid": { ".read": "auth.uid === $uid", ".write": "auth.uid === $uid" } }
  }
}
```

The ESP32 then needs to sign in too (the Firebase ESP Client library supports email/password).

Use `?device=pg-001` in the URL to pick a device (default `pg-001`).

## Data the ESP32 sends and reads

Everything lives under `devices/{deviceId}/`.

| Path | Written by | Contents |
|---|---|---|
| `live` | ESP32, every 1–2 s | `posture` ("good"/"bad"), `deviation` (%), `tilt` (°), `badSeconds`, `sittingSeconds`, `moving` (bool), `alertLevel` (0–3), `alertType` ("none"/"posture"/"sitting"), `updatedAt` (ms timestamp) |
| `today` | ESP32 | `goodSeconds`, `wornSeconds` |
| `events/{pushId}` | ESP32 | `type`, optional `level` / `responseSec`, `at` (ms timestamp) |
| `settings` | Dashboard | `deviationThreshold` (%), `alertDelayMin`, `sitLimitMin`, `maxVibration` (%), `quietMode` |
| `commands/calibrate` | Dashboard | timestamp; ESP32 recalibrates, then deletes it |
| `users/{uid}/tutorialDone` | Dashboard | `{ at, skipped }`, so the tour only shows once per account |

Event types: `bad_start`, `alert`, `corrected`, `sit_reminder`, `break`, `calibrated`, `snooze`.

The dashboard marks the device offline if `live.updatedAt` is older than 10 seconds, so the ESP32 needs a correct clock (sync with NTP).

## Files

- `index.html` – login page
- `dashboard.html` – dashboard page
- `assets/css/style.css` – styles for both pages
- `assets/logo-mark.png`, `assets/logo-mark-white.png` – the spine symbol from `project logo.jpg`, used in the headers and browser tab
- `assets/js/firebase-config.js` – your Firebase keys
- `assets/js/firebase.js` – starts Firebase (shared by both pages)
- `assets/js/login.js` – sign in, sign up, password reset
- `assets/js/dashboard.js` – sign-in check, live updates, chart, settings, calibration, demo simulator
- `assets/js/tutorial.js` – the guided tour and its steps (edit `DASHBOARD_TOUR` to change the text)

## Still to do

- History page and CSV export
- Posture score and streaks
