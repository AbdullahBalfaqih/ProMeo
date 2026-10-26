/**
 * Small shared UI atoms.
 * They reproduce the exact markup/classes used by the static version,
 * so the design stays pixel-identical.
 */

export function Eyebrow({ label, center = true }) {
  return (
    <div className="eyebrow">
      <span className="line"></span>
      <svg className="spark">
        <use href="#i-spark" />
      </svg>
      <span>{label}</span>
      <span className="line"></span>
    </div>
  );
}

export function MiniEyebrow({ label, trailingLine = false, leadingLine = false }) {
  return (
    <div className="mini-eyebrow">
      {leadingLine ? <span className="line"></span> : null}
      <svg className="spark">
        <use href="#i-spark" />
      </svg>
      <span>{label}</span>
      {trailingLine ? <span className="line"></span> : null}
    </div>
  );
}

export function SparkButton({ href = '#pricing', label = 'Get Started', className = 'btn btn-primary', children }) {
  return (
    <a className={className} href={href}>
      <span className="orb">
        <svg>
          <use href="#i-spark" />
        </svg>
      </span>
      <span>{children || label}</span>
    </a>
  );
}

export function Stars({ count = 5 }) {
  return (
    <div className="stars">
      {Array.from({ length: count }).map((_, i) => (
        <svg key={i}>
          <use href="#i-star" />
        </svg>
      ))}
    </div>
  );
}

export function Icon({ id, className }) {
  return (
    <svg className={className}>
      <use href={`#${id}`} />
    </svg>
  );
}
