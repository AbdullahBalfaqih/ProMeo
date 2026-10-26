'use client';

import { useEffect, useRef, useState } from 'react';
import { ctaBars } from '@/lib/data';
import { Eyebrow } from '@/components/ui/Atoms';

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export default function Cta() {
  const [email, setEmail] = useState('');
  const [note, setNote] = useState('');
  const [hasError, setHasError] = useState(false);
  const [toast, setToast] = useState('');
  const toastTimer = useRef(null);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  const showToast = (message) => {
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(''), 4200);
  };

  const onSubmit = (event) => {
    event.preventDefault();
    const value = email.trim();
    if (!EMAIL_RE.test(value)) {
      setHasError(true);
      setNote('Please enter a valid email address.');
      return;
    }
    setHasError(false);
    setNote('');
    setEmail('');
    showToast("You're in! Welcome to the ProMeo APN network.");
  };

  return (
    <section className="cta-section section" id="pricing">
      <div className="container-wide">
        <div className="cta-card" data-reveal="">
          <div className="cta-bars" aria-hidden="true">
            {ctaBars.map((height, i) => (
              <span key={i} style={{ '--h': height }}></span>
            ))}
          </div>
          <div className="cta-content">
            <Eyebrow label="Get Started" />
            <h2>Empower Your Autonomous Agents with MUSD Settlement Today</h2>
            <form className="cta-form" id="ctaForm" noValidate onSubmit={onSubmit}>
              <label className="visually-hidden" htmlFor="ctaEmail">
                Email address
              </label>
              <input
                id="ctaEmail"
                type="email"
                name="email"
                placeholder="Email Address"
                autoComplete="email"
                required
                value={email}
                onChange={(event) => setEmail(event.target.value)}
              />
              <button className="btn btn-primary" type="submit">
                <span className="orb">
                  <svg>
                    <use href="#i-spark" />
                  </svg>
                </span>
                <span>Get Protocol Access</span>
              </button>
            </form>
            <p className={hasError ? 'form-note err' : 'form-note'} id="formNote" role="status">
              {note}
            </p>
          </div>
        </div>
      </div>

      <div className={toast ? 'toast show' : 'toast'} id="toast" role="status" aria-live="polite">
        <svg viewBox="0 0 24 24">
          <path d="m5 12.5 4.2 4.2L19 7" />
        </svg>
        <span>{toast}</span>
      </div>
    </section>
  );
}
