// PostureGuard dashboard logic.
// Requires sign-in (index.html) unless opened as dashboard.html?demo=1.
// Data source: Firebase Realtime Database when databaseURL is set, otherwise a demo simulator.
//
// Firebase layout (all under devices/{deviceId}):
//   live      { posture: "good"|"bad", deviation, tilt, badSeconds, sittingSeconds,
//               moving, alertLevel (0-3), alertType: "none"|"posture"|"sitting", updatedAt }
//   today     { goodSeconds, wornSeconds }
//   settings  { deviationThreshold, alertDelayMin, sitLimitMin, maxVibration, quietMode }
//   commands  { calibrate: <timestamp> }           (device clears it after calibrating)
//   events    { <pushId>: { type, level?, responseSec?, at } }
//             types: bad_start, alert, corrected, sit_reminder, break, calibrated, snooze

const DEFAULT_SETTINGS = {
  deviationThreshold: 15,
  alertDelayMin: 5,
  sitLimitMin: 60,
  maxVibration: 100,
  quietMode: false
};

import { startTutorial, DASHBOARD_TOUR } from "./tutorial.js";

const SDK = "https://www.gstatic.com/firebasejs/13.3.0/";
const params = new URLSearchParams(location.search);
// Demo mode lasts for the whole visit: ?demo=1 turns it on, "Exit demo" (or the login page) turns it off.
const isDemo = (() => {
  const fromUrl = params.get("demo") === "1";
  try {
    if (fromUrl) sessionStorage.setItem("pg_demo", "1");
    return fromUrl || sessionStorage.getItem("pg_demo") === "1";
  } catch { return fromUrl; }
})();
function exitDemo() {
  try { sessionStorage.removeItem("pg_demo"); } catch {}
  location.replace("index.html");
}

// Device ID comes from the URL (?device=pg-002), default pg-001.
const deviceId = (params.get("device") || "pg-001").replace(/[^A-Za-z0-9_-]/g, "");
document.getElementById("deviceLabel").textContent = deviceId;
const cfg = window.POSTUREGUARD_FIREBASE || {};
let useFirebase = false; // true once signed in and databaseURL is set

const $ = (id) => document.getElementById(id);
const state = { settings: { ...DEFAULT_SETTINGS }, live: null, events: [], lastUpdate: 0 };

/* ---------------- Data sources ---------------- */

async function firebaseSource(rtdb) {
  const db = await import(SDK + "firebase-database.js");
  const path = (p) => db.ref(rtdb, `devices/${deviceId}/${p}`);

  return {
    onLive: (cb) => db.onValue(path("live"), (s) => s.val() && cb(s.val())),
    onToday: (cb) => db.onValue(path("today"), (s) => s.val() && cb(s.val())),
    onSettings: (cb) => db.onValue(path("settings"), (s) => cb(s.val() || {})),
    onEvents: (cb) =>
      db.onValue(db.query(path("events"), db.limitToLast(50)), (s) => {
        const list = [];
        s.forEach((c) => { list.push(c.val()); });
        cb(list);
      }),
    saveSettings: (v) => db.update(path("settings"), v),
    calibrate: () => db.set(db.ref(rtdb, `devices/${deviceId}/commands/calibrate`), Date.now())
  };
}

/* ---------------- Sign-in ---------------- */

// Returns { user, fb } for a signed-in user, or redirects to the login page.
async function requireUser() {
  const fb = await import("./firebase.js");
  const { onAuthStateChanged, signOut } = await import(SDK + "firebase-auth.js");
  const user = await new Promise((resolve) => {
    const stop = onAuthStateChanged(fb.auth, (u) => { stop(); resolve(u); });
  });
  if (!user) { location.replace("index.html"); return null; }
  $("userEmail").textContent = user.email;
  $("signOutBtn").addEventListener("click", async () => {
    await signOut(fb.auth);
    location.replace("index.html");
  });
  return { user, fb };
}

/* ---------------- First-time tour ---------------- */

// The "seen" flag is stored in this browser and, when the database is set up,
// under users/{uid}/tutorialDone so it follows the account to other devices.
function tourFlag(session) {
  const key = "pg_tour_done_" + (session ? session.user.uid : "demo");
  const remote = session && session.fb.db
    ? async () => (await import(SDK + "firebase-database.js")) : null;
  return {
    async seen() {
      try { if (localStorage.getItem(key)) return true; } catch {}
      if (remote) {
        try {
          const db = await remote();
          const snap = await db.get(db.ref(session.fb.db, `users/${session.user.uid}/tutorialDone`));
          if (snap.exists()) { try { localStorage.setItem(key, "1"); } catch {} return true; }
        } catch (err) { console.warn("Couldn't read tour flag", err); }
      }
      return false;
    },
    async markSeen(info) {
      try { localStorage.setItem(key, "1"); } catch {}
      if (remote) {
        try {
          const db = await remote();
          await db.set(db.ref(session.fb.db, `users/${session.user.uid}/tutorialDone`),
            { at: Date.now(), skipped: info.skipped });
        } catch (err) { console.warn("Couldn't save tour flag", err); }
      }
    }
  };
}

function demoSource() {
  // Simulates a user who slowly slouches, gets alerted, corrects, and takes breaks.
  // Time runs 10x faster so alerts and reminders show up within a few minutes.
  const SPEED = 10;
  const subs = { live: [], today: [], settings: [], events: [] };
  const emit = (k, v) => subs[k].forEach((cb) => cb(v));
  let settings = { ...DEFAULT_SETTINGS, alertDelayMin: 2, sitLimitMin: 10 };
  const events = [];
  const s = { dev: 4, target: 4, bad: 0, sit: 0, moving: 0, level: 0, type: "none",
              good: 0, worn: 0, posture: "good", alertStart: 0, now: Date.now() };

  const push = (e) => { events.push({ ...e, at: s.now }); emit("events", events.slice(-50)); };

  setInterval(() => {
    const dt = SPEED; // simulated seconds per real second
    s.now += dt * 1000;

    // Drift toward a target posture; occasionally slouch or straighten.
    if (Math.random() < 0.04) s.target = Math.random() < 0.55 ? 18 + Math.random() * 14 : 2 + Math.random() * 6;
    if (s.level >= 2 && Math.random() < 0.25) s.target = 3; // user responds to strong alerts
    s.dev += (s.target - s.dev) * 0.25 + (Math.random() - 0.5) * 1.5;
    s.dev = Math.max(0, s.dev);

    const thr = settings.deviationThreshold;
    const wasBad = s.posture === "bad";
    if (!wasBad && s.dev > thr) { s.posture = "bad"; s.bad = 0; push({ type: "bad_start" }); }
    if (wasBad && s.dev < thr - 5) {
      if (s.level > 0) push({ type: "corrected", responseSec: Math.round((s.now - s.alertStart) / 1000) });
      s.posture = "good"; s.bad = 0; if (s.type === "posture") { s.level = 0; s.type = "none"; }
    }

    // Movement: rare breaks
    if (s.moving > 0) {
      s.moving -= dt;
      if (s.moving <= 0) { s.sit = 0; push({ type: "break" }); if (s.type === "sitting") { s.level = 0; s.type = "none"; } }
    } else if (Math.random() < 0.006) s.moving = 60;
    else s.sit += dt;

    if (s.posture === "bad") s.bad += dt;
    s.worn += dt; if (s.posture === "good") s.good += dt;

    // Alerts
    if (!settings.quietMode) {
      if (s.sit >= settings.sitLimitMin * 60 && s.type !== "sitting") {
        s.type = "sitting"; s.level = 1; s.alertStart = s.now; push({ type: "sit_reminder" });
      } else if (s.type !== "sitting" && s.posture === "bad") {
        const over = s.bad - settings.alertDelayMin * 60;
        const lvl = over < 0 ? 0 : Math.min(3, 1 + Math.floor(over / 60));
        if (lvl > s.level) {
          if (s.level === 0) s.alertStart = s.now;
          s.level = lvl; s.type = "posture"; push({ type: "alert", level: lvl });
        }
      }
    }

    emit("live", {
      posture: s.posture, deviation: +s.dev.toFixed(1), tilt: +(s.dev * 0.9 + 3).toFixed(1),
      badSeconds: s.posture === "bad" ? s.bad : 0, sittingSeconds: s.sit, moving: s.moving > 0,
      alertLevel: s.level, alertType: s.type, updatedAt: Date.now()
    });
    emit("today", { goodSeconds: s.good, wornSeconds: s.worn });
  }, 1000);

  return {
    onLive: (cb) => subs.live.push(cb),
    onToday: (cb) => subs.today.push(cb),
    onSettings: (cb) => { subs.settings.push(cb); cb(settings); },
    onEvents: (cb) => { subs.events.push(cb); cb(events); },
    saveSettings: async (v) => { settings = { ...settings, ...v }; emit("settings", settings); },
    calibrate: async () => { s.dev = 0; s.target = 3; push({ type: "calibrated" }); }
  };
}

/* ---------------- Rendering ---------------- */

const fmtTime = (sec) => {
  sec = Math.max(0, Math.floor(sec || 0));
  const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return h ? `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}` : `${m}:${String(s).padStart(2, "0")}`;
};
const clock = (ms) => new Date(ms).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });

function renderLive(d) {
  state.live = d;
  state.lastUpdate = Date.now();
  const thr = state.settings.deviationThreshold;
  const bad = d.posture === "bad";

  const card = $("postureCard");
  card.classList.toggle("is-bad", bad);
  card.classList.toggle("is-alert", d.alertLevel > 0);
  $("postureStatus").textContent = bad ? "Slouching" : "Upright";

  const delay = state.settings.alertDelayMin * 60;
  $("postureHint").textContent = bad
    ? (d.alertLevel > 0 && d.alertType === "posture"
        ? "Vibration is on. Sit up straight to stop it."
        : `Alert in ${fmtTime(delay - (d.badSeconds || 0))} if this continues.`)
    : "Posture is within your calibrated range.";

  $("deviation").textContent = d.deviation.toFixed(1);
  $("tilt").textContent = d.tilt != null ? d.tilt.toFixed(1) : "–";
  $("badFor").textContent = fmtTime(d.badSeconds);
  const scale = Math.max(thr * 2, 30);
  $("deviationBar").style.width = Math.min(100, (d.deviation / scale) * 100) + "%";
  $("deviationBar").classList.toggle("over", d.deviation > thr);
  $("thresholdMark").style.left = (thr / scale) * 100 + "%";

  const pill = $("alertPill");
  pill.className = "pill";
  if (state.settings.quietMode) { pill.textContent = "Quiet mode"; pill.classList.add("neutral"); }
  else if (d.alertLevel > 0) {
    pill.textContent = `${d.alertType === "sitting" ? "Sitting" : "Posture"} alert · Level ${d.alertLevel}`;
    pill.classList.add(`lvl${d.alertLevel}`);
  } else pill.textContent = "No alert";

  // Sitting ring
  const limit = state.settings.sitLimitMin * 60;
  const frac = Math.min(1, (d.sittingSeconds || 0) / limit);
  const C = 2 * Math.PI * 52;
  const ring = $("sitRing");
  ring.style.strokeDasharray = C;
  ring.style.strokeDashoffset = C * (1 - frac);
  ring.classList.toggle("warn", frac >= 0.8 && frac < 1);
  ring.classList.toggle("over", frac >= 1);
  $("sitTime").textContent = fmtTime(d.sittingSeconds);
  $("sitLimit").textContent = state.settings.sitLimitMin;
  $("movingPill").textContent = d.moving ? "Moving" : "Still";
  $("movingPill").className = "pill " + (d.moving ? "good" : "neutral");
  $("sitHint").textContent = frac >= 1
    ? "Time to stand up and stretch. Walk for about a minute to reset."
    : d.moving ? "Movement detected. Keep walking to reset the timer."
    : "Timer resets when you get up and walk.";

  pushChart(d.deviation, thr);
}

function renderToday(t) {
  if (t && t.wornSeconds > 0) $("goodPct").textContent = Math.round((t.goodSeconds / t.wornSeconds) * 100) + "%";
}

const EVENT_TEXT = {
  bad_start: () => ["Slouching detected", "warn"],
  alert: (e) => [`Posture alert, level ${e.level}`, "bad"],
  corrected: (e) => [`Posture corrected after ${fmtTime(e.responseSec)}`, "good"],
  sit_reminder: () => ["Sitting limit reached, stand up reminder", "bad"],
  break: () => ["Break taken, sitting timer reset", "good"],
  calibrated: () => ["Posture calibrated", "info"],
  snooze: () => ["Alerts snoozed", "info"]
};

function renderEvents(list) {
  state.events = list || [];
  const log = $("eventLog");
  const items = state.events.slice().reverse().slice(0, 30);
  log.innerHTML = items.length ? "" : '<li class="empty">No events yet.</li>';
  for (const e of items) {
    const [text, tone] = (EVENT_TEXT[e.type] || (() => [e.type, "info"]))(e);
    const li = document.createElement("li");
    li.className = tone;
    li.innerHTML = `<span class="ev-dot"></span><span class="ev-text"></span><time></time>`;
    li.querySelector(".ev-text").textContent = text;
    li.querySelector("time").textContent = clock(e.at);
    log.appendChild(li);
  }

  const alerts = state.events.filter((e) => e.type === "alert" && e.level === 1 || e.type === "sit_reminder");
  const responses = state.events.filter((e) => e.type === "corrected" && e.responseSec != null);
  $("alertCount").textContent = alerts.length;
  $("breakCount").textContent = state.events.filter((e) => e.type === "break").length;
  $("avgResponse").textContent = responses.length
    ? fmtTime(responses.reduce((a, e) => a + e.responseSec, 0) / responses.length) : "–";
}

function renderSettings(s) {
  state.settings = { ...DEFAULT_SETTINGS, ...s };
  const f = $("settingsForm");
  if (f.contains(document.activeElement)) return; // don't overwrite while typing
  for (const [k, v] of Object.entries(state.settings)) {
    const el = f.elements[k];
    if (!el) continue;
    if (el.type === "checkbox") el.checked = Boolean(v); else el.value = v;
  }
}

/* ---------------- Chart ---------------- */

let chart;
const MAX_POINTS = 150; // ~5 min at one sample per 2 s

function initChart() {
  const css = getComputedStyle(document.documentElement);
  const line = css.getPropertyValue("--accent").trim();
  const thr = css.getPropertyValue("--bad").trim();
  const grid = css.getPropertyValue("--line").trim();
  const ink = css.getPropertyValue("--muted").trim();
  chart = new Chart($("liveChart"), {
    type: "line",
    data: { labels: [], datasets: [
      { data: [], borderColor: line, backgroundColor: line + "22", fill: true, tension: 0.35, pointRadius: 0, borderWidth: 2 },
      { data: [], borderColor: thr, borderDash: [5, 4], pointRadius: 0, borderWidth: 1.5, fill: false }
    ]},
    options: {
      animation: false, responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { intersect: false, mode: "index" } },
      scales: {
        x: { display: false },
        y: { beginAtZero: true, suggestedMax: 35, grid: { color: grid }, ticks: { color: ink, callback: (v) => v + "%" } }
      }
    }
  });
}

let lastChartPush = 0;
function pushChart(dev, thr) {
  if (!chart) return;
  const now = Date.now();
  if (now - lastChartPush < 1800) return;
  lastChartPush = now;
  const d = chart.data;
  d.labels.push(clock(now));
  d.datasets[0].data.push(dev);
  d.datasets[1].data.push(thr);
  if (d.labels.length > MAX_POINTS) { d.labels.shift(); d.datasets.forEach((ds) => ds.data.shift()); }
  chart.update("none");
}

/* ---------------- Connection status ---------------- */

function setConn(mode, text) {
  const b = $("connBadge");
  b.className = "conn " + mode;
  $("connText").textContent = text;
}

setInterval(() => {
  if (!state.lastUpdate) return;
  const age = (Date.now() - state.lastUpdate) / 1000;
  if (useFirebase) setConn(age < 10 ? "ok" : "off", age < 10 ? "Device online" : `Device offline · last seen ${clock(state.lastUpdate)}`);
}, 2000);

/* ---------------- Start ---------------- */

(async function start() {
  let session = null;
  if (!isDemo) {
    try {
      session = await requireUser();
    } catch (err) {
      console.error(err);
      document.body.classList.remove("is-loading");
      setConn("off", "Couldn't load sign-in");
      return;
    }
    if (!session) return; // redirecting to login
  } else {
    $("userEmail").textContent = "Demo";
    $("signOutBtn").textContent = "Exit demo";
    $("signOutBtn").addEventListener("click", exitDemo);
  }
  document.body.classList.remove("is-loading");

  if (window.Chart) initChart();
  let src;
  useFirebase = Boolean(session && session.fb.db);
  try {
    src = useFirebase ? await firebaseSource(session.fb.db) : demoSource();
  } catch (err) {
    console.error(err);
    useFirebase = false;
    src = demoSource();
  }

  if (!useFirebase) {
    setConn("demo", "Demo mode");
    $("footNote").textContent = isDemo
      ? "Demo mode: simulated data at 10× speed."
      : "Showing simulated data: add databaseURL in assets/js/firebase-config.js to see the real device.";
  }

  // Tour: shown once per account after the first sign-in. ?tour=1 forces it.
  const flag = tourFlag(session);
  const runTour = () => startTutorial(DASHBOARD_TOUR, { onFinish: (info) => flag.markSeen(info) });
  $("helpBtn").addEventListener("click", runTour);
  if (params.get("tour") === "1" || !(await flag.seen())) setTimeout(runTour, 600);

  src.onSettings(renderSettings);
  src.onLive(renderLive);
  src.onToday(renderToday);
  src.onEvents(renderEvents);

  $("settingsForm").addEventListener("submit", async (e) => {
    e.preventDefault();
    const f = e.target;
    const v = {
      deviationThreshold: Number(f.deviationThreshold.value),
      alertDelayMin: Number(f.alertDelayMin.value),
      sitLimitMin: Number(f.sitLimitMin.value),
      maxVibration: Number(f.maxVibration.value),
      quietMode: f.quietMode.checked
    };
    try {
      await src.saveSettings(v);
      document.activeElement.blur();
      $("savedNote").textContent = "Saved. The device applies it on its next sync.";
    } catch (err) {
      $("savedNote").textContent = "Couldn't save: " + err.message;
    }
    setTimeout(() => ($("savedNote").textContent = ""), 4000);
  });

  $("calibrateBtn").addEventListener("click", async () => {
    const btn = $("calibrateBtn");
    if (!confirm("Sit upright and still for 5 seconds after pressing OK.")) return;
    btn.disabled = true; btn.textContent = "Calibrating…";
    try { await src.calibrate(); } catch (err) { alert("Couldn't send: " + err.message); }
    setTimeout(() => { btn.disabled = false; btn.textContent = "Calibrate posture"; }, 5000);
  });
})();
