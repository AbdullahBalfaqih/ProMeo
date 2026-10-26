import { processSteps } from '@/lib/data';
import { Eyebrow } from '@/components/ui/Atoms';

export default function Process() {
  return (
    <section className="process section" id="process">
      <div className="container-wide">
        <div className="section-head" data-reveal="">
          <Eyebrow label="Process" />
          <h2>Autonomous Procurement In 4 Simple Steps</h2>
        </div>

        <div className="process-stage" data-reveal="" style={{ '--d': '.08s' }}>
          <div className="p-core" aria-hidden="true">
            <span className="p-ring ring1"></span>
            <span className="p-ring ring2"></span>
            <span className="p-ring ring3"></span>
            <span className="p-num n01">01</span>
            <span className="p-num n02">02</span>
            <span className="p-num n03">03</span>
            <span className="p-num n04">04</span>
            <span className="p-emblem">
              <img src="/assets/logo.png" alt="ProMeo" />
            </span>
          </div>

          {processSteps.map((step) => (
            <article className={`step ${step.cls}`} key={step.title}>
              <h3>{step.title}</h3>
              <p>{step.text}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
