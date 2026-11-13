// PostureGuard About Us page.
// Requires sign-in (index.html) unless opened as aboutus.html?demo=1.

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
const $ = (id) => document.getElementById(id);

/* ---------------- Back to dashboard (keeps ?demo and ?device) ---------------- */

(function setBackLink() {
  const q = new URLSearchParams();
  if (isDemo) q.set("demo", "1");
  const dev = (params.get("device") || "").replace(/[^A-Za-z0-9_-]/g, "");
  if (dev) q.set("device", dev);
  $("backLink").href = "dashboard.html" + (q.toString() ? "?" + q.toString() : "");
})();

/* ---------------- Sign-in ---------------- */

// Returns true for a signed-in user, false if nobody is signed in.
async function requireUser() {
  const fb = await import("./firebase.js");
  const { onAuthStateChanged, signOut } = await import(SDK + "firebase-auth.js");
  const user = await new Promise((resolve) => {
    const stop = onAuthStateChanged(fb.auth, (u) => { stop(); resolve(u); });
  });
  if (!user) return false;
  $("userEmail").textContent = user.email;
  $("signOutBtn").addEventListener("click", async () => {
    await signOut(fb.auth);
    location.replace("index.html");
  });
  return true;
}

/* ---------------- Team lineup + note popup ---------------- */

// Fallback kung wala pa ang picture: asul na kahon na may initial
function initialAvatar(name) {
  const letter = (name || "?").trim().charAt(0).toUpperCase();
  const svg =
    '<svg xmlns="http://www.w3.org/2000/svg" width="400" height="500" viewBox="0 0 400 500">' +
    '<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">' +
    '<stop offset="0" stop-color="#4aa3ec"/><stop offset="1" stop-color="#1673c9"/>' +
    '</linearGradient></defs>' +
    '<rect width="400" height="500" fill="url(#g)"/>' +
    '<text x="200" y="285" font-family="Arial, sans-serif" font-size="180" font-weight="700" ' +
    'fill="#ffffff" text-anchor="middle">' + letter + '</text></svg>';
  return "data:image/svg+xml;charset=utf-8," + encodeURIComponent(svg);
}

function withFallback(img, name) {
  function swap() {
    img.onerror = null;
    img.src = initialAvatar(name);
  }
  img.onerror = swap;
  // kung nag-error na bago pa nakapag-load ang script na ito
  if (img.complete && img.naturalWidth === 0) swap();
}

// Animations always play, even when the computer is set to reduce motion.
const EASE_OUT = "cubic-bezier(.2, .9, .25, 1)";
const EASE_IN = "cubic-bezier(.5, 0, .75, 0)";

function initTeam() {
  const note = $("note");
  const card = note.querySelector(".note-card");
  const noteImg = $("noteImg");
  const noteRole = $("noteRole");
  const noteTitle = $("noteTitle");
  const noteBody = $("noteBody");
  let source = null;   // the member photo that opened the note
  let busy = false;

  // Starting point of the note: shrunk down over the clicked photo.
  function fromSource() {
    const a = source.getBoundingClientRect();
    const b = card.getBoundingClientRect();
    const dx = a.left + a.width / 2 - (b.left + b.width / 2);
    const dy = a.top + a.height / 2 - (b.top + b.height / 2);
    const scale = Math.max(0.25, Math.min(a.width / b.width, a.height / b.height));
    return `translate(${dx}px, ${dy}px) scale(${scale})`;
  }

  // A copy of the member photo that flies from the lineup into the round avatar.
  // It lives inside the dialog so it draws above the dimmed background.
  function flyPhoto(src, a, b, reverse) {
    const ghost = document.createElement("img");
    ghost.src = src;
    ghost.className = "photo-ghost";
    note.appendChild(ghost);
    const box = (r, radius) => ({
      left: r.left + "px", top: r.top + "px", width: r.width + "px", height: r.height + "px", borderRadius: radius
    });
    const start = box(a, "18px"), finish = box(b, "50%");
    const anim = ghost.animate(reverse ? [finish, start] : [start, finish],
      { duration: reverse ? 300 : 450, easing: reverse ? EASE_IN : EASE_OUT, fill: "both" });
    return anim.finished.then(() => ghost.remove(), () => ghost.remove());
  }

  function open(item) {
    if (busy) return;
    const btn = item.querySelector(".member");
    const img = btn.querySelector("img");
    const bio = item.querySelector(".member-bio");
    const name = btn.getAttribute("data-name") || "";
    const role = btn.getAttribute("data-role") || "";

    noteImg.alt = name;
    noteImg.onerror = () => { noteImg.onerror = null; noteImg.src = initialAvatar(name); };
    noteImg.src = img.src;
    noteRole.textContent = role;
    noteTitle.textContent = "About " + name.split(" ")[0];
    noteBody.innerHTML = bio ? bio.innerHTML : "";

    source = img;
    note.showModal();
    card.scrollTop = 0;

    busy = true;
    // Measure where the photo starts and lands BEFORE the card starts moving
    const fromRect = img.getBoundingClientRect();
    const toRect = noteImg.getBoundingClientRect();
    const startPose = fromSource();
    btn.classList.add("is-opening");
    note.classList.add("is-entering");
    card.animate(
      [{ transform: startPose, opacity: 0 }, { transform: "none", opacity: 1, offset: 0.6 }, { transform: "none", opacity: 1 }],
      { duration: 450, easing: EASE_OUT }
    );
    try {
      note.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 300, easing: "ease-out", pseudoElement: "::backdrop" });
    } catch {}
    noteImg.style.opacity = "0";
    flyPhoto(img.src, fromRect, toRect, false).then(() => {
      noteImg.style.opacity = "";
      note.classList.remove("is-entering");
      btn.classList.remove("is-opening");
      busy = false;
    });
  }

  function close() {
    if (busy || !note.open) return;
    if (!source) { note.close(); return; }
    busy = true;
    const fromRect = source.getBoundingClientRect();
    const toRect = noteImg.getBoundingClientRect();
    const endPose = fromSource();
    note.classList.add("is-leaving");
    card.animate([{ transform: "none", opacity: 1 }, { transform: endPose, opacity: 0 }],
      { duration: 300, easing: EASE_IN, fill: "forwards" });
    try {
      note.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 300, easing: "ease-in", fill: "forwards", pseudoElement: "::backdrop" });
    } catch {}
    noteImg.style.opacity = "0";
    flyPhoto(source.src, fromRect, toRect, true).then(() => {
      note.close();
      noteImg.style.opacity = "";
      note.classList.remove("is-leaving");
      card.getAnimations().forEach((a) => a.cancel());
      note.getAnimations({ subtree: false }).forEach((a) => a.cancel());
      busy = false;
    });
  }

  document.querySelectorAll(".member-item").forEach((item) => {
    const btn = item.querySelector(".member");
    withFallback(btn.querySelector("img"), btn.getAttribute("data-name") || "");
    btn.addEventListener("click", () => open(item));
  });

  $("noteClose").addEventListener("click", close);
  // Click the dark background to close
  note.addEventListener("click", (e) => { if (e.target === note) close(); });
  // Esc key: play the closing animation instead of snapping shut
  note.addEventListener("cancel", (e) => { e.preventDefault(); close(); });
}

/* ---------------- Start ---------------- */

(async function start() {
  if (isDemo) {
    $("userEmail").textContent = "Demo";
    $("signOutBtn").textContent = "Exit demo";
    $("signOutBtn").addEventListener("click", exitDemo);
  } else {
    let signedIn = false;
    try {
      signedIn = await requireUser();
    } catch (err) {
      // Huwag itago ang error: manatili sa page at ipakita ang problema (parang dashboard)
      console.error("About us: couldn't load sign-in", err);
      document.body.classList.remove("is-loading");
      $("userEmail").textContent = "Sign-in error (open the browser console)";
      initTeam();
      return;
    }
    if (!signedIn) {
      console.warn("About us: no signed-in user, going back to the login page.");
      location.replace("index.html");
      return;
    }
  }
  document.body.classList.remove("is-loading");
  initTeam();
})();