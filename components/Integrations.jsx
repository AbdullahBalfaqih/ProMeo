import { integrations } from '@/lib/data';
import { Eyebrow } from '@/components/ui/Atoms';

export default function Integrations() {
  return (
    <section className="integrations section">
      <div className="section-glow low" aria-hidden="true"></div>
      <div className="container">
        <div className="section-head" data-reveal="">
          <Eyebrow label="Integrations" />
          <h2>
            Works Seamlessly
            <br />
            with Top AI &amp; Web3 Clouds
          </h2>
        </div>

        <div className="apps" data-reveal="" style={{ '--d': '.08s' }}>
          {integrations.map((app) => (
            <span className={app.cls} key={app.alt}>
              <img src={app.src} alt={app.alt} />
            </span>
          ))}
        </div>
      </div>
    </section>
  );
}
