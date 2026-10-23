const button = document.querySelector('#theme');
const media = matchMedia('(prefers-color-scheme: dark)');
const icons = {
  light: '<path d="M20.9 13.1A9 9 0 0 1 10.9 3.1 9 9 0 1 0 20.9 13.1Z"/>',
  dark: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M4.93 4.93l1.42 1.42m11.3 11.3 1.42 1.42M4.93 19.07l1.42-1.42m11.3-11.3 1.42-1.42"/>',
};
let preference;
try { preference = localStorage.getItem('texite-site-theme'); } catch {}
function apply(dark) {
  document.documentElement.classList.toggle('dark', dark);
  if (!button) return;
  const label = dark ? '切换浅色外观' : '切换深色外观';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.innerHTML = `<svg viewBox="0 0 24 24" aria-hidden="true">${icons[dark ? 'dark' : 'light']}</svg>`;
}
apply(preference === 'dark' || (!preference && media.matches));
button?.addEventListener('click', () => {
  const dark = !document.documentElement.classList.contains('dark');
  preference = dark ? 'dark' : 'light';
  apply(dark);
  try { localStorage.setItem('texite-site-theme', preference); } catch {}
});
media.addEventListener('change', () => { if (!preference) apply(media.matches); });
