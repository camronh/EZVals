(function () {
  const media = matchMedia('(prefers-color-scheme: dark)');
  const apply = () => {
    const saved = localStorage.getItem('ezvals:theme');
    document.documentElement.classList.toggle('dark', saved ? saved === 'dark' : media.matches);
  };
  apply();
  media.addEventListener('change', apply);
})();
