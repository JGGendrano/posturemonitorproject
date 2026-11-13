// PostureGuard About Us page.
// Requires sign-in (index.html) unless opened as aboutus.html?demo=1.

const SDK = "https://www.gstatic.com/firebasejs/13.3.0/";
const params = new URLSearchParams(location.search);
const isDemo = params.get("demo") === "1";
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

function initTeam() {
  const note = $("note");
  const noteImg = $("noteImg");
  const noteRole = $("noteRole");
  const noteTitle = $("noteTitle");
  const noteBody = $("noteBody");

  document.querySelectorAll(".member-item").forEach((item) => {
    const btn = item.querySelector(".member");
    const img = btn.querySelector("img");
    const bio = item.querySelector(".member-bio");
    const name = btn.getAttribute("data-name") || "";
    const role = btn.getAttribute("data-role") || "";

    withFallback(img, name);

    btn.addEventListener("click", () => {
      noteImg.alt = name;
      noteImg.onerror = () => {
        noteImg.onerror = null;
        noteImg.src = initialAvatar(name);
      };
      noteImg.src = img.src;
      noteRole.textContent = role;
      noteTitle.textContent = "About " + name.split(" ")[0];
      noteBody.innerHTML = bio ? bio.innerHTML : "";
      note.showModal();
      note.querySelector(".note-card").scrollTop = 0;
    });
  });

  $("noteClose").addEventListener("click", () => note.close());

  // Pindutin ang labas ng note (sa madilim na background) para magsara
  note.addEventListener("click", (e) => {
    if (e.target === note) note.close();
  });
}

/* ---------------- Start ---------------- */

(async function start() {
  if (isDemo) {
    $("userEmail").textContent = "Demo";
    $("signOutBtn").textContent = "Exit demo";
    $("signOutBtn").addEventListener("click", () => location.replace("index.html"));
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