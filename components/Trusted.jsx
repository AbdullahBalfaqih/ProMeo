import { partnerLogos } from '@/lib/data';

export default function Trusted() {
  return (
    <section className="trusted" id="about">
      <div className="container">
        <h2 className="trusted-title" data-reveal="">
          Powering Autonomous AI Procurement Across Web3 &amp; Enterprise
        </h2>
        <div className="logo-grid" data-reveal="" style={{ '--d': '.08s' }}>
          {partnerLogos.map((logo) => (
            <div className="logo-cell" key={logo.alt}>
              <img src={logo.src} alt={logo.alt} />
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
