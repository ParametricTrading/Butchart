(() => {
  const ensureSqliteLoaded = () => {
    if (window.sqlite3InitModule) {
      return;
    }
    const script = document.createElement('script');
    script.src = 'sqlite3.js';
    script.defer = true;
    script.onerror = () => {
      console.error('Failed to load sqlite3.js.');
    };
    document.head.appendChild(script);
  };

  ensureSqliteLoaded();
})();
