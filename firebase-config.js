// ⚠️ ここにFirebaseプロジェクトの設定を貼り付けてください
// Firebase Console > プロジェクト設定 > マイアプリ > SDK の設定と構成

import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-database.js";

const firebaseConfig = {
  apiKey: "AIzaSyDgEWsqEWFpYx2aF4GcMenUzu_82LtCGO0",
  authDomain: "goal-card-battle.firebaseapp.com",
  databaseURL: "https://goal-card-battle-default-rtdb.firebaseio.com",
  projectId: "goal-card-battle",
  storageBucket: "goal-card-battle.firebasestorage.app",
  messagingSenderId: "1019669966267",
  appId: "1:1019669966267:web:8a9e81155385109eb5689e"
};

export const app = initializeApp(firebaseConfig);
export const db = getDatabase(app);