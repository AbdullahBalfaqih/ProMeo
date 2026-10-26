import { testimonials, testimonialsColumns } from '@/lib/data';
import { Eyebrow, Stars } from '@/components/ui/Atoms';

export default function Testimonials() {
  return (
    <section className="testimonials section" id="testimonials">
      <div className="container-wide">
        <div className="section-head" data-reveal="">
          <Eyebrow label="Testimonials" />
          <h2>Trusted by Autonomous AI &amp; Enterprise Builders</h2>
        </div>

        <div className="t-grid">
          {testimonialsColumns.map((column) => (
            <div className={column.cls} key={column.key}>
              {testimonials
                .filter((item) => item.col === column.key)
                .map((item) => (
                  <article
                    className={`t-card${item.variant ? ` ${item.variant}` : ''}`}
                    data-reveal=""
                    style={item.delay ? { '--d': item.delay } : undefined}
                    key={item.name}
                  >
                    <Stars />
                    <p>{item.quote}</p>
                    <div className="t-foot">
                      <img src={item.avatar} alt="" />
                      <div>
                        <b>{item.name}</b>
                        <span>{item.company}</span>
                      </div>
                    </div>
                  </article>
                ))}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
