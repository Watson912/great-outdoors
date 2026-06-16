import { auth } from './firebase-config.js';
import { createUserWithEmailAndPassword, updateProfile } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

const form = document.getElementById('signup-form');
const errorEl = document.getElementById('error-msg');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const name = document.getElementById('name').value.trim();
  const email = document.getElementById('email').value.trim();
  const password = document.getElementById('pass').value;
  const confirm = document.getElementById('confirm-pass').value;
  const btn = form.querySelector('.btn-primary');

  errorEl.textContent = '';

  if (password !== confirm) {
    errorEl.textContent = 'Passwords do not match.';
    return;
  }

  if (password.length < 6) {
    errorEl.textContent = 'Password must be at least 6 characters.';
    return;
  }

  btn.disabled = true;
  btn.textContent = 'Creating account…';

  try {
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(user, { displayName: name });
    window.location.href = 'index.html';
  } catch (err) {
    errorEl.textContent = friendlyError(err.code);
    btn.disabled = false;
    btn.textContent = 'Create Account';
  }
});

function friendlyError(code) {
  switch (code) {
    case 'auth/email-already-in-use':
      return 'An account with this email already exists.';
    case 'auth/invalid-email':
      return 'Please enter a valid email address.';
    case 'auth/weak-password':
      return 'Password must be at least 6 characters.';
    default:
      return 'Something went wrong. Please try again.';
  }
}
