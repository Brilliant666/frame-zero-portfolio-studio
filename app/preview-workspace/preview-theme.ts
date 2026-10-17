// v2: night became the default, so earlier saved choices are not carried over.
export const PREVIEW_THEME_KEY = "frame-zero:preview-star-theme:v2";
export const PREVIEW_THEME_BOOTSTRAP = `(function(){if(!/^\\/preview\\/?$/.test(location.pathname))return;var t='night';try{if(localStorage.getItem('${PREVIEW_THEME_KEY}')==='paper')t='paper'}catch(e){}var h=document.documentElement;h.dataset.previewTheme=t;h.dataset.starTheme=t})()`;
// Loaded in the development-only head, before lazy preview CSS and the first paint.
export const PREVIEW_THEME_BOOTSTRAP_CSS = `html[data-preview-theme="paper"]{background:#d8d6f0;color:#1f2340;color-scheme:light;--star-intro-bg:#cdcff0;--star-accent:#6a63c6}html[data-preview-theme="night"]{background:#171716;color:#eeeae3;color-scheme:dark;--star-intro-bg:#171716;--star-accent:#e4ded3}html[data-preview-theme] body{background:transparent;color:inherit}`;
