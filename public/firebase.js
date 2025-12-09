// Import the functions you need from the SDKs you need
import { initializeApp } from "https://www.gstatic.com/firebasejs/11.7.1/firebase-app.js";
import { getAnalytics } from "https://www.gstatic.com/firebasejs/11.7.1/firebase-analytics.js";
import { getAuth, signOut , onAuthStateChanged} from "https://www.gstatic.com/firebasejs/11.7.1/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/11.7.1/firebase-firestore.js";

// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyAhDq1rngxHQg__G36W9tILyw7YjjDuI30",
  authDomain: "bine-aa.firebaseapp.com", //|| "http://127.0.0.1:5000",
  databaseURL: "https://bine-aa-default-rtdb.firebaseio.com",
  projectId: "bine-aa",
  storageBucket: "bine-aa.appspot.com",
  messagingSenderId: "3888154410",
  appId: "1:3888154410:web:c2a8ba81843921b1b60053",
  measurementId: "G-C1MZMN7KEF"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
const auth = getAuth(app);
const db = getFirestore(app);

export { app, analytics, auth, signOut , onAuthStateChanged, db};
/*
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";

// Your Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyAhDq1rngxHQg__G36W9tILyw7YjjDuI30",
  authDomain: "bine-aa.firebaseapp.com",
  databaseURL: "https://bine-aa-default-rtdb.firebaseio.com",
  projectId: "bine-aa",
  storageBucket: "bine-aa.appspot.com", // corrected domain
  messagingSenderId: "3888154410",
  appId: "1:3888154410:web:c2a8ba81843921b1b60053",
  measurementId: "G-C1MZMN7KEF"
};

// Initialize Firebase once
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);

// Export initialized app and analytics (and config if needed) */
