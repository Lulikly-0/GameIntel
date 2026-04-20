// Summary page — detailed quarterly summary

// Metric catalog — covers finan_quarter 模版 的核心数值
const SUMMARY_METRICS = [
  { key: "revenue_game",    label: "游戏收入",   type: "level" },
  { key: "revenue_company", label: "公司总营收", type: "level" },
  { key: "gm",              label: "毛利率",     type: "ratio" },
  { key: "om",              label: "营业利润率", type: "ratio" },
  { key: "pcm",             label: "计算利润率", type: "ratio" },
  { key: "rd",              label: "研发费用率", type: "ratio" },
  { key: "sm",              label: "销售费用率", type: "ratio" },
  { key: "ga",              label: "管理费用率", type: "ratio" },
];

// Get prior-year quarter key: "2026Q1" -> "2025Q1"
function priorYearQ(qKey) {
  const m = /^(\d{4})(Q[1-4])$/.exec(qKey);
  if (!m) return null;
  return (parseInt(m[1]) - 1) + m[2];
}

// Compute a metric's YoY or QoQ value for a given quarter record within a company's quarters[].
// Returns: level → pct growth (0.12 = +12%). ratio → pp diff (0.012 = +1.2pp)
function computeDelta(quarters, qKey, metricKey, mode, type) {
  const qs = quarters;
  const idx = qs.findIndex((x) => x.q === qKey);
  if (idx < 0) return null;
  const cur = qs[idx][metricKey];
  if (cur === null || cur === undefined) return null;
  let prev = null;
  if (mode === "yoy") {
    const pyK = priorYearQ(qKey);
    const p = qs.find((x) => x.q === pyK);
    prev = p ? p[metricKey] : null;
  } else {
    // qoq: prior entry in array (data.js is chronologically ordered)
    if (idx === 0) return null;
    prev = qs[idx - 1][metricKey];
  }
  if (prev === null || prev === undefined) return null;
  if (type === "level") {
    if (prev === 0) return null;
    return (cur - prev) / Math.abs(prev);
  }
  // ratio: pp change
  return cur - prev;
}

function SummaryPage({ id }) {
  const D = window.GI_DATA;
  const s = D.summaries.find((x) => x.id === id) || D.summaries[0];
  const [tab, setTab] = React.useState("overview");
  const [metricKey, setMetricKey] = React.useState("revenue_game");
  const [mode, setMode] = React.useState("yoy");
  const metric = SUMMARY_METRICS.find((m) => m.key === metricKey);
  const isRatio = metric.type === "ratio";
  const modeLabel = mode === "yoy" ? "YoY" : "QoQ";
  const fmtDelta = (v) => isRatio ? fmtPP(v) : fmtPct(v, { signed: true });

  const periodQ = s.quarter_key || D.meta.latest_quarter;
  const allTrendQuarters = Array.from(new Set(
    s.companies_included.flatMap((cid) => (D.companies[cid]?.quarters || []).map((q) => q.q))
  ));
  const trendQuarters = allTrendQuarters.slice(-6);

  // HBar: selected metric's delta at 2026Q1 for all covered companies
  const hbarData = s.companies_included
    .map((cid) => {
      const c = D.companies[cid];
      if (!c) return null;
      const v = computeDelta(c.quarters, periodQ, metricKey, mode, metric.type);
      return v === null ? null : { label: c.name_cn, value: v, id: cid, tier: c.tier };
    })
    .filter(Boolean)
    .sort((a, b) => b.value - a.value);

  const hbarColorFn = (it) => {
    const v = it.value;
    if (isRatio) {
      if (v < -0.005) return "var(--c4)";
      if (v > 0.005) return "var(--c3)";
      return "var(--c1)";
    }
    if (v < -0.005) return "var(--c4)";
    if (v > 0.10) return "var(--c3)";
    return "var(--c1)";
  };

  // Trend line: Tier 5 companies trajectory on selected metric+mode
  const tier5 = Object.values(D.companies).filter((c) => c.tier === 5 && c.quarters.length >= 4);
  const trendData = trendQuarters.map((q) => {
    const r = { q };
    tier5.forEach((c) => {
      const v = computeDelta(c.quarters, q, metricKey, mode, metric.type);
      if (v !== null) r[c.id] = v;
    });
    return r;
  });
  const trendSeries = tier5.slice(0, 5).map((c, i) => ({ key: c.id, color: CHART_COLORS[i], label: c.name_cn }));

  const formatDeltaAxis = (v) => isRatio ? (v * 100).toFixed(1) + "pp" : (v * 100).toFixed(0) + "%";

  return (
    <div className="page">
      <Crumbs items={[{ label: "首页", href: "#/" }, { label: `${s.period} 季度总结` }]} />
      <div className="page-hero">
        <div>
          <div className="eyebrow">季度总结 · Quarterly Summary</div>
          <h1 className="page-title" style={{ marginTop: 6 }}>{s.headline}</h1>
          <div className="page-subtitle">覆盖 {s.companies_included.length} 家公司 · 数据截至 {s.period_end} · 发布于 {s.publish_date}</div>
        </div>
        <span className="period-chip">{s.period}</span>
      </div>

      <div className="tabs">
        {[
          ["overview", "概览"],
          ["tiers", "表现分层"],
          ["trends", "共性趋势"],
          ["actions", "值得关注动作"],
          ["insights", "洞察与启发"],
          ["oneliners", "一句话总结"],
        ].map(([k, l]) => (
          <div key={k} className={`tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>{l}</div>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div className="stat-row" style={{ marginBottom: 18 }}>
            <div className="stat">
              <div className="lbl">覆盖公司</div>
              <div className="val">{s.companies_included.length}</div>
              <div className="sub dim">共 5 个 Tier</div>
            </div>
            <div className="stat">
              <div className="lbl">超预期</div>
              <div className="val" style={{ color: "var(--up)" }}>{s.tiers.exceed.length}</div>
              <div className="sub dim">含 {s.tiers.exceed.filter(x => x.tier === 5).length} 家 Tier 5</div>
            </div>
            <div className="stat">
              <div className="lbl">符合预期</div>
              <div className="val" style={{ color: "var(--c1)" }}>{s.tiers.inline.length}</div>
              <div className="sub dim">含 {s.tiers.inline.filter(x => x.tier === 5).length} 家 Tier 5</div>
            </div>
            <div className="stat">
              <div className="lbl">低于预期</div>
              <div className="val" style={{ color: "var(--down)" }}>{s.tiers.miss.length}</div>
              <div className="sub dim">含 {s.tiers.miss.filter(x => x.tier === 5).length} 家 Tier 5</div>
            </div>
            <div className="stat">
              <div className="lbl">共性趋势</div>
              <div className="val">{s.trends.length}</div>
              <div className="sub dim">行业结构性信号</div>
            </div>
          </div>

          <div className="metric-switcher">
            <div className="ms-group">
              <span className="ms-label">指标</span>
              {SUMMARY_METRICS.map((m) => (
                <button
                  key={m.key}
                  className={`ms-chip ${metricKey === m.key ? "active" : ""}`}
                  onClick={() => setMetricKey(m.key)}
                >{m.label}</button>
              ))}
            </div>
            <div className="ms-group">
              <span className="ms-label">维度</span>
              <button className={`ms-chip ms-mode ${mode === "yoy" ? "active" : ""}`} onClick={() => setMode("yoy")}>YoY</button>
              <button className={`ms-chip ms-mode ${mode === "qoq" ? "active" : ""}`} onClick={() => setMode("qoq")}>QoQ</button>
            </div>
          </div>

          <div className="grid grid-2">
            <div className="card card-pad">
              <div className="card-title">
                <h3>{metric.label} {modeLabel} · 所有覆盖公司</h3>
                <span className="meta">{periodQ}{isRatio ? " · pp 变化" : ""}</span>
              </div>
              <HBar items={hbarData} valueKey="value" colorFn={hbarColorFn} fmt={isRatio ? fmtPP : fmtPct} />
              {hbarData.length === 0 && <div className="dim" style={{ padding: "20px 0", fontSize: 13 }}>暂无可比数据（需要更长历史）</div>}
            </div>

            <div className="card card-pad">
              <div className="card-title">
                <h3>Tier 5 {metric.label} {modeLabel} 轨迹</h3>
                <span className="meta">近 4 季</span>
              </div>
              <LineChart
                data={trendData}
                xKey="q"
                series={trendSeries}
                formatY={formatDeltaAxis}
                formatTip={(v) => v === null || v === undefined ? "—" : (isRatio ? fmtPP(v) : fmtPct(v, { signed: true, decimals: 1 }))}
                height={240}
              />
            </div>
          </div>

          <div className="section-head"><h2>宏观背景</h2><span className="aside">季度外部变量</span></div>
          <div className="card card-pad" style={{ fontSize: 13.5, lineHeight: 1.7 }}>
            {s.macro}
          </div>
        </>
      )}

      {tab === "tiers" && (
        <>
          <div className="tier-section exceed">
            <h4><span style={{ color: "var(--up)" }}>🔺</span> 超预期 · {s.tiers.exceed.length} 家</h4>
            <table className="tbl">
              <thead><tr><th>公司</th><th>Tier</th><th className="num">游戏收入 YoY</th><th>核心驱动</th></tr></thead>
              <tbody>
                {s.tiers.exceed.map((x, i) => (
                  <tr key={i} className="clickable" onClick={() => window.location.hash = `#/company/${x.company}`}>
                    <td><CompanyLink id={x.company} /></td>
                    <td><TierBadge tier={x.tier} /></td>
                    <td className="num"><span className="delta-up">+{fmtPct(x.yoy)}</span></td>
                    <td>{x.driver}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="tier-section inline">
            <h4><span style={{ color: "var(--c1)" }}>🟡</span> 符合预期 · {s.tiers.inline.length} 家</h4>
            <table className="tbl">
              <thead><tr><th>公司</th><th>Tier</th><th className="num">游戏收入 YoY</th><th>简评</th></tr></thead>
              <tbody>
                {s.tiers.inline.map((x, i) => (
                  <tr key={i} className="clickable" onClick={() => window.location.hash = `#/company/${x.company}`}>
                    <td><CompanyLink id={x.company} /></td>
                    <td><TierBadge tier={x.tier} /></td>
                    <td className="num"><Delta value={x.yoy} /></td>
                    <td>{x.note}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="tier-section miss">
            <h4><span style={{ color: "var(--down)" }}>🔻</span> 低于预期 · {s.tiers.miss.length} 家</h4>
            <table className="tbl">
              <thead><tr><th>公司</th><th>Tier</th><th className="num">游戏收入 YoY</th><th>主要拖累</th></tr></thead>
              <tbody>
                {s.tiers.miss.map((x, i) => (
                  <tr key={i} className="clickable" onClick={() => window.location.hash = `#/company/${x.company}`}>
                    <td><CompanyLink id={x.company} /></td>
                    <td><TierBadge tier={x.tier} /></td>
                    <td className="num"><span className="delta-down">{fmtPct(x.yoy, { signed: true })}</span></td>
                    <td>{x.drag}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === "trends" && (
        <div className="grid grid-2">
          {s.trends.map((t, i) => (
            <div key={i} className="card card-pad">
              <div className="eyebrow" style={{ color: CHART_COLORS[i] }}>趋势 0{i + 1}</div>
              <h3 style={{ fontSize: 17, margin: "8px 0 14px", lineHeight: 1.3 }}>{t.title}</h3>
              <div style={{ marginBottom: 12 }}>
                <div className="eyebrow" style={{ color: "var(--ink-2)", marginBottom: 4 }}>现象</div>
                <div style={{ fontSize: 13.5, lineHeight: 1.6 }}>{t.phenomenon}</div>
              </div>
              <div>
                <div className="eyebrow" style={{ color: "var(--ink-2)", marginBottom: 4 }}>可能原因</div>
                <div style={{ fontSize: 13.5, lineHeight: 1.6 }} className="muted">{t.reason}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "actions" && (
        <div className="card card-pad">
          <div className="card-title"><h3>值得关注的动作</h3><span className="meta">跨公司战略动作</span></div>
          <table className="tbl">
            <thead><tr><th>公司</th><th>动作类型</th><th>具体内容</th><th>潜在影响</th></tr></thead>
            <tbody>
              {s.actions.map((a, i) => (
                <tr key={i}>
                  <td><CompanyLink id={a.company} /></td>
                  <td><span className="pill">{a.type}</span></td>
                  <td>{a.content}</td>
                  <td className="muted">{a.impact}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "insights" && (
        <div className="grid grid-2">
          {s.insights.map((it, i) => (
            <div key={i} className="card card-pad">
              <div className={`insight alt-${i}`}>
                <div className="title">观察 {i + 1}｜{it.title}</div>
                <div className="row"><div className="k">现象</div><div className="v">{it.phenomenon}</div></div>
                <div className="row"><div className="k">背后</div><div className="v muted">{it.background}</div></div>
                <div className="row"><div className="k">值得思考</div><div className="v" style={{ fontStyle: "italic" }}>{it.question}</div></div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === "oneliners" && (
        <div className="card card-pad">
          <div className="card-title"><h3>各公司一句话总结</h3><span className="meta">点击公司名进入主页</span></div>
          <table className="tbl">
            <thead><tr><th>公司</th><th>Tier</th><th>一句话总结</th></tr></thead>
            <tbody>
              {s.oneliners.map((x, i) => (
                <tr key={i} className="clickable" onClick={() => window.location.hash = `#/company/${x.company}`}>
                  <td><CompanyLink id={x.company} /></td>
                  <td><TierBadge tier={x.tier} /></td>
                  <td>{x.text}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

window.SummaryPage = SummaryPage;
