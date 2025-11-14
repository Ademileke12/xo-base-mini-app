// firebase.ts
import { initializeApp } from "firebase/app";
import { getDatabase, ref, set } from "firebase/database";

const firebaseConfig = {
  apiKey: "AIzaSyDBQPgse6PZn-FQBo8Bv5HF8mNxjXrydl4",
  authDomain: "x-and-o-29358.firebaseapp.com",
  projectId: "x-and-o-29358",
  storageBucket: "x-and-o-29358.firebasestorage.app",
  messagingSenderId: "934577439632",
  appId: "1:934577439632:web:bc8bd3afa14dabbaeea915",
  measurementId: "G-TX52RSNL2N"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);

// Optional: initialize default room if empty
export const initRoom = (roomId: string) => {
  const boardRef = ref(db, `rooms/${roomId}/board`);
  const turnRef = ref(db, `rooms/${roomId}/xTurn`);
  set(boardRef, Array(9).fill(null));
  set(turnRef, true);
};