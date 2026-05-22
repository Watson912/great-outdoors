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
    console.log('Saved:', prefs);
});