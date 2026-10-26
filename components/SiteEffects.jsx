'use client';

import { useEffect } from 'react';

/**
 * SiteEffects — global, markup-free behaviours:
 *  - scroll-reveal for every `[data-reveal]` element
 *  - smooth anchor scrolling with the fixed-header offset
 * Runs once after hydration, exactly like the original main.js did.
 */
export default function SiteEffects() {
  useEffect(() => {
    const prefersReduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const revealEls = Array.from(document.querySelectorAll('[data-reveal]'));

    let io = null;
    if ('IntersectionObserver' in window && !prefersReduced) {
      io = new IntersectionObserver(
        (entries) => {
          entries.forEach((entry) => {
            if (entry.isIntersecting) {
              entry.target.classList.add('revealed');
              io.unobserve(entry.target);
            }
          });
        },
        { rootMargin: '0px 0px -8% 0px', threshold: 0.08 }
      );
      revealEls.forEach((el) => io.observe(el));
    } else {
      revealEls.forEach((el) => el.classList.add('revealed'));
    }

    const onClick = (event) => {
      const link = event.target instanceof Element ? event.target.closest('a[href^="#"]') : null;
      if (!link) return;
      const hash = link.getAttribute('href');
      if (!hash || hash.length < 2) return;
      const target = document.querySelector(hash);
      if (!target) return;
      event.preventDefault();
      const top = target.getBoundingClientRect().top + window.scrollY - 84;
      window.scrollTo({ top, behavior: prefersReduced ? 'auto' : 'smooth' });
      window.history.replaceState(null, '', hash);
    };

    document.addEventListener('click', onClick);

    return () => {
      if (io) io.disconnect();
      document.removeEventListener('click', onClick);
    };
  }, []);

  return null;
}
