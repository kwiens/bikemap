// Escape a string for safe interpolation into HTML markup. Use this for any
// value that is rendered via innerHTML / Mapbox Popup.setHTML, especially data
// that originates from external sources (e.g. the live GBFS feed).
export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}
