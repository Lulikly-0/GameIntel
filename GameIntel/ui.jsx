// Shared UI primitives

function CompanyAvatar({ company, size = 20 }) {
  const letters = (company.name_en || company.name_cn || "").slice(0, 2).toUpperCase();
  // deterministic color from id
  const palette = ["#6a8cff", "#ffb45a", "#4ec9a3", "#e86a7c", "#a788ff", "#5dc4e0", "#7c8394"];
  let h = 0;
  for (const ch of company.id) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const color = palette[h % palette.length];
  return (
    <span className="company-avatar" style={{ background: color, width: size, height: size, fontSize: size * 0.5 }}>
      {letters}
    </span>
  );
}

function CompanyLink({ id, compact = false }) {
  const c = window.GI_DATA.companies[id];
  if (!c) return <span>{id}</span>;
  return (
    <a className="company-link" href={`#/company/${id}`}>
      <CompanyAvatar company={c} />
      <span>{c.name_cn}</span>
      {!compact && <span className="mono dim" style={{ fontSize: 11, marginLeft: 2 }}>{c.ticker}</span>}
    </a>
  );
}

function TierBadge({ tier }) {
  return <span className={`tier-badge tier-${tier}`}>T{tier}</span>;
}

function Delta({ value, pp = false, big = false }) {
  if (value === null || value === undefined) return <span className="dim">—</span>;
  const cls = deltaClass(value);
  const txt = pp ? fmtPP(value) : fmtPct(value, { signed: true });
  return <span className={cls + (big ? " mono" : " mono")} style={{ fontWeight: 600 }}><Arrow n={value} /> {txt.replace(/^[+-]/, "")}</span>;
}

function PillDelta({ value, pp = false }) {
  if (value === null || value === undefined) return null;
  const cls = pillClass(value);
  const txt = pp ? fmtPP(value) : fmtPct(value, { signed: true });
  return <span className={`pill ${cls}`}><Arrow n={value} /> {txt.replace(/^[+-]/, "")}</span>;
}

function Kw({ type, children }) {
  return <span className={`kw kw-${type}`}>{children}</span>;
}

function Crumbs({ items }) {
  return (
    <div className="crumbs">
      {items.map((it, i) => (
        <span key={i}>
          {i > 0 && <span style={{ margin: "0 6px" }}>/</span>}
          {it.href ? <a href={it.href}>{it.label}</a> : <span>{it.label}</span>}
        </span>
      ))}
    </div>
  );
}

function SectionHead({ title, aside }) {
  return (
    <div className="section-head">
      <h2>{title}</h2>
      {aside && <div className="aside">{aside}</div>}
    </div>
  );
}

Object.assign(window, { CompanyAvatar, CompanyLink, TierBadge, Delta, PillDelta, Kw, Crumbs, SectionHead });
