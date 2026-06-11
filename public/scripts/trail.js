// trail.js — Reads ?id= from the URL, fetches trails.json, and renders the detail page

async function loadTrail() {
  const slug = new URLSearchParams(window.location.search).get('id');

  if (!slug) {
    showError('No trail specified.');
    return;
  }

  try {
    const response = await fetch('data/trails.json');
    const trails = await response.json();
    const trail = trails.find(t => t.slug === slug);

    if (!trail) {
      showError(`Trail "${slug}" not found.`);
      return;
    }

    renderTrail(trail);
  } catch (err) {
    console.error('Could not load trails.json:', err);
    showError('Failed to load trail data.');
  }
}

function renderTrail(trail) {
  document.title = `${trail.title} — PNW Trails`;

  // Hero
  const heroImg = document.getElementById('hero-img');
  heroImg.src = trail.image;
  heroImg.alt = trail.title;
  heroImg.onerror = () => {
    heroImg.style.display = 'none';
    document.getElementById('hero-emoji').textContent = trail.emoji;
    document.getElementById('hero-emoji').style.display = 'flex';
  };

  const diffLabel = trail.difficulty.charAt(0).toUpperCase() + trail.difficulty.slice(1);
  const heroBadge = document.getElementById('hero-difficulty');
  heroBadge.textContent = diffLabel;
  heroBadge.className = `difficulty-badge ${trail.difficulty}`;

  document.getElementById('trail-title').textContent = trail.title;
  document.getElementById('trail-location').textContent = `📍 ${trail.location}`;

  // Stats bar
  document.getElementById('stat-distance').textContent =
    trail.distance_miles ? `${trail.distance_miles} mi` : '—';
  document.getElementById('stat-elevation').textContent =
    trail.elevation_gain_ft ? `${trail.elevation_gain_ft.toLocaleString()} ft` : '—';
  document.getElementById('stat-type').textContent = trail.type || '—';
  document.getElementById('stat-difficulty').textContent = diffLabel;

  // Overview
  document.getElementById('trail-description').textContent = trail.description;
  document.getElementById('overview-points').innerHTML =
    trail.overview_points.map(p => `<li>${p}</li>`).join('');

  // Highlights
  document.getElementById('highlights-list').innerHTML =
    trail.highlights.map(h => `<li>${h}</li>`).join('');

  // Best time
  document.getElementById('best-time-heading').textContent = trail.best_time.heading;
  document.getElementById('best-time-seasons').innerHTML =
    trail.best_time.seasons.map(s => `<li>${s}</li>`).join('');

  // Tips
  document.getElementById('tips-list').innerHTML =
    trail.tips.map(t => `<li>${t}</li>`).join('');

  // External link
  const linkEl = document.getElementById('external-link');
  if (trail.link) {
    linkEl.href = trail.link;
  } else {
    linkEl.style.display = 'none';
  }
}

function showError(msg) {
  document.querySelector('main').innerHTML = `
    <p class="error-msg">${msg} <a href="trails.html">← Back to all trails</a></p>
  `;
}

loadTrail();
