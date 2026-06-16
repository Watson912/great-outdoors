import { auth, db } from './firebase-config.js';
import { onAuthStateChanged } from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js';
import {
  collection, addDoc, onSnapshot, query, orderBy,
  serverTimestamp, doc, updateDoc, arrayUnion, arrayRemove,
  increment, getDocs
} from 'https://www.gstatic.com/firebasejs/10.14.1/firebase-firestore.js';

// ── State ──────────────────────────────────────────────
let currentUser  = null;
let currentSort  = 'newest';
let unsubPosts   = null;
const replyUnsubs = new Map();   // postId → unsubscribe fn
const openReplies = new Set();   // postIds with visible reply panels

// ── Avatar palette (PNW colours) ──────────────────────
const AVATAR_COLORS = ['#1e3a2f','#3b6b4a','#8b6f47','#D4912B','#4a7a58','#2d5a27','#5c8a6a','#a07040'];

function avatarColor(name = '') {
  let h = 0;
  for (const c of name) h = (h * 31 + c.charCodeAt(0)) & 0xffff;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}

function initial(name = '') {
  return (name.trim()[0] || '?').toUpperCase();
}

// ── Time formatting ───────────────────────────────────
function relTime(ts) {
  if (!ts) return '';
  const secs = Math.floor((Date.now() - ts.toMillis()) / 1000);
  if (secs < 60)   return 'just now';
  if (secs < 3600) return `${Math.floor(secs / 60)}m ago`;
  if (secs < 86400) return `${Math.floor(secs / 3600)}h ago`;
  if (secs < 604800) return `${Math.floor(secs / 86400)}d ago`;
  return ts.toDate().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

// ── Toast helper ──────────────────────────────────────
function showToast(msg) {
  const t = document.createElement('div');
  t.className = 'toast';
  t.textContent = msg;
  document.body.appendChild(t);
  setTimeout(() => t.remove(), 3100);
}

// ── Auth state ────────────────────────────────────────
onAuthStateChanged(auth, (user) => {
  currentUser = user;
  updateComposerState(user);
  updateNavAuth(user);
});

function updateComposerState(user) {
  const signedIn = document.getElementById('composer-signed-in');
  const guest    = document.getElementById('composer-guest');
  if (!signedIn || !guest) return;

  if (user) {
    signedIn.hidden = false;
    guest.hidden    = true;
    const av = document.getElementById('composer-avatar');
    const name = displayName(user);
    av.textContent = initial(name);
    av.style.background = avatarColor(name);
  } else {
    signedIn.hidden = true;
    guest.hidden    = false;
  }

  // Update open reply composers
  document.querySelectorAll('.reply-composer-wrap').forEach(wrap => {
    const postId = wrap.closest('.replies-area')?.dataset.postId;
    if (!postId) return;
    renderReplyComposer(wrap, postId);
  });
}

function updateNavAuth(user) {
  const navLinks = document.querySelector('.nav-links');
  if (!navLinks) return;
  const signInLi = [...navLinks.querySelectorAll('a')]
    .find(a => a.getAttribute('href')?.includes('login.html'))
    ?.closest('li');
  if (!signInLi) return;
  if (user) {
    const label = displayName(user);
    signInLi.innerHTML = `<a href="#" id="nav-signout">${label} · Sign Out</a>`;
    document.getElementById('nav-signout').addEventListener('click', async (e) => {
      e.preventDefault();
      const { signOut } = await import('https://www.gstatic.com/firebasejs/10.14.1/firebase-auth.js');
      await signOut(auth);
      window.location.href = 'login.html';
    });
  } else {
    signInLi.innerHTML = `<a href="login.html">Sign In</a>`;
  }
}

function displayName(user) {
  return user.displayName || user.email.split('@')[0];
}

// ── Composer ──────────────────────────────────────────
const MAX_POST = 500;
const WARN_POST = 400;

function initComposer() {
  const textarea = document.getElementById('post-input');
  const btnPost  = document.getElementById('btn-post');
  const counter  = document.getElementById('char-count');

  textarea.addEventListener('input', () => {
    const len = textarea.value.length;
    const remaining = MAX_POST - len;
    if (len > WARN_POST) {
      counter.textContent = `${remaining}`;
      counter.className = 'char-count ' + (remaining < 0 ? 'over' : 'warn');
    } else {
      counter.textContent = '';
      counter.className = 'char-count';
    }
    btnPost.disabled = len === 0 || len > MAX_POST;
  });

  btnPost.addEventListener('click', submitPost);

  textarea.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !btnPost.disabled) {
      submitPost();
    }
  });
}

async function submitPost() {
  if (!currentUser) return;
  const textarea = document.getElementById('post-input');
  const btnPost  = document.getElementById('btn-post');
  const body = textarea.value.trim();
  if (!body || body.length > MAX_POST) return;

  const name  = displayName(currentUser);
  const color = avatarColor(name);

  // Optimistic UI
  const tempId = 'opt-' + Date.now();
  const tempCard = buildPostCard({
    id: tempId,
    authorName: name,
    avatarColor: color,
    body,
    timestamp: null,
    likeCount: 0,
    likedBy: [],
    replyCount: 0,
    optimistic: true,
  });
  const feed = document.getElementById('feed-list');
  feed.prepend(tempCard);
  textarea.value = '';
  document.getElementById('char-count').textContent = '';
  btnPost.disabled = true;
  document.getElementById('empty-state').hidden = true;

  try {
    await addDoc(collection(db, 'community_posts'), {
      authorId:   currentUser.uid,
      authorName: name,
      body,
      timestamp:  serverTimestamp(),
      likeCount:  0,
      likedBy:    [],
      replyCount: 0,
    });
    // Real doc will arrive via onSnapshot; remove optimistic card
    tempCard.remove();
  } catch (err) {
    console.error('Post failed:', err);
    tempCard.remove();
    showToast('Could not post — please try again.');
    textarea.value = body;
    btnPost.disabled = false;
  }
}

// ── Feed ──────────────────────────────────────────────
function initFeed() {
  const skeleton   = document.getElementById('skeleton');
  const feedList   = document.getElementById('feed-list');
  const emptyState = document.getElementById('empty-state');
  const feedCount  = document.getElementById('feed-count');

  if (unsubPosts) { unsubPosts(); unsubPosts = null; }
  replyUnsubs.forEach(u => u());
  replyUnsubs.clear();
  openReplies.clear();
  feedList.innerHTML = '';
  skeleton.hidden = false;

  const col = collection(db, 'community_posts');
  const field = currentSort === 'top' ? 'likeCount' : 'timestamp';
  const q = query(col, orderBy(field, 'desc'));

  unsubPosts = onSnapshot(q, (snap) => {
    skeleton.hidden = true;

    const docs = snap.docs;
    feedCount.textContent = docs.length === 0 ? '' :
      `${docs.length} post${docs.length === 1 ? '' : 's'}`;

    emptyState.hidden = docs.length > 0;

    // Sync cards: add new, remove deleted, keep existing in order
    const existingIds = new Set([...feedList.children].map(el => el.dataset.id));
    const incomingIds = new Set(docs.map(d => d.id));

    // Remove deleted
    [...feedList.children].forEach(el => {
      if (!incomingIds.has(el.dataset.id)) el.remove();
    });

    // Rebuild in correct order
    docs.forEach((docSnap, i) => {
      const data = docSnap.data();
      const existingCard = feedList.querySelector(`[data-id="${docSnap.id}"]`);

      if (existingCard) {
        // Update mutable fields without full re-render
        updatePostCard(existingCard, docSnap.id, data);
        // Move to correct position
        if (feedList.children[i] !== existingCard) {
          feedList.insertBefore(existingCard, feedList.children[i] || null);
        }
      } else {
        const card = buildPostCard({
          id: docSnap.id,
          authorName:  data.authorName  || 'Hiker',
          avatarColor: avatarColor(data.authorName || ''),
          body:        data.body        || '',
          timestamp:   data.timestamp,
          likeCount:   data.likeCount   || 0,
          likedBy:     data.likedBy     || [],
          replyCount:  data.replyCount  || 0,
          optimistic:  false,
        });
        feedList.insertBefore(card, feedList.children[i] || null);
      }
    });
  }, (err) => {
    skeleton.hidden = true;
    console.error('Feed error:', err);
    showToast('Could not load posts.');
  });
}

// ── Build post card DOM ───────────────────────────────
function buildPostCard({ id, authorName, avatarColor: color, body, timestamp, likeCount, likedBy, replyCount, optimistic }) {
  const isLiked = currentUser ? likedBy.includes(currentUser.uid) : false;

  const article = document.createElement('article');
  article.className = 'post-card' + (optimistic ? ' optimistic' : '');
  article.dataset.id = id;
  article.setAttribute('aria-label', `Post by ${authorName}`);

  article.innerHTML = `
    <div class="post-header">
      <div class="avatar" style="background:${color}" aria-hidden="true">${initial(authorName)}</div>
      <div class="post-meta">
        <span class="post-author">${escHtml(authorName)}</span>
        <span class="post-time js-time">${timestamp ? relTime(timestamp) : ''}</span>
      </div>
      ${optimistic ? '<span class="posting-badge">Posting…</span>' : ''}
    </div>
    <p class="post-body">${escHtml(body)}</p>
    <div class="post-actions">
      <button class="action-btn like-btn${isLiked ? ' liked' : ''}" data-id="${id}"
              aria-label="${isLiked ? 'Unlike' : 'Like'} post" aria-pressed="${isLiked}">
        ${heartSVG()}
        <span class="js-like-count">${likeCount}</span>
      </button>
      <button class="action-btn reply-btn" data-id="${id}"
              aria-expanded="false" aria-label="Reply to post (${replyCount} ${replyCount === 1 ? 'reply' : 'replies'})">
        ${replySVG()}
        <span class="js-reply-label">Reply${replyCount > 0 ? ` (${replyCount})` : ''}</span>
      </button>
    </div>
    <div class="replies-area" id="replies-${id}" data-post-id="${id}" hidden>
      <div class="reply-composer-wrap"></div>
      <div class="reply-list" id="reply-list-${id}" role="list" aria-label="Replies"></div>
    </div>
  `;

  if (!optimistic) {
    article.querySelector('.like-btn').addEventListener('click', () => handleLike(id));
    article.querySelector('.reply-btn').addEventListener('click', () => toggleReplies(id, article));
  }

  return article;
}

// ── Update existing card fields (without full re-render) ──
function updatePostCard(card, id, data) {
  const likedBy   = data.likedBy   || [];
  const likeCount = data.likeCount || 0;
  const replyCount = data.replyCount || 0;
  const isLiked   = currentUser ? likedBy.includes(currentUser.uid) : false;

  const likeBtn = card.querySelector('.like-btn');
  if (likeBtn) {
    likeBtn.classList.toggle('liked', isLiked);
    likeBtn.setAttribute('aria-pressed', String(isLiked));
    likeBtn.setAttribute('aria-label', (isLiked ? 'Unlike' : 'Like') + ' post');
    const count = likeBtn.querySelector('.js-like-count');
    if (count) count.textContent = likeCount;
  }

  const replyBtn = card.querySelector('.reply-btn');
  if (replyBtn) {
    const label = replyBtn.querySelector('.js-reply-label');
    if (label) label.textContent = `Reply${replyCount > 0 ? ` (${replyCount})` : ''}`;
    replyBtn.setAttribute('aria-label', `Reply to post (${replyCount} ${replyCount === 1 ? 'reply' : 'replies'})`);
  }
}

// ── Like / unlike ─────────────────────────────────────
async function handleLike(postId) {
  if (!currentUser) { showToast('Sign in to like posts.'); return; }
  const uid  = currentUser.uid;
  const ref  = doc(db, 'community_posts', postId);

  // Optimistic toggle
  const btn   = document.querySelector(`.like-btn[data-id="${postId}"]`);
  const isLiked = btn?.classList.contains('liked');
  const countEl = btn?.querySelector('.js-like-count');

  if (btn) {
    btn.classList.toggle('liked');
    btn.setAttribute('aria-pressed', String(!isLiked));
    if (countEl) countEl.textContent = parseInt(countEl.textContent) + (isLiked ? -1 : 1);
  }

  try {
    if (isLiked) {
      await updateDoc(ref, { likedBy: arrayRemove(uid), likeCount: increment(-1) });
    } else {
      await updateDoc(ref, { likedBy: arrayUnion(uid), likeCount: increment(1) });
    }
  } catch (err) {
    console.error('Like error:', err);
    // Revert optimistic update
    if (btn) {
      btn.classList.toggle('liked');
      if (countEl) countEl.textContent = parseInt(countEl.textContent) + (isLiked ? 1 : -1);
    }
    showToast('Could not update like.');
  }
}

// ── Replies panel ─────────────────────────────────────
function toggleReplies(postId, card) {
  const area = card.querySelector(`#replies-${postId}`);
  const btn  = card.querySelector('.reply-btn');
  const isOpen = !area.hidden;

  if (isOpen) {
    area.hidden = true;
    btn.classList.remove('reply-open');
    btn.setAttribute('aria-expanded', 'false');
    openReplies.delete(postId);
    if (replyUnsubs.has(postId)) {
      replyUnsubs.get(postId)();
      replyUnsubs.delete(postId);
    }
  } else {
    area.hidden = false;
    btn.classList.add('reply-open');
    btn.setAttribute('aria-expanded', 'true');
    openReplies.add(postId);

    const composerWrap = area.querySelector('.reply-composer-wrap');
    renderReplyComposer(composerWrap, postId);
    loadReplies(postId);
  }
}

function renderReplyComposer(wrap, postId) {
  if (!wrap) return;
  if (!currentUser) {
    wrap.innerHTML = `<p class="reply-guest-prompt"><a href="login.html">Sign in</a> to reply.</p>`;
    return;
  }

  const name  = displayName(currentUser);
  const color = avatarColor(name);

  wrap.innerHTML = `
    <div class="reply-composer">
      <div class="avatar sm" style="background:${color}" aria-hidden="true">${initial(name)}</div>
      <div class="reply-fields">
        <label for="reply-input-${postId}" class="sr-only">Write a reply</label>
        <textarea class="reply-textarea" id="reply-input-${postId}"
                  placeholder="Write a reply…" maxlength="280"
                  aria-label="Write a reply"></textarea>
        <div class="reply-footer">
          <span class="char-count js-reply-count" aria-live="polite"></span>
          <button class="btn-reply-submit" disabled data-post-id="${postId}">Reply</button>
        </div>
      </div>
    </div>
  `;

  const textarea = wrap.querySelector('.reply-textarea');
  const btn      = wrap.querySelector('.btn-reply-submit');
  const counter  = wrap.querySelector('.js-reply-count');

  textarea.addEventListener('input', () => {
    const len = textarea.value.length;
    const remaining = 280 - len;
    if (len > 240) {
      counter.textContent = `${remaining}`;
      counter.className = 'char-count js-reply-count ' + (remaining < 0 ? 'over' : 'warn');
    } else {
      counter.textContent = '';
    }
    btn.disabled = len === 0 || len > 280;
  });

  textarea.addEventListener('keydown', (e) => {
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter' && !btn.disabled) {
      submitReply(postId, textarea, btn);
    }
  });

  btn.addEventListener('click', () => submitReply(postId, textarea, btn));
}

async function submitReply(postId, textarea, btn) {
  if (!currentUser) return;
  const body = textarea.value.trim();
  if (!body || body.length > 280) return;

  const name  = displayName(currentUser);
  btn.disabled = true;
  btn.textContent = 'Posting…';

  // Optimistic reply
  const replyList = document.getElementById(`reply-list-${postId}`);
  const tempReply = buildReplyCard({
    id: 'opt-r-' + Date.now(),
    postId,
    authorName: name,
    body,
    timestamp: null,
    likeCount: 0,
    likedBy: [],
    optimistic: true,
  });
  replyList.appendChild(tempReply);
  textarea.value = '';
  textarea.dispatchEvent(new Event('input'));

  try {
    await addDoc(collection(db, 'community_posts', postId, 'replies'), {
      authorId:   currentUser.uid,
      authorName: name,
      body,
      timestamp:  serverTimestamp(),
      likeCount:  0,
      likedBy:    [],
    });
    // Update reply count on parent post
    await updateDoc(doc(db, 'community_posts', postId), {
      replyCount: increment(1),
    });
    tempReply.remove();
  } catch (err) {
    console.error('Reply error:', err);
    tempReply.remove();
    showToast('Could not post reply.');
    textarea.value = body;
    textarea.dispatchEvent(new Event('input'));
  } finally {
    btn.textContent = 'Reply';
    btn.disabled = textarea.value.trim().length === 0;
  }
}

function loadReplies(postId) {
  if (replyUnsubs.has(postId)) return;

  const list = document.getElementById(`reply-list-${postId}`);
  if (!list) return;

  const q = query(
    collection(db, 'community_posts', postId, 'replies'),
    orderBy('timestamp', 'asc')
  );

  const unsub = onSnapshot(q, (snap) => {
    const existing = new Set([...list.children].map(el => el.dataset.id));
    const incoming = new Set(snap.docs.map(d => d.id));

    // Remove deleted
    [...list.children].forEach(el => {
      if (!incoming.has(el.dataset.id)) el.remove();
    });

    snap.docs.forEach((docSnap, i) => {
      const data = docSnap.data();
      if (existing.has(docSnap.id)) {
        updateReplyCard(list.querySelector(`[data-id="${docSnap.id}"]`), docSnap.id, postId, data);
      } else {
        const card = buildReplyCard({
          id: docSnap.id,
          postId,
          authorName: data.authorName || 'Hiker',
          body:       data.body || '',
          timestamp:  data.timestamp,
          likeCount:  data.likeCount || 0,
          likedBy:    data.likedBy || [],
          optimistic: false,
        });
        list.insertBefore(card, list.children[i] || null);
      }
    });
  });

  replyUnsubs.set(postId, unsub);
}

function buildReplyCard({ id, postId, authorName, body, timestamp, likeCount, likedBy, optimistic }) {
  const color   = avatarColor(authorName);
  const isLiked = currentUser ? likedBy.includes(currentUser.uid) : false;

  const div = document.createElement('div');
  div.className = 'reply-card' + (optimistic ? ' optimistic' : '');
  div.dataset.id = id;
  div.setAttribute('role', 'listitem');

  div.innerHTML = `
    <div class="reply-header">
      <div class="avatar sm" style="background:${color}" aria-hidden="true">${initial(authorName)}</div>
      <span class="reply-author">${escHtml(authorName)}</span>
      <span class="reply-time js-time">${timestamp ? relTime(timestamp) : ''}</span>
    </div>
    <p class="reply-body">${escHtml(body)}</p>
    <div class="reply-actions">
      <button class="action-btn like-btn${isLiked ? ' liked' : ''}"
              data-post-id="${postId}" data-reply-id="${id}"
              aria-label="${isLiked ? 'Unlike' : 'Like'} reply" aria-pressed="${isLiked}">
        ${heartSVG()}
        <span class="js-like-count">${likeCount}</span>
      </button>
    </div>
  `;

  if (!optimistic) {
    div.querySelector('.like-btn').addEventListener('click', () => handleReplyLike(postId, id));
  }

  return div;
}

function updateReplyCard(card, replyId, postId, data) {
  const likedBy   = data.likedBy   || [];
  const likeCount = data.likeCount || 0;
  const isLiked   = currentUser ? likedBy.includes(currentUser.uid) : false;

  const likeBtn = card.querySelector('.like-btn');
  if (likeBtn) {
    likeBtn.classList.toggle('liked', isLiked);
    likeBtn.setAttribute('aria-pressed', String(isLiked));
    const count = likeBtn.querySelector('.js-like-count');
    if (count) count.textContent = likeCount;
  }
}

async function handleReplyLike(postId, replyId) {
  if (!currentUser) { showToast('Sign in to like replies.'); return; }
  const uid = currentUser.uid;
  const ref = doc(db, 'community_posts', postId, 'replies', replyId);

  const btn   = document.querySelector(`.like-btn[data-reply-id="${replyId}"]`);
  const isLiked = btn?.classList.contains('liked');
  const countEl = btn?.querySelector('.js-like-count');

  if (btn) {
    btn.classList.toggle('liked');
    btn.setAttribute('aria-pressed', String(!isLiked));
    if (countEl) countEl.textContent = parseInt(countEl.textContent) + (isLiked ? -1 : 1);
  }

  try {
    if (isLiked) {
      await updateDoc(ref, { likedBy: arrayRemove(uid), likeCount: increment(-1) });
    } else {
      await updateDoc(ref, { likedBy: arrayUnion(uid), likeCount: increment(1) });
    }
  } catch (err) {
    if (btn) {
      btn.classList.toggle('liked');
      if (countEl) countEl.textContent = parseInt(countEl.textContent) + (isLiked ? 1 : -1);
    }
    showToast('Could not update like.');
  }
}

// ── Sort ──────────────────────────────────────────────
function initSort() {
  document.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (btn.dataset.sort === currentSort) return;
      document.querySelectorAll('.sort-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSort = btn.dataset.sort;
      initFeed();
    });
  });
}

// ── Relative time refresh (every 60s) ─────────────────
setInterval(() => {
  document.querySelectorAll('.js-time').forEach(el => {
    // Timestamps are in the DOM data via Firestore snapshot;
    // We re-run relTime on the post-card's stored timestamp via data attribute
  });
}, 60_000);

// ── SVG helpers ───────────────────────────────────────
function heartSVG() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"/>
  </svg>`;
}

function replySVG() {
  return `<svg viewBox="0 0 24 24" aria-hidden="true">
    <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
  </svg>`;
}

// ── Escape HTML ───────────────────────────────────────
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

// ── Boot ──────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  initComposer();
  initSort();
  initFeed();
});
