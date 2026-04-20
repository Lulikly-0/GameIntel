// Home page
function HomePage() {
  const D = window.GI_DATA;
  const latestSummary = D.summaries[0];
  const latestBriefings = D.briefings;
  const latestQuarter = D.meta.latest_quarter || latestSummary.quarter_key;
  const currency = D.meta.currency || "CNY";
  const money = (n) => `${currency} ${fmtMoney(n)}M`;

  const currentQuarterRecords = [];
  for (const id in D.companies) {
    const c = D.companies[id];
    const q = c.quarters.find((x) => x.q === latestQuarter) || c.quarters[c.quarters.length - 1];
    if (q) currentQuarterRecords.push({ id, c, q });
  }
  currentQuarterRecords.sort((a, b) => (b.q.yoy || 0) - (a.q.yoy || 0));

  const totalRev = currentQuarterRecords.reduce((s, x) => s + (x.q.revenue_game || 0), 0);
  const avgYoY = currentQuarterRecords.length ? currentQuarterRecords.reduce((s, x) => s + (x.q.yoy || 0), 0) / currentQuarterRecords.length : null;
  const exceedCount = latestSummary.tiers.exceed.length;
  const inlineCount = latestSummary.tiers.inline.length;
  const missCount = latestSummary.tiers.miss.length;
  const topCompany = currentQuarterRecords[0];
  const summaryTrend = latestSummary.trends?.[0];

  return (
    <div className="page">
      {/* Top: latest summary + market snapshot */}
      <div className="grid grid-hero" style={{ marginBottom: 24 }}>
        <a href={`#/summary/${latestSummary.id}`} style={{ display: "block" }}>
          <div className="summary-hero" style={{ minHeight: "100%" }}>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              <span className="eyebrow" style={{ color: "#3a5bd9" }}>季度总结 · Quarterly Summary</span>
              <span className="mono dim" style={{ fontSize: 11 }}>{latestSummary.period_end} 发布于 {latestSummary.publish_date}</span>
            </div>
            <h2>{latestSummary.headline}</h2>
            <div className="sub">覆盖 {latestSummary.companies_included.length} 家重点公司 · {latestSummary.period} · 数据截至 {latestSummary.period_end}</div>

            <div className="metric-row" style={{ margin: "12px 0 16px" }}>
              <div className="metric">
                <div className="label">超预期</div>
                <div className="value" style={{ color: "var(--up)" }}>{exceedCount}</div>
                <div className="delta">Exceed</div>
              </div>
              <div className="metric">
                <div className="label">符合预期</div>
                <div className="value" style={{ color: "var(--c1)" }}>{inlineCount}</div>
                <div className="delta">Inline</div>
              </div>
              <div className="metric">
                <div className="label">低于预期</div>
                <div className="value" style={{ color: "var(--down)" }}>{missCount}</div>
                <div className="delta">Miss</div>
              </div>
              <div className="metric">
                <div className="label">增长领先</div>
                <div className="value" style={{ fontSize: 18 }}>{topCompany?.c.name_cn || "—"}</div>
                <div className="delta">{topCompany ? fmtPct(topCompany.q.yoy, { signed: true }) : "—"}</div>
              </div>
            </div>

            {summaryTrend && (
              <div className="muted" style={{ fontSize: 13, lineHeight: 1.6, marginBottom: 14 }}>
                <b style={{ color: "var(--ink-2)" }}>本季主线：</b>{summaryTrend.title}
              </div>
            )}

            <div className="tier-row">
              <span className="tier-group"><span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--up)", display: "inline-block" }}></span>超预期 <span className="count">{exceedCount}</span></span>
              <span className="tier-group"><span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--c1)", display: "inline-block" }}></span>符合 <span className="count">{inlineCount}</span></span>
              <span className="tier-group"><span style={{ width: 10, height: 10, borderRadius: 3, background: "var(--down)", display: "inline-block" }}></span>低于 <span className="count">{missCount}</span></span>
              <span style={{ marginLeft: "auto", color: "var(--c1)", fontWeight: 600, fontSize: 13 }}>查看完整总结 →</span>
            </div>
          </div>
        </a>

        <div className="card card-pad" style={{ display: "flex", flexDirection: "column" }}>
          <div className="card-title">
            <h3>本季度市场切片</h3>
            <span className="meta">{latestSummary.period}</span>
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
            <div>
              <div className="eyebrow">覆盖公司游戏收入</div>
              <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4 }}>{money(totalRev)}</div>
              <div className="mono dim" style={{ fontSize: 11, marginTop: 2 }}>Revenue_Game Sum</div>
            </div>
            <div>
              <div className="eyebrow">行业 YoY 均值</div>
              <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: avgYoY > 0 ? "var(--up)" : "var(--down)" }}>{avgYoY === null ? "—" : fmtPct(avgYoY, { signed: true })}</div>
              <div className="mono dim" style={{ fontSize: 11, marginTop: 2 }}>Simple Avg</div>
            </div>
          </div>
          <div style={{ height: 12 }} />
          <HBar
            items={currentQuarterRecords.slice(0, 5).map(x => ({ label: x.c.name_cn, yoy: x.q.yoy, id: x.id }))}
            valueKey="yoy"
            colorFn={(it) => it.yoy < 0 ? "var(--c4)" : "var(--c1)"}
          />
          <div style={{ marginTop: "auto", paddingTop: 10, fontSize: 11, color: "var(--ink-4)" }} className="mono">
            Top by YoY · 当前真实数据版仅展示已接入公司
          </div>
        </div>
      </div>

      {/* Briefings */}
      <div className="section-head">
        <h2>最新 Briefing</h2>
        <span className="aside">company_briefing 模板 · {latestBriefings.length} 条</span>
      </div>
      <div className="grid grid-3">
        {latestBriefings.map((b) => {
          const c = D.companies[b.company];
          return (
            <a key={b.id} href={`#/briefing/${b.id}`}>
              <div className="briefing-card">
                <div className="head">
                  <CompanyAvatar company={c} size={26} />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 14 }}>{c.name_cn}</div>
                    <div className="mono dim" style={{ fontSize: 11 }}>{c.ticker} · {b.quarter}</div>
                  </div>
                  <TierBadge tier={c.tier} />
                </div>
                <div className="tagline">{b.tagline}</div>
                <div className="kw-row" style={{ marginBottom: 12 }}>
                  {b.keywords.drivers.slice(0, 2).map((k, i) => <Kw key={i} type="driver">▲ {k}</Kw>)}
                  {b.keywords.drags.slice(0, 1).map((k, i) => <Kw key={i} type="drag">▼ {k}</Kw>)}
                </div>
                <div className="foot">
                  <span>{b.publish_date}</span>
                  <a>阅读 Briefing →</a>
                </div>
              </div>
            </a>
          );
        })}
      </div>

      {/* Quick company nav */}
      <div className="grid" style={{ marginTop: 28 }}>
        <div className="card card-pad">
          <div className="card-title">
            <h3>覆盖公司</h3>
            <span className="meta">{Object.keys(D.companies).length} 家 · 点击进入公司主页</span>
          </div>
          <div className="comp-grid">
            {Object.values(D.companies).map((c) => (
              <a key={c.id} href={`#/company/${c.id}`}>
                <div className="comp-card">
                  <CompanyAvatar company={c} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="name" style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{c.name_cn}</div>
                    <div className="meta">{c.ticker === "NA" ? "未上市" : c.ticker}</div>
                  </div>
                  <TierBadge tier={c.tier} />
                </div>
              </a>
            ))}
          </div>
        </div>
      </div>

      <div className="foot-meta">
        <span>GameIntel · 游戏行业竞品研究工作素材库 · {D.meta.publish_date}</span>
        <span>数据源：官方 IR / SEC EDGAR / 港交所披露等 · 统一 Million 单位</span>
      </div>
    </div>
  );
}

window.HomePage = HomePage;
