// One-time guided tour of the dashboard.
// startTutorial(steps, { onFinish }) highlights each element in turn with a short explanation.
// Each step: { target: "#css-selector" | null, title, text }. A null target shows a centered card.

export function startTutorial(steps, { onFinish } = {}) {
  let i = 0;
  let ended = false;

  const layer = document.createElement("div");
  layer.className = "tour";
  layer.innerHTML = `
    <div class="tour-shade"></div>
    <div class="tour-spot" hidden></div>
    <div class="tour-card" role="dialog" aria-modal="true" aria-labelledby="tourTitle">
      <div class="tour-top">
        <span class="tour-count"></span>
        <button type="button" class="tour-skip">Skip tutorial</button>
      </div>
      <h3 id="tourTitle" class="tour-title"></h3>
      <p class="tour-text"></p>
      <div class="tour-dots"></div>
      <div class="tour-nav">
        <button type="button" class="btn ghost small tour-back">Back</button>
        <button type="button" class="btn small tour-next">Next</button>
      </div>
    </div>`;
  document.body.appendChild(layer);
  document.body.classList.add("touring");

  const q = (s) => layer.querySelector(s);
  const spot = q(".tour-spot"), card = q(".tour-card"), shade = q(".tour-shade");
  q(".tour-dots").innerHTML = steps.map(() => "<i></i>").join("");

  function place() {
    if (ended) return;
    const step = steps[i];
    const el = step.target && document.querySelector(step.target);
    const mobile = window.innerWidth < 640;

    if (!el) {
      spot.hidden = true;
      shade.classList.add("on");
      card.className = "tour-card center";
      card.style.top = card.style.left = "";
      return;
    }

    shade.classList.remove("on");
    spot.hidden = false;
    const r = el.getBoundingClientRect();
    const pad = 8;
    Object.assign(spot.style, {
      top: r.top - pad + "px", left: r.left - pad + "px",
      width: r.width + pad * 2 + "px", height: r.height + pad * 2 + "px"
    });

    if (mobile) { card.className = "tour-card dock"; card.style.top = card.style.left = ""; return; }

    // Desktop: put the card below the target if it fits, otherwise above, otherwise beside.
    card.className = "tour-card";
    const cw = card.offsetWidth, ch = card.offsetHeight, gap = 16;
    const vw = window.innerWidth, vh = window.innerHeight;
    let top, left = Math.min(Math.max(16, r.left), vw - cw - 16);
    if (r.bottom + gap + ch < vh - 16) top = r.bottom + gap;
    else if (r.top - gap - ch > 16) top = r.top - gap - ch;
    else {
      top = Math.min(Math.max(16, r.top), vh - ch - 16);
      left = r.right + gap + cw < vw - 16 ? r.right + gap : Math.max(16, r.left - gap - cw);
    }
    card.style.top = top + "px";
    card.style.left = left + "px";
  }

  function show(n) {
    i = n;
    const step = steps[i];
    q(".tour-count").textContent = `${i + 1} of ${steps.length}`;
    q(".tour-title").textContent = step.title;
    q(".tour-text").textContent = step.text;
    q(".tour-back").style.visibility = i === 0 ? "hidden" : "visible";
    q(".tour-next").textContent = i === steps.length - 1 ? "Got it" : i === 0 ? "Start tour" : "Next";
    q(".tour-skip").style.visibility = i === steps.length - 1 ? "hidden" : "visible";
    layer.querySelectorAll(".tour-dots i").forEach((d, k) => d.classList.toggle("on", k === i));

    const el = step.target && document.querySelector(step.target);
    if (el) {
      const r = el.getBoundingClientRect();
      const mobile = window.innerWidth < 640;
      const visibleBottom = mobile ? window.innerHeight * 0.55 : window.innerHeight;
      if (r.top < 70 || r.bottom > visibleBottom) {
        window.scrollBy({ top: r.top - (mobile ? 80 : window.innerHeight / 2 - r.height / 2), behavior: "smooth" });
      }
    }
    place();
    setTimeout(place, 350);
    setTimeout(place, 700);
    q(".tour-next").focus({ preventScroll: true });
  }

  function end(skipped) {
    if (ended) return;
    ended = true;
    window.removeEventListener("resize", place);
    window.removeEventListener("scroll", place, true);
    document.removeEventListener("keydown", onKey);
    document.body.classList.remove("touring");
    layer.classList.add("closing");
    setTimeout(() => layer.remove(), 200);
    onFinish && onFinish({ skipped, step: i });
  }

  function onKey(e) {
    if (e.key === "Escape") end(true);
    else if (e.key === "ArrowRight") i < steps.length - 1 ? show(i + 1) : end(false);
    else if (e.key === "ArrowLeft" && i > 0) show(i - 1);
  }

  q(".tour-next").addEventListener("click", () => (i < steps.length - 1 ? show(i + 1) : end(false)));
  q(".tour-back").addEventListener("click", () => i > 0 && show(i - 1));
  q(".tour-skip").addEventListener("click", () => end(true));
  window.addEventListener("resize", place);
  window.addEventListener("scroll", place, true);
  document.addEventListener("keydown", onKey);

  show(0);
}

export const DASHBOARD_TOUR = [
  { target: null, title: "Welcome to PostureGuard",
    text: "Here's a quick tour of your dashboard. It takes about a minute, and you can skip it anytime." },
  { target: "#connBadge", title: "Device status",
    text: "Shows whether your harness is connected. Green means it's online and sending live data." },
  { target: "#postureCard", title: "Your posture right now",
    text: "Upright or slouching, based on how far your back has bent from your calibrated position. If you slouch for too long, the harness vibrates and the alert level appears here." },
  { target: "#sitCard", title: "Sitting time",
    text: "The ring fills up as you sit. When it's full, the harness reminds you to stand and stretch. Walking for about a minute resets it." },
  { target: "#todayCard", title: "Today's summary",
    text: "How much of the day you kept good posture, how many alerts you got, how fast you fixed your posture after an alert, and how many breaks you took." },
  { target: "#chartCard", title: "Live chart",
    text: "Your posture over the last 5 minutes. When the line goes above the dashed red line, you're slouching." },
  { target: "#logCard", title: "Activity",
    text: "A timeline of everything the harness noticed: slouching, alerts, corrections and breaks." },
  { target: "#calibrateBtn", title: "Calibrate first",
    text: "Each time you put on the harness, sit up straight and press this. It saves your upright position so the readings fit your body." },
  { target: "#settingsCard", title: "Device settings",
    text: "Change how sensitive the alerts are, how long before they start, your sitting limit and vibration strength. Press Save to send them to the harness. Quiet mode pauses alerts." },
  { target: "#helpBtn", title: "That's it!",
    text: "Press this button anytime to see the tour again." }
];
