import { auth } from './firebase-config.js';
import { onAuthStateChanged, signOut } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';

onAuthStateChanged(auth, (user) => {
  const navLinks = document.querySelector('.nav-links');
  if (!navLinks) return;

  const signInLi = [...navLinks.querySelectorAll('a')]
    .find(a => a.getAttribute('href')?.includes('login.html'))
    ?.closest('li');

  if (!signInLi) return;

  if (user) {
    const label = user.displayName || user.email;
    signInLi.innerHTML = `<a href="#" id="nav-signout">${label} · Sign Out</a>`;
    document.getElementById('nav-signout').addEventListener('click', async (e) => {
      e.preventDefault();
      await signOut(auth);
      window.location.href = 'login.html';
    });
  } else {
    signInLi.innerHTML = `<a href="login.html">Sign In</a>`;
  }
});
