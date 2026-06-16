import { auth } from './firebase-config.js';
import { signInWithEmailAndPassword } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

const form = document.getElementById('login-form');
const errorEl = document.getElementById('error-msg');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('pass').value;
  const btn = form.querySelector('.btn-primary');

  errorEl.textContent = '';
  btn.disabled = true;
  btn.textContent = 'Signing in…';

  try {
    await signInWithEmailAndPassword(auth, email, password);
    window.location.href = 'index.html';
  } catch (err) {
    errorEl.textContent = friendlyError(err.code);
    btn.disabled = false;
    btn.textContent = 'Sign In';
  }
});

function friendlyError(code) {
  switch (code) {
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
      return 'Incorrect email or password.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/too-many-requests':
      return 'Too many attempts. Please try again later.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
