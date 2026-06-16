import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-app.js';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import { getFirestore } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

const firebaseConfig = {
  apiKey: 'AIzaSyDySk5vVrsx3WsExD5RwJSxY96TzQl9zak',
  authDomain: 'great-outdoors-31f1a.firebaseapp.com',
  projectId: 'great-outdoors-31f1a',
  storageBucket: 'great-outdoors-31f1a.firebasestorage.app',
  messagingSenderId: '998183110222',
  appId: '1:998183110222:web:ca1d1d22d89eeb0db9651f'
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
