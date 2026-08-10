export const THEME_STORAGE_KEY = 'nuxt-skeleton-theme'

export const THEME_BOOTSTRAP_SCRIPT = `(function(){try{var key='${THEME_STORAGE_KEY}';var saved=localStorage.getItem(key);var theme=(saved==='light'||saved==='dark'||saved==='system')?saved:'system';var resolved=theme==='system'?(matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):theme;document.documentElement.dataset.theme=resolved;document.documentElement.style.colorScheme=resolved;}catch(_){}})();`
