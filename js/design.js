// Shared, dependency-free presentation helpers.
export function escapeHTML(value = '') {
  return String(value).replace(
    /[&<>"']/g,
    (char) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        char
      ],
  );
}

export function icon(name, className = '') {
  const paths = {
    grid: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
    flag: '<path d="M5 21V3m0 1c5-4 9 4 14 0v10c-5 4-9-4-14 0"/>',
    trophy:
      '<path d="M8 3h8v7a4 4 0 0 1-8 0V3Zm0 2H4v3a4 4 0 0 0 4 4m8-7h4v3a4 4 0 0 1-4 4m-4 2v6m-5 1h10"/>',
    arrow: '<path d="M4 12h16m-6-6 6 6-6 6"/>',
    clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
    chat: '<path d="M21 11a9 9 0 0 1-9 9H4l-2 2V11a9 9 0 0 1 19 0Z"/><path d="M7 10h10m-10 4h6"/>',
    eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
    menu: '<path d="M4 7h16M4 12h16M4 17h16"/>',
  };
  return `<svg class="icon ${className}" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.arrow}</svg>`;
}

export const brand = `<span class="brand-mark" aria-hidden="true"><i></i><i></i><i></i></span><span>F1<span class="brand-light">PREDICT</span><span class="brand-dot">®</span></span>`;

export function pageHeading(eyebrow, title, subtitle, aside = '') {
  return `<div class="page-header editorial-heading"><div><p class="eyebrow">${eyebrow}</p><h1 class="page-title">${title}</h1><p class="page-subtitle">${subtitle}</p></div>${aside}</div>`;
}

/**
 * Extract 2-letter ISO country code from emoji or country code string
 * @param {string} emoji 
 * @returns {string|null}
 */
export function emojiToCountryCode(emoji) {
  if (!emoji || typeof emoji !== 'string') return null;
  const clean = emoji.trim();
  if (/^[a-zA-Z]{2}$/.test(clean)) return clean.toLowerCase();
  const codePoints = [...clean].map(c => c.codePointAt(0));
  if (codePoints.length >= 2 && codePoints[0] >= 0x1F1E6 && codePoints[0] <= 0x1F1FF &&
      codePoints[1] >= 0x1F1E6 && codePoints[1] <= 0x1F1FF) {
    const c1 = String.fromCharCode(codePoints[0] - 0x1F1E6 + 65);
    const c2 = String.fromCharCode(codePoints[1] - 0x1F1E6 + 65);
    return (c1 + c2).toLowerCase();
  }
  return null;
}

/**
 * Render national flag as an authentic SVG image with emoji/CDN fallbacks
 * Ensures crisp, colorful flags render identically on desktop (Windows/Mac/Linux) and mobile
 * @param {string} flagOrCode - Country flag emoji or 2-letter code
 * @param {string} className - Optional CSS class
 * @param {string} altText - Optional accessible label
 * @returns {string} HTML string
 */
export function renderFlag(flagOrCode, className = 'race-flag', altText = '') {
  if (!flagOrCode) return '';
  const code = emojiToCountryCode(flagOrCode);
  if (!code) {
    return `<span class="${className}">${escapeHTML(flagOrCode)}</span>`;
  }
  const alt = escapeHTML(altText || code.toUpperCase());
  return `<span class="${className} flag-badge" aria-label="${alt}"><img src="assets/flags/${code}.svg" alt="${alt}" class="flag-img" loading="lazy" onerror="if(this.src!=='https://flagcdn.com/${code}.svg'){this.src='https://flagcdn.com/${code}.svg';}else{this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='inline';}"><span class="flag-fallback" style="display: none;" aria-hidden="true">${escapeHTML(flagOrCode)}</span></span>`;
}
