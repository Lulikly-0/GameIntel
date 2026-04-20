// Charts — minimal SVG with hover tooltips
const CHART_COLORS = ["#6a8cff", "#ffb45a", "#4ec9a3", "#e86a7c", "#a788ff", "#5dc4e0"];

function fmtNum(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return Math.abs(n) >= 1000 ? (n / 1000).toFixed(1) + "B" : n.toFixed(0);
}
function fmtMoney(n) {
  if (n === null || n === undefined) return "—";
  if (Math.abs(n) >= 1000) return (n / 1000).toFixed(2) + "B";
  return n.toLocaleString(undefined, { maximumFractionDigits: 0 });
}
function fmtPct(n, opts = {}) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  const { decimals = 1, signed = false } = opts;
  const v = (n * 100).toFixed(decimals);
  const sign = signed && n > 0 ? "+" : "";
  return sign + v + "%";
}
function fmtPP(n, decimals = 1) {
  if (n === null || n === undefined) return "—";
  const sign = n > 0 ? "+" : "";
  return sign + (n * 100).toFixed(decimals) + "pp";
}
function deltaClass(n) { return n > 0.001 ? "delta-up" : n < -0.001 ? "delta-down" : "delta-flat"; }
function pillClass(n) { return n > 0.001 ? "pill-up" : n < -0.001 ? "pill-down" : ""; }

function Arrow({ n }) {
  if (n === null || n === undefined) return null;
  return <span>{n > 0 ? "▲" : n < 0 ? "▼" : "—"}</span>;
}

// Shared tooltip component
function ChartTooltip({ tip }) {
  if (!tip) return null;
  return (
    <div style={{
      position: "absolute", left: tip.x, top: tip.y,
      transform: "translate(-50%, -100%) translateY(-10px)",
      background: "rgba(30, 34, 48, 0.96)", color: "#fff",
      padding: "8px 12px", borderRadius: 8, fontSize: 12,
      pointerEvents: "none", zIndex: 10, minWidth: 140,
      boxShadow: "0 6px 20px rgba(30, 34, 48, 0.18)",
      fontFamily: "var(--font-sans)",
      whiteSpace: "nowrap",
    }}>
      <div style={{ fontWeight: 700, fontSize: 12, marginBottom: 4, fontFamily: "var(--font-mono)", color: "#e0e7ff" }}>{tip.label}</div>
      {tip.rows.map((r, i) => (
        <div key={i} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 14, padding: "2px 0" }}>
          <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: r.color, display: "inline-block" }}></span>
            <span style={{ color: "#c5cbd9" }}>{r.name}</span>
          </span>
          <span style={{ fontFamily: "var(--font-mono)", fontWeight: 600 }}>{r.value}</span>
        </div>
      ))}
    </div>
  );
}

// LineChart with hover
function LineChart({ data, xKey, series, height = 220, formatY = (v) => v, formatTip, yTicks = 4, padding = { t: 18, r: 18, b: 30, l: 44 } }) {
  const w = 520;
  const h = height;
  const pad = padding;
  const [hover, setHover] = React.useState(null);
  const wrapRef = React.useRef(null);

  const allVals = series.flatMap((s) => data.map((d) => d[s.key])).filter((v) => v !== null && v !== undefined);
  const maxV = allVals.length ? Math.max(...allVals) : 1;
  const minV = allVals.length ? Math.min(...allVals, 0) : 0;
  const span = Math.max(maxV - minV, Math.abs(maxV) * 0.2, 0.01);
  const yMax = maxV + span * 0.12;
  const yMin = minV < 0 ? minV - span * 0.12 : 0;
  const xs = data.length;
  const xStep = (w - pad.l - pad.r) / Math.max(xs - 1, 1);
  const x = (i) => pad.l + i * xStep;
  const y = (v) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * (h - pad.t - pad.b);
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / yTicks);

  const onMove = (e) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const relX = (mx / rect.width) * w;
    const i = Math.round((relX - pad.l) / xStep);
    if (i >= 0 && i < xs) {
      const d = data[i];
      setHover({
        i,
        px: (x(i) / w) * rect.width,
        py: my,
        label: d[xKey],
        rows: series.map((s) => ({
          color: s.color,
          name: s.label,
          value: formatTip ? formatTip(d[s.key], s.key) : formatY(d[s.key]),
        })),
      });
    }
  };

  return (
    <div className="chart-area" style={{ position: "relative" }} ref={wrapRef}
         onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" preserveAspectRatio="none" style={{ display: "block" }}>
        <defs>
          {series.map((s, i) => (
            <linearGradient key={i} id={`g-${s.key}`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor={s.color} stopOpacity="0.2" />
              <stop offset="100%" stopColor={s.color} stopOpacity="0" />
            </linearGradient>
          ))}
        </defs>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="#efece3" strokeWidth="1" />
            <text x={pad.l - 8} y={y(t)} fontSize="10" fill="#9ba0ad" textAnchor="end" dominantBaseline="middle" fontFamily="var(--font-mono)">{formatY(t)}</text>
          </g>
        ))}
        {data.map((d, i) => (
          <text key={i} x={x(i)} y={h - pad.b + 16} fontSize="10.5" fill="#6b7180" textAnchor="middle" fontFamily="var(--font-mono)">{d[xKey]}</text>
        ))}
        {hover && (
          <line x1={x(hover.i)} x2={x(hover.i)} y1={pad.t} y2={h - pad.b} stroke="#9ba0ad" strokeWidth="1" strokeDasharray="3 3" />
        )}
        {series.map((s, si) => {
          const pts = data.map((d, i) => (d[s.key] === null || d[s.key] === undefined ? null : [x(i), y(d[s.key])])).filter(Boolean);
          if (!pts.length) return null;
          const linePath = pts.map((p, i) => (i === 0 ? "M" : "L") + p[0] + "," + p[1]).join(" ");
          const areaPath = linePath + ` L${pts[pts.length - 1][0]},${h - pad.b} L${pts[0][0]},${h - pad.b} Z`;
          return (
            <g key={si}>
              <path d={areaPath} fill={`url(#g-${s.key})`} />
              <path d={linePath} stroke={s.color} strokeWidth="2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
              {pts.map((p, i) => (
                <circle key={i} cx={p[0]} cy={p[1]}
                  r={hover && hover.i === i ? 5 : 3.2}
                  fill="#fff" stroke={s.color}
                  strokeWidth={hover && hover.i === i ? 2.4 : 1.8} />
              ))}
            </g>
          );
        })}
      </svg>
      <div className="chart-legend">
        {series.map((s, i) => (
          <span key={i}><span className="dot" style={{ background: s.color }}></span>{s.label}</span>
        ))}
      </div>
      {hover && <ChartTooltip tip={{ x: hover.px, y: hover.py, label: hover.label, rows: hover.rows }} />}
    </div>
  );
}

// BarChart with hover
function BarChart({ data, xKey, series, height = 220, formatY = (v) => v, formatTip, yTicks = 4, padding = { t: 18, r: 18, b: 30, l: 44 } }) {
  const w = 520;
  const h = height;
  const pad = padding;
  const [hover, setHover] = React.useState(null);
  const wrapRef = React.useRef(null);

  const allVals = series.flatMap((s) => data.map((d) => d[s.key])).filter((v) => v !== null && v !== undefined);
  const maxV = Math.max(...allVals, 0);
  const minV = Math.min(...allVals, 0);
  const yMax = maxV + (maxV - minV) * 0.12;
  const yMin = minV < 0 ? minV * 1.2 : 0;
  const xs = data.length;
  const groupW = (w - pad.l - pad.r) / xs;
  const barW = (groupW * 0.62) / series.length;
  const y = (v) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * (h - pad.t - pad.b);
  const y0 = y(0);
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => yMin + ((yMax - yMin) * i) / yTicks);

  const onMove = (e) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const relX = (mx / rect.width) * w;
    const i = Math.floor((relX - pad.l) / groupW);
    if (i >= 0 && i < xs) {
      const d = data[i];
      const cx = pad.l + groupW * i + groupW / 2;
      setHover({
        i,
        px: (cx / w) * rect.width,
        py: my,
        label: d[xKey],
        rows: series.map((s) => ({
          color: s.color,
          name: s.label,
          value: formatTip ? formatTip(d[s.key], s.key) : formatY(d[s.key]),
        })),
      });
    } else { setHover(null); }
  };

  return (
    <div className="chart-area" style={{ position: "relative" }} ref={wrapRef}
         onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" preserveAspectRatio="none" style={{ display: "block" }}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke={t === 0 ? "#d7d1bf" : "#efece3"} strokeWidth="1" />
            <text x={pad.l - 8} y={y(t)} fontSize="10" fill="#9ba0ad" textAnchor="end" dominantBaseline="middle" fontFamily="var(--font-mono)">{formatY(t)}</text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = pad.l + groupW * i + groupW / 2;
          const isHov = hover && hover.i === i;
          return (
            <g key={i}>
              {isHov && (
                <rect x={cx - groupW / 2 + 1} y={pad.t} width={groupW - 2} height={h - pad.t - pad.b}
                      fill="#000" opacity="0.03" rx="4" />
              )}
              {series.map((s, si) => {
                const v = d[s.key];
                if (v === null || v === undefined) return null;
                const bx = cx - (barW * series.length) / 2 + si * barW + 1;
                const by = v >= 0 ? y(v) : y0;
                const bh = Math.abs(y(v) - y0);
                return (
                  <rect key={si} x={bx} y={by} width={barW - 2} height={bh} rx="2"
                        fill={s.color} opacity={v < 0 ? 0.85 : 1} />
                );
              })}
              <text x={cx} y={h - pad.b + 16} fontSize="10.5" fill="#6b7180" textAnchor="middle" fontFamily="var(--font-mono)">{d[xKey]}</text>
            </g>
          );
        })}
      </svg>
      <div className="chart-legend">
        {series.map((s, i) => (
          <span key={i}><span className="dot" style={{ background: s.color }}></span>{s.label}</span>
        ))}
      </div>
      {hover && <ChartTooltip tip={{ x: hover.px, y: hover.py, label: hover.label, rows: hover.rows }} />}
    </div>
  );
}

// Stacked company revenue bars with share connectors.
// Expected data shape:
// { q, total, segments: [{ name, value, color }] }
function StackedRevenueChart({ data, height = 240, formatMoneyValue = fmtMoney, currencyLabel }) {
  const currency = currencyLabel || window.GI_DATA?.meta?.currency || "";
  const w = 520;
  const h = height;
  const pad = { t: 28, r: 18, b: 34, l: 46 };
  const [hover, setHover] = React.useState(null);
  const wrapRef = React.useRef(null);
  const maxV = Math.max(...data.map((d) => d.total || 0), 0);
  const yMax = maxV * 1.18;
  const groupW = (w - pad.l - pad.r) / Math.max(data.length, 1);
  const barW = groupW * 0.52;
  const y = (v) => pad.t + (1 - v / yMax) * (h - pad.t - pad.b);
  const ticks = Array.from({ length: 4 }, (_, i) => (yMax * i) / 3);
  const segmentNames = Array.from(new Set(data.flatMap((d) => d.segments.map((s) => s.name))));

  const segValue = (d, name) => {
    const found = d.segments.find((s) => s.name === name);
    return found ? found.value : 0;
  };
  const segColor = (name, index) => {
    const found = data.flatMap((d) => d.segments).find((s) => s.name === name);
    return found?.color || CHART_COLORS[index % CHART_COLORS.length];
  };

  const onMove = (e) => {
    const el = wrapRef.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;
    const relX = (mx / rect.width) * w;
    const i = Math.floor((relX - pad.l) / groupW);
    if (i >= 0 && i < data.length) {
      const d = data[i];
      const cx = pad.l + groupW * i + groupW / 2;
      setHover({
        i,
        px: (cx / w) * rect.width,
        py: my,
        label: d.q,
        rows: [
          { color: "#1e2230", name: "Total Revenue", value: `${currency} ${formatMoneyValue(d.total)}M`.trim() },
          ...d.segments.map((s) => ({
            color: s.color,
            name: s.name,
            value: `${currency} ${formatMoneyValue(s.value)}M`.trim() + " · " + fmtPct(d.total ? s.value / d.total : null),
          })),
        ],
      });
    } else {
      setHover(null);
    }
  };

  return (
    <div className="chart-area" style={{ position: "relative" }} ref={wrapRef}
         onMouseMove={onMove} onMouseLeave={() => setHover(null)}>
      <svg viewBox={`0 0 ${w} ${h}`} width="100%" preserveAspectRatio="none" style={{ display: "block" }}>
        {ticks.map((t, i) => (
          <g key={i}>
            <line x1={pad.l} x2={w - pad.r} y1={y(t)} y2={y(t)} stroke="#efece3" strokeWidth="1" />
            <text x={pad.l - 8} y={y(t)} fontSize="10" fill="#9ba0ad" textAnchor="end" dominantBaseline="middle" fontFamily="var(--font-mono)">
              {formatMoneyValue(t)}
            </text>
          </g>
        ))}

        {data.map((d, i) => {
          const cx = pad.l + groupW * i + groupW / 2;
          let acc = 0;
          const isHov = hover && hover.i === i;
          return (
            <g key={i}>
              {isHov && (
                <rect x={cx - groupW / 2 + 1} y={pad.t} width={groupW - 2} height={h - pad.t - pad.b}
                      fill="#000" opacity="0.03" rx="4" />
              )}
              {d.segments.map((s, si) => {
                const yTop = y(acc + s.value);
                const yBottom = y(acc);
                const rect = (
                  <rect key={si} x={cx - barW / 2} y={yTop} width={barW} height={Math.max(0, yBottom - yTop)}
                        fill={s.color} rx={si === d.segments.length - 1 ? 4 : 0} />
                );
                acc += s.value;
                return rect;
              })}
              <text x={cx} y={Math.max(12, y(d.total) - 8)} fontSize="10.5" fill="#1e2230" textAnchor="middle" fontFamily="var(--font-mono)" fontWeight="700">
                {formatMoneyValue(d.total)}
              </text>
              <text x={cx} y={h - pad.b + 17} fontSize="10.5" fill="#6b7180" textAnchor="middle" fontFamily="var(--font-mono)">{d.q}</text>
            </g>
          );
        })}

        {segmentNames.slice(0, -1).map((name, si) => {
          const points = data.map((d, i) => {
            const cx = pad.l + groupW * i + groupW / 2;
            const cumulative = segmentNames.slice(0, si + 1).reduce((sum, n) => sum + segValue(d, n), 0);
            return [cx, y(cumulative)];
          });
          const path = points.map((p, i) => (i === 0 ? "M" : "L") + p[0] + "," + p[1]).join(" ");
          return (
            <path key={name} d={path} stroke={segColor(name, si)} strokeWidth="1.7" strokeDasharray="4 4" fill="none" opacity="0.95" />
          );
        })}
      </svg>
      <div className="chart-legend">
        {segmentNames.map((name, i) => (
          <span key={name}><span className="dot" style={{ background: segColor(name, i) }}></span>{name}</span>
        ))}
        <span><span className="dot" style={{ background: "#888" }}></span>share boundary</span>
      </div>
      {hover && <ChartTooltip tip={{ x: hover.px, y: hover.py, label: hover.label, rows: hover.rows }} />}
    </div>
  );
}

// Horizontal bar for tier comparisons with tooltip
function HBar({ items, valueKey = "yoy", labelKey = "label", colorFn, fmt = fmtPct, height = 22, tipExtras }) {
  const vals = items.map((x) => x[valueKey]);
  const max = Math.max(...vals.map(Math.abs), 0.05);
  return (
    <div>
      {items.map((item, i) => {
        const v = item[valueKey];
        const pct = Math.abs(v) / max * 100;
        const isNeg = v < 0;
        const color = colorFn ? colorFn(item) : (isNeg ? "var(--c4)" : "var(--c3)");
        const title = tipExtras
          ? `${item[labelKey]}  ${fmt(v, { signed: true })}\n${tipExtras(item)}`
          : `${item[labelKey]}: ${fmt(v, { signed: true })}`;
        return (
          <div key={i} title={title}
               style={{ display: "grid", gridTemplateColumns: "160px 1fr 70px", gap: 10, alignItems: "center", padding: "5px 0", cursor: "default" }}>
            <div style={{ fontSize: 13, fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{item[labelKey]}</div>
            <div style={{ position: "relative", height, background: "#f5f3ee", borderRadius: 6, overflow: "hidden" }}>
              <div style={{
                position: "absolute", left: isNeg ? `calc(50% - ${pct / 2}%)` : "50%",
                top: 0, bottom: 0, width: `${pct / 2}%`,
                background: color, borderRadius: 4,
                transition: "width 0.3s",
              }} />
              <div style={{ position: "absolute", left: "50%", top: 0, bottom: 0, width: 1, background: "#d7d1bf" }} />
            </div>
            <div className="mono" style={{ textAlign: "right", fontSize: 12.5, fontWeight: 600, color: isNeg ? "var(--down)" : "var(--up)" }}>{fmt(v, { signed: true })}</div>
          </div>
        );
      })}
    </div>
  );
}

function Donut({ segments, size = 120, stroke = 22, centerTop, centerBottom }) {
  const total = segments.reduce((a, b) => a + b.value, 0);
  const r = size / 2 - stroke / 2;
  const c = size / 2;
  const cir = 2 * Math.PI * r;
  let acc = 0;
  return (
    <div style={{ display: "flex", gap: 16, alignItems: "center" }}>
      <svg width={size} height={size}>
        <circle cx={c} cy={c} r={r} fill="none" stroke="#efece3" strokeWidth={stroke} />
        {segments.map((s, i) => {
          const len = (s.value / total) * cir;
          const el = (
            <circle key={i}
              cx={c} cy={c} r={r} fill="none"
              stroke={s.color} strokeWidth={stroke}
              strokeDasharray={`${len} ${cir - len}`}
              strokeDashoffset={-acc}
              transform={`rotate(-90 ${c} ${c})`}
            />
          );
          acc += len;
          return el;
        })}
        {centerTop && <text x={c} y={c - 4} textAnchor="middle" fontSize="14" fontWeight="700" fill="#1e2230" fontFamily="var(--font-mono)">{centerTop}</text>}
        {centerBottom && <text x={c} y={c + 12} textAnchor="middle" fontSize="10" fill="#6b7180" fontFamily="var(--font-mono)">{centerBottom}</text>}
      </svg>
    </div>
  );
}

Object.assign(window, {
  LineChart, BarChart, StackedRevenueChart, HBar, Donut, CHART_COLORS, ChartTooltip,
  fmtNum, fmtMoney, fmtPct, fmtPP,
  deltaClass, pillClass, Arrow,
});
