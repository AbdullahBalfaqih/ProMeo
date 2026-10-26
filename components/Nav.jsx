'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { navLinks } from '@/lib/data';
import { useAuth } from '@/components/Web3Provider';

const SECTION_IDS = ['home', 'about', 'services', 'process', 'features', 'token', 'testimonials', 'faq'];

export default function Nav() {
  const { address, isAuthenticated, handleGetStarted } = useAuth();
  const [scrolled, setScrolled] = useState(false);
  const [open, setOpen] = useState(false);
  const [activeHref, setActiveHref] = useState('#home');
  const navRef = useRef(null);

  /* sticky background on scroll */
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  /* body lock + label for the mobile overlay */
  useEffect(() => {
    document.body.classList.toggle('menu-open', open);
    return () => document.body.classList.remove('menu-open');
  }, [open]);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onResize = () => {
      if (window.innerWidth > 1100) setOpen(false);
    };
    window.addEventListener('keydown', onKey);
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  /* active section spy */
  useEffect(() => {
    if (!('IntersectionObserver' in window)) return;
    const sections = SECTION_IDS.map((id) => document.getElementById(id)).filter(Boolean);
    const spy = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) setActiveHref(`#${entry.target.id}`);
        });
      },
      { rootMargin: '-38% 0px -52% 0px', threshold: 0 }
    );
    sections.forEach((section) => spy.observe(section));
    return () => spy.disconnect();
  }, []);

  const closeMenu = useCallback(() => setOpen(false), []);

  return (
    <>
      <header className={scrolled ? 'nav scrolled' : 'nav'} id="nav" ref={navRef} suppressHydrationWarning>
        <div className="nav-inner" suppressHydrationWarning>
          <a className="nav-logo" href="#home" aria-label="ProMeo home" suppressHydrationWarning>
            <img src="/assets/logo.png" alt="ProMeo" style={{ height: '38px', width: 'auto', marginRight: '10px' }} />
            <span className="brand-name">ProMeo</span>
          </a>

          <nav className="nav-links" id="navLinks" aria-label="Main navigation" suppressHydrationWarning>
            {navLinks.map((link) => (
              <a
                key={link.href}
                className={activeHref === link.href ? 'nav-link active' : 'nav-link'}
                href={link.href}
                suppressHydrationWarning
              >
                {link.label}
              </a>
            ))}
          </nav>

          <button
            className="btn nav-cta"
            onClick={handleGetStarted}
            type="button"
            id="navCtaBtn"
            style={{ cursor: 'pointer' }}
            suppressHydrationWarning
          >
            <span className="orb">
              <svg>
                <use href="#i-spark" />
              </svg>
            </span>
            <span>
              {isAuthenticated && address
                ? `${address.slice(0, 6)}…${address.slice(-4)}`
                : 'Connect Wallet'}
            </span>
          </button>

          <button
            className="menu-btn"
            id="menuBtn"
            aria-label={open ? 'Close menu' : 'Open menu'}
            aria-expanded={open}
            aria-controls="mobileMenu"
            onClick={() => setOpen((v) => !v)}
            type="button"
          >
            <svg className="ic-open">
              <use href="#i-menu" />
            </svg>
            <svg className="ic-close">
              <use href="#i-close" />
            </svg>
          </button>
        </div>
      </header>

      <div className="mobile-menu" id="mobileMenu" suppressHydrationWarning>
        <nav className="mobile-links" aria-label="Mobile navigation" suppressHydrationWarning>
          {navLinks.map((link) => (
            <a key={link.href} href={link.href} onClick={closeMenu} suppressHydrationWarning>
              {link.label}
            </a>
          ))}
          <button
            className="btn mobile-cta"
            onClick={() => {
              closeMenu();
              handleGetStarted();
            }}
            type="button"
            style={{ cursor: 'pointer', width: '100%' }}
          >
            <span className="orb">
              <svg>
                <use href="#i-spark" />
              </svg>
            </span>
            <span>
              {isAuthenticated && address
                ? `Dashboard (${address.slice(0, 6)}…)`
                : 'Connect Wallet'}
            </span>
          </button>
        </nav>
        <div className="mobile-glow"></div>
      </div>
    </>
  );
}
