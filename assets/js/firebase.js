// Shared Firebase setup for every page.
// Keys live in firebase-config.js (loaded before this module as a normal script).
import { initializeApp } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/13.3.0/firebase-database.js";

export const cfg = window.POSTUREGUARD_FIREBASE || {};
export const app = initializeApp(cfg);
export const auth = getAuth(app);
// Realtime Database is only available once databaseURL is filled in.
export const db = cfg.databaseURL ? getDatabase(app) : null;
