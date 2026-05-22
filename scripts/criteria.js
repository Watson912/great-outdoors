const form = document.querySelector('#prefs-form');
const listEl = document.querySelector('#trail-list');

form.addEventListener('submit', (e) => {
    e.preventDefault();

    const prefs = {
        difficulty: form.difficulty.value,
        density: form.density.value,
        official: form.official.value
    };

    localStorage.setItem('prefs', JSON.stringify(prefs));
    showTrails(prefs)
});

function showTrails(prefs) {
    fetch('data/data.json')
        .then(res => res.json())
        .then(data => {
            const matches = data.trails.filter(trail =>
                trail.difficulty === prefs.difficulty &&
                trail.popularity === prefs.density
            );

            listEl.innerHTML = '';

            if (matches.length === 0) {
                listEl.innerHTML = '<li> No trails match your preferences.</li>';
                return;
            }

            matches.forEach(trail => {
                listEl.insertAdjacentHTML('beforeend', `<li><strong>${trail.name}</strong> - ${trail.location}</li>`)
            });
        })
}