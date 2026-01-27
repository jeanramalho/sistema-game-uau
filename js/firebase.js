// js/firebase.js
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-auth.js';
import { getDatabase } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-database.js';
import { getStorage } from 'https://www.gstatic.com/firebasejs/12.2.1/firebase-storage.js';

// --- Cole aqui seu firebaseConfig (o que você já me passou) ---
const firebaseConfig = {
  apiKey: "AIzaSyCh9-eS5xStmP6IL_fwhRHqTFejk8BkGjU",
  authDomain: "gameuau-ba9bb.firebaseapp.com",
  databaseURL: "https://gameuau-ba9bb-default-rtdb.firebaseio.com",
  projectId: "gameuau-ba9bb",
  storageBucket: "gameuau-ba9bb.firebasestorage.app",
  messagingSenderId: "540955198809",
  appId: "1:540955198809:web:6b05a8dbe0cf200fceb848",
  measurementId: "G-VKE7K7KGQ9"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
export const storage = getStorage(app);
export default app;