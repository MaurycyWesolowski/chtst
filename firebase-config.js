import { initializeApp } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-app.js";
import { getAuth } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.11.0/firebase-database.js";

const firebaseConfig = {
    apiKey: "AIzaSyCavGa2LCvS6l_KGCeRqGheCSFqNLmDt2M",
    authDomain: "chtst-4dd92.firebaseapp.com",
    databaseURL: "https://chtst-4dd92-default-rtdb.europe-west1.firebasedatabase.app",
    projectId: "chtst-4dd92",
    storageBucket: "chtst-4dd92.firebasestorage.app",
    messagingSenderId: "78809365358",
    appId: "1:78809365358:web:8dc8954bbb885bbb9a1f7f",
    measurementId: "G-D8859K9B6C"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getDatabase(app);
