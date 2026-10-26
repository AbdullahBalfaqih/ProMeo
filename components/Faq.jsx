'use client';

import { useState } from 'react';
import { faqs } from '@/lib/data';
import { Eyebrow } from '@/components/ui/Atoms';

export default function Faq() {
  const [openIndex, setOpenIndex] = useState(0);

  const toggle = (index) => {
    setOpenIndex((current) => (current === index ? -1 : index));
  };

  return (
    <section className="faq section" id="faq">
      <div className="container">
        <div className="section-head" data-reveal="">
          <Eyebrow label="General FAQ" />
          <h2>Frequently Asked Questions</h2>
        </div>

        <div className="faq-list" data-reveal="" style={{ '--d': '.08s' }}>
          {faqs.map((faq, index) => {
            const isOpen = openIndex === index;
            return (
              <div className={isOpen ? 'faq-item open' : 'faq-item'} key={faq.q}>
                <button
                  className="faq-q"
                  aria-expanded={isOpen}
                  type="button"
                  onClick={() => toggle(index)}
                >
                  <span>{faq.q}</span>
                  <span className="faq-ic">
                    <i></i>
                    <i></i>
                  </span>
                </button>
                <div className="faq-a">
                  <div className="faq-a-inner">
                    <p>{faq.a}</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}
