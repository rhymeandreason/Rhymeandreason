(function () {
  const overlay = document.getElementById('lab-modal-overlay');
  const body = document.getElementById('lab-modal-body');
  const closeBtn = document.getElementById('lab-modal-close');

  function openModal(slug, push) {
    const tpl = document.getElementById('tpl-' + slug);
    if (!tpl) return;
    body.innerHTML = tpl.innerHTML;
    overlay.hidden = false;
    document.body.style.overflow = 'hidden';
    if (push) history.pushState({ slug }, '', '#' + slug);
  }

  function closeModal(push) {
    overlay.hidden = true;
    document.body.style.overflow = '';
    if (push) history.pushState({}, '', location.pathname);
  }

  document.querySelectorAll('.lab-card').forEach(card => {
    card.addEventListener('click', e => {
      e.preventDefault();
      openModal(card.dataset.slug, true);
    });
  });

  closeBtn.addEventListener('click', () => closeModal(true));
  overlay.addEventListener('click', e => { if (e.target === overlay) closeModal(true); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !overlay.hidden) closeModal(true); });
  window.addEventListener('popstate', () => {
    const slug = location.hash.slice(1);
    if (slug) openModal(slug, false); else closeModal(false);
  });

  if (location.hash) openModal(location.hash.slice(1), false);
})();
