import { auth } from "./firebase.js";
import {
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  sendPasswordResetEmail,
  onAuthStateChanged
} from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";

const $ = (id) => document.getElementById(id);
const form = $("authForm");
let mode = "signin"; // or "signup"
let busy = false;

// Coming back to the login page ends demo mode.
try { sessionStorage.removeItem("pg_demo"); } catch {}

// Already signed in? Go straight to the dashboard.
onAuthStateChanged(auth, (user) => {
  if (user && !busy) location.replace("dashboard.html");
});

const ERRORS = {
  "auth/invalid-email": "That email address doesn't look right.",
  "auth/invalid-credential": "Wrong email or password.",
  "auth/wrong-password": "Wrong email or password.",
  "auth/user-not-found": "No account uses that email.",
  "auth/email-already-in-use": "An account with that email already exists. Sign in instead.",
  "auth/weak-password": "Use at least 6 characters for the password.",
  "auth/too-many-requests": "Too many tries. Wait a minute and try again.",
  "auth/network-request-failed": "Can't reach the server. Check your internet connection.",
  "auth/operation-not-allowed": "Email sign-in isn't turned on yet in the Firebase console (Authentication > Sign-in method).",
  "auth/configuration-not-found": "Firebase Authentication isn't set up yet. Turn on Email/Password in the Firebase console."
};

function showMsg(text, tone = "error") {
  const m = $("authMsg");
  m.textContent = text;
  m.className = "auth-msg " + (text ? tone : "");
}

function setMode(next) {
  mode = next;
  const up = mode === "signup";
  $("formTitle").textContent = up ? "Create your account" : "Welcome back";
  $("formSub").textContent = up ? "One account per group member is fine." : "Sign in to see your posture data.";
  $("confirmField").hidden = !up;
  $("forgotRow").hidden = up;
  $("submitBtn").textContent = up ? "Create account" : "Sign in";
  $("switchText").textContent = up ? "Already have an account?" : "New to PostureGuard?";
  $("switchBtn").textContent = up ? "Sign in" : "Create an account";
  form.password.autocomplete = up ? "new-password" : "current-password";
  showMsg("");
}

// Show/hide password buttons
document.querySelectorAll(".pw-toggle").forEach((btn) => {
  btn.addEventListener("click", () => {
    const input = btn.parentElement.querySelector("input");
    const show = input.type === "password";
    input.type = show ? "text" : "password";
    btn.setAttribute("aria-pressed", String(show));
    btn.setAttribute("aria-label", show ? "Hide password" : "Show password");
    btn.title = show ? "Hide password" : "Show password";
    const end = input.value.length;
    input.focus();
    input.setSelectionRange(end, end);
  });
});

$("switchBtn").addEventListener("click", () => setMode(mode === "signin" ? "signup" : "signin"));

$("forgotBtn").addEventListener("click", async () => {
  const email = form.email.value.trim();
  if (!email) { showMsg("Type your email first, then press Forgot password."); form.email.focus(); return; }
  try {
    await sendPasswordResetEmail(auth, email);
    showMsg("Reset link sent. Check your inbox and spam folder.", "ok");
  } catch (err) {
    showMsg(ERRORS[err.code] || err.message);
  }
});

form.addEventListener("submit", async (e) => {
  e.preventDefault();
  const email = form.email.value.trim();
  const password = form.password.value;

  if (!email || !password) return showMsg("Enter your email and password.");
  if (mode === "signup") {
    if (password.length < 6) return showMsg(ERRORS["auth/weak-password"]);
    if (password !== form.confirm.value) return showMsg("The passwords don't match.");
  }

  busy = true;
  const btn = $("submitBtn");
  btn.disabled = true;
  btn.textContent = mode === "signup" ? "Creating account…" : "Signing in…";
  showMsg("");

  try {
    if (mode === "signup") await createUserWithEmailAndPassword(auth, email, password);
    else await signInWithEmailAndPassword(auth, email, password);
    location.replace("dashboard.html");
  } catch (err) {
    busy = false;
    btn.disabled = false;
    btn.textContent = mode === "signup" ? "Create account" : "Sign in";
    showMsg(ERRORS[err.code] || err.message);
  }
});
