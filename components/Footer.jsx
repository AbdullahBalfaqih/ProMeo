import { footerColumns, socials } from '@/lib/data';

export default function Footer() {
  return (
    <footer className="footer" id="contact" suppressHydrationWarning>
      <div className="footer-glow" aria-hidden="true"></div>
      <div className="container">
        <div className="footer-top">
          <div className="footer-brand">
            <a href="#home" aria-label="ProMeo home" style={{ display: 'inline-flex', alignItems: 'center', gap: '10px', marginBottom: '26px' }} suppressHydrationWarning>
              <img src="/assets/logo.png" alt="ProMeo" style={{ height: '40px', width: 'auto', marginBottom: 0 }} />
              <span className="brand-name" style={{ fontSize: '26px' }}>ProMeo</span>
            </a>
            <address suppressHydrationWarning>
              Mezo Testnet · Chain ID 31611
              <br />
              Decentralized Agent Procurement
              <a href="mailto:procurement@promeo.network" suppressHydrationWarning>procurement@promeo.network</a>
              <a href="https://explorer.test.mezo.org" target="_blank" rel="noopener" suppressHydrationWarning>Mezo Testnet Explorer</a>
            </address>
          </div>

          {footerColumns.map((column) => (
            <div className="footer-col" key={column.title} suppressHydrationWarning>
              <h4>{column.title}</h4>
              <ul suppressHydrationWarning>
                {column.links.map((link) => (
                  <li key={link.label} suppressHydrationWarning>
                    <a href={link.href} suppressHydrationWarning>{link.label}</a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="footer-bottom" suppressHydrationWarning>
          <p>Copyright © 2026 ProMeo APN. All Rights Reserved</p>
          <div className="socials" suppressHydrationWarning>
            {socials.map((social) => (
              <a
                className="social"
                href={social.href}
                target="_blank"
                rel="noopener"
                aria-label={social.label}
                key={social.label}
                suppressHydrationWarning
              >
                <svg>
                  <use href={`#${social.icon}`} />
                </svg>
              </a>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}
