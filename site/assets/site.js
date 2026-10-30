// Shared by the English (/) and Persian (/fa/) landing pages; strings follow <html lang>.
const fa = document.documentElement.lang === 'fa';
const text = fa
  ? { copy: 'کپی', copied: 'کپی شد', copiedStatus: 'دستورهای نصب کپی شد.', manual: 'انتخاب و کپی کنید', failed: 'کپی نشد. دستورها را انتخاب و دستی کپی کنید.' }
  : { copy: 'Copy', copied: 'Copied', copiedStatus: 'Install commands copied to the clipboard.', manual: 'Select and copy', failed: 'Copy failed. Select the commands and copy them manually.' };

// Sticky nav border once the page scrolls.
const nav = document.getElementById('nav');
addEventListener('scroll', () => nav.classList.toggle('scrolled', scrollY > 8), { passive: true });

// Fade sections in as they enter the viewport.
const items = document.querySelectorAll('.reveal');
if ('IntersectionObserver' in window && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  const io = new IntersectionObserver(entries => {
    for (const entry of entries) if (entry.isIntersecting) { entry.target.classList.add('in'); io.unobserve(entry.target); }
  }, { rootMargin: '0px 0px -8% 0px' });
  items.forEach(el => io.observe(el));
} else {
  items.forEach(el => el.classList.add('in'));
}

// Hero screenshot: tilted back at first, flattens as you scroll; follows the pointer a little.
const stage = document.getElementById('stage');
if (stage && !matchMedia('(prefers-reduced-motion: reduce)').matches) {
  let ticking = false, mx = 0, my = 0;
  const update = () => {
    ticking = false;
    const top = stage.getBoundingClientRect().top;
    const p = Math.min(1, Math.max(0, 1 - (top - innerHeight * 0.25) / (innerHeight * 0.6)));
    stage.style.setProperty('--p', p.toFixed(3));
    stage.style.setProperty('--mx', mx.toFixed(3));
    stage.style.setProperty('--my', my.toFixed(3));
  };
  const queue = () => { if (!ticking) { ticking = true; requestAnimationFrame(update); } };
  addEventListener('scroll', queue, { passive: true });
  addEventListener('resize', queue);
  if (matchMedia('(pointer: fine)').matches) {
    addEventListener('pointermove', e => { mx = e.clientX / innerWidth - 0.5; my = e.clientY / innerHeight - 0.5; queue(); }, { passive: true });
  }
  update();
}

// Copy the install commands.
document.querySelectorAll('[data-copy]').forEach(button => button.addEventListener('click', async () => {
  const status = document.getElementById('copyStatus');
  try { await navigator.clipboard.writeText(button.dataset.copy); button.textContent = text.copied; status.textContent = text.copiedStatus; }
  catch { button.textContent = text.manual; status.textContent = text.failed; }
  setTimeout(() => { button.textContent = text.copy; status.textContent = ''; }, 1600);
}));

// Live star count from GitHub; the button works without it.
fetch('https://api.github.com/repos/edrisranjbar/lifeos', { headers: { Accept: 'application/vnd.github+json' } })
  .then(r => r.ok ? r.json() : null)
  .then(repo => {
    if (!repo || typeof repo.stargazers_count !== 'number') return;
    document.getElementById('starCount').textContent = new Intl.NumberFormat(fa ? 'fa-IR' : 'en-US', { notation: 'compact' }).format(repo.stargazers_count);
    document.getElementById('stars').hidden = false;
  })
  .catch(() => {});
