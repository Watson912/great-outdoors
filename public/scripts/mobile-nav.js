/* Shared mobile nav — hamburger toggle + search icon expand */
(function () {
  const hamburger = document.getElementById('hamburger');
  const mobileMenu = document.getElementById('mobile-menu');
  const searchToggle = document.getElementById('search-toggle');
  const navSearch = document.querySelector('nav .nav-search');
  const searchInput = navSearch && navSearch.querySelector('input');

  if (hamburger && mobileMenu) {
    hamburger.addEventListener('click', () => {
      const open = mobileMenu.classList.toggle('open');
      hamburger.classList.toggle('active', open);
      hamburger.setAttribute('aria-expanded', open);
    });
  }

  if (searchToggle && navSearch) {
    searchToggle.addEventListener('click', () => {
      const open = navSearch.classList.toggle('open');
      if (open && searchInput) searchInput.focus();
    });

    document.addEventListener('click', (e) => {
      if (!navSearch.contains(e.target) && e.target !== searchToggle) {
        navSearch.classList.remove('open');
      }
    });
  }
})();
