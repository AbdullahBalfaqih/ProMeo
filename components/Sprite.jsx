/* eslint-disable react/no-unknown-property */
/**
 * Sprite — all inline SVG icons used across the page (single source of truth).
 * Rendered once in the layout; icons reference them with <use href="#id" />.
 */
export default function Sprite() {
  return (
    <svg className="sprite" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <symbol id="i-spark" viewBox="0 0 24 24"><path d="M12 2.6c.28 0 .52.18.6.45l1.65 5.63a4.6 4.6 0 0 0 3.07 3.07l5.63 1.65a.62.62 0 0 1 0 1.2l-5.63 1.65a4.6 4.6 0 0 0-3.07 3.07l-1.65 5.63a.62.62 0 0 1-1.2 0l-1.65-5.63a4.6 4.6 0 0 0-3.07-3.07l-5.63-1.65a.62.62 0 0 1 0-1.2l5.63-1.65a4.6 4.6 0 0 0 3.07-3.07l1.65-5.63A.62.62 0 0 1 12 2.6Z" /></symbol>
      <symbol id="i-arrow" viewBox="0 0 24 24"><path d="M5 12h14M13 6l6 6-6 6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></symbol>
      <symbol id="i-chev-d" viewBox="0 0 24 24"><path d="m6 9 6 6 6-6" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></symbol>
      <symbol id="i-check" viewBox="0 0 24 24"><path d="m5 12.5 4.2 4.2L19 7" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></symbol>
      <symbol id="i-plus" viewBox="0 0 24 24"><path d="M12 5v14M5 12h14" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></symbol>
      <symbol id="i-star" viewBox="0 0 24 24"><path d="m12 2.6 2.86 5.94 6.54.9-4.77 4.56 1.17 6.5L12 17.4l-5.8 3.1 1.17-6.5L2.6 9.44l6.54-.9L12 2.6Z" /></symbol>
      <symbol id="i-menu" viewBox="0 0 24 24"><path d="M4 7h16M4 12h16M4 17h16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></symbol>
      <symbol id="i-close" viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" /></symbol>
      <symbol id="i-layers" viewBox="0 0 24 24"><path d="m12 3 9 4.5-9 4.5-9-4.5L12 3Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="m3 12 9 4.5 9-4.5M3 16.5 12 21l9-4.5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></symbol>
      <symbol id="i-candles" viewBox="0 0 24 24"><path d="M7 4v3M7 17v3M17 3v3M17 16v5M12 2v4M12 18v4" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><rect x="5" y="7" width="4" height="10" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.6" /><rect x="15" y="6" width="4" height="10" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.6" /><rect x="10" y="6" width="4" height="12" rx="1.2" fill="none" stroke="currentColor" strokeWidth="1.6" /></symbol>
      <symbol id="i-unlock" viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M8 10V7.5a4.5 4.5 0 0 1 8.6-1.8" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" /><circle cx="12" cy="15.5" r="1.4" fill="currentColor" /></symbol>
      <symbol id="i-bars" viewBox="0 0 24 24"><path d="M5 20V11M10 20V5M15 20v-6M20 20V8" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></symbol>
      <symbol id="i-coins" viewBox="0 0 24 24"><ellipse cx="12" cy="6.5" rx="7" ry="3" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M5 6.5v5c0 1.66 3.13 3 7 3s7-1.34 7-3v-5" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M5 11.5v5c0 1.66 3.13 3 7 3s7-1.34 7-3v-5" fill="none" stroke="currentColor" strokeWidth="1.5" /></symbol>
      <symbol id="i-wallet" viewBox="0 0 24 24"><rect x="3" y="6" width="18" height="14" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M3 9h18" stroke="currentColor" strokeWidth="1.6" /><circle cx="17" cy="14.5" r="1.3" fill="currentColor" /></symbol>
      <symbol id="i-shield" viewBox="0 0 24 24"><path d="M12 3 5 6v6c0 4.5 2.9 7.4 7 9 4.1-1.6 7-4.5 7-9V6l-7-3Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" /><path d="m9 12 2 2 4-4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></symbol>
      <symbol id="i-api" viewBox="0 0 24 24"><path d="m8 8-5 4 5 4M16 8l5 4-5 4M13.5 5l-3 14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" /></symbol>
      <symbol id="i-globe" viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" strokeWidth="1.5" /><path d="M3 12h18M12 3c2.5 2.4 3.8 5.5 3.8 9S14.5 18.6 12 21c-2.5-2.4-3.8-5.5-3.8-9S9.5 5.4 12 3Z" fill="none" stroke="currentColor" strokeWidth="1.5" /></symbol>
      <symbol id="i-briefcase" viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M9 7V5.5A1.5 1.5 0 0 1 10.5 4h3A1.5 1.5 0 0 1 15 5.5V7M3 12h18" fill="none" stroke="currentColor" strokeWidth="1.6" /></symbol>
      <symbol id="i-refresh" viewBox="0 0 24 24"><path d="M20 11a8 8 0 1 0-.9 4.8M20 4v7h-7" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" /></symbol>
      <symbol id="i-chat" viewBox="0 0 24 24"><path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.2-.6L3 21l1.7-5A8.3 8.3 0 0 1 3.6 11.5a8.4 8.4 0 0 1 8.7-8.3 8.4 8.4 0 0 1 8.7 8.3Z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /><path d="M8.5 11.5h.01M12 11.5h.01M15.5 11.5h.01" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" /></symbol>
      <symbol id="i-lock" viewBox="0 0 24 24"><rect x="4" y="10" width="16" height="11" rx="3" fill="none" stroke="currentColor" strokeWidth="1.6" /><path d="M8 10V7.5a4 4 0 0 1 8 0V10" fill="none" stroke="currentColor" strokeWidth="1.6" /><circle cx="12" cy="15.5" r="1.4" fill="currentColor" /></symbol>
      <symbol id="i-x" viewBox="0 0 24 24"><path d="M4 4h4.4l4.2 5.7L17.6 4H20l-6.1 7.2L20.5 20h-4.4l-4.5-6.1L6 20H3.6l6.6-7.8L4 4Z" /></symbol>
      <symbol id="i-ig" viewBox="0 0 24 24"><rect x="3.5" y="3.5" width="17" height="17" rx="5" fill="none" stroke="currentColor" strokeWidth="1.7" /><circle cx="12" cy="12" r="4" fill="none" stroke="currentColor" strokeWidth="1.7" /><circle cx="17.2" cy="6.8" r="1.2" fill="currentColor" /></symbol>
      <symbol id="i-in" viewBox="0 0 24 24"><path d="M6.5 9.5V19M6.5 6.5v.01M11 19v-5.2c0-2 1.2-3.3 3-3.3s2.8 1.2 2.8 3.4V19M11 9.5V19" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></symbol>
      <symbol id="i-thumb" viewBox="0 0 24 24"><path d="M7 10v10H4V10h3Zm0 0 4.2-7.2c.3-.6.9-1 1.6-1 1.2 0 2.2 1 2.2 2.2V9h3.9c1.6 0 2.7 1.4 2.4 2.9l-1.4 6.6A2.5 2.5 0 0 1 17.4 20H7" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" /></symbol>
    </svg>
  );
}
