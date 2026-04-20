// Company page - aggregated view following company main page template
function CompanyPage({ id }) {
  const D = window.GI_DATA;
  const c = D.companies[id];
  if (!c) return <div className="page">公司未找到 · <a href="#/">返回首页</a></div>;

  const [tab, setTab] = React.useState("overview");
  const [gameSegmentKey, setGameSegmentKey] = React.useState("region");
  const quarters = c.quarters || [];
  const latest = quarters[quarters.length - 1];
  const relatedBriefings = D.briefings.filter((b) => b.company === id);
  const latestBriefing = relatedBriefings.find((b) => b.quarter === latest?.q) || relatedBriefings[0];
  const relatedMemos = D.memos.filter((m) => m.company.includes(id));
  const relatedProducts = (c.products || []).map((pid) => ({ id: pid, ...D.products[pid] })).filter((p) => p.name);

  const quartersWithQoQ = quarters.map((x, i) => {
    const p = i > 0 ? quarters[i - 1] : null;
    const m = x.q.match(/^(\d{4})Q([1-4])$/);
    const priorYear = m ? quarters.find((item) => item.q === `${Number(m[1]) - 1}Q${m[2]}`) : null;
    const fallbackSegments = [
      { name: "Game", value: x.revenue_game || 0, color: "var(--c3)" },
      { name: "Other", value: Math.max((x.revenue_company || 0) - (x.revenue_game || 0), 0), color: "var(--c2)" },
    ];
    return {
      ...x,
      qoq_game_calc: p && p.revenue_game ? (x.revenue_game - p.revenue_game) / p.revenue_game : null,
      qoq_company_calc: x.revenue_company_qoq !== undefined ? x.revenue_company_qoq : (p && p.revenue_company ? (x.revenue_company - p.revenue_company) / p.revenue_company : null),
      yoy_company_calc: x.revenue_company_yoy !== undefined ? x.revenue_company_yoy : (priorYear && priorYear.revenue_company ? (x.revenue_company - priorYear.revenue_company) / priorYear.revenue_company : null),
      revenue_segments_chart: (x.revenue_segments || fallbackSegments).filter((seg) => seg.value > 0),
    };
  });

  const companyRevenueChartData = quartersWithQoQ.map((x) => ({
    q: x.q,
    total: x.revenue_company,
    segments: x.revenue_segments_chart,
  }));
  const companyGrowthChartData = quartersWithQoQ.map((x) => ({
    q: x.q,
    yoy: x.yoy_company_calc,
    qoq: x.qoq_company_calc,
  }));
  const gameGrowthChartData = quartersWithQoQ.map((x) => ({
    q: x.q,
    yoy: x.yoy,
    qoq: x.qoq !== undefined ? x.qoq : x.qoq_game_calc,
  }));
  const gameSegmentKeys = Array.from(new Set(
    quarters.flatMap((x) => Object.keys(x.game_revenue_segments || {}))
  ));
  const activeGameSegmentKey = gameSegmentKeys.includes(gameSegmentKey) ? gameSegmentKey : gameSegmentKeys[0];
  const gameSegmentChartData = activeGameSegmentKey
    ? quarters.map((x) => ({
        q: x.q,
        total: x.revenue_game,
        segments: x.game_revenue_segments?.[activeGameSegmentKey] || [],
      })).filter((x) => x.segments.length)
    : [];
  const fmtPctTip = (v) => v === null || v === undefined ? "—" : (v * 100).toFixed(2) + "%";
  const currency = latest?.currency || c.currency || D.meta.currency || "CNY";
  const money = (n) => `${currency} ${fmtMoney(n)}M`;
  const briefingNoteStyle = {
    marginTop: 12,
    padding: "10px 12px",
    border: "1px solid var(--line)",
    borderRadius: 10,
    background: "rgba(248, 247, 243, 0.75)",
    fontSize: 12.5,
    lineHeight: 1.6,
    display: "flex",
    gap: 8,
    alignItems: "flex-start",
  };
  const BriefingNote = ({ children }) => children ? (
    <div style={briefingNoteStyle} className="muted">
      <span style={{ color: "var(--c1)", fontWeight: 700, lineHeight: 1.6 }}>•</span>
      <span>{children}</span>
    </div>
  ) : null;
  const profitLabel = id === "tencent" ? "计算利润率" : "营业利润率";
  const profitSub = id === "tencent" ? "GameIntel Standard" : "Operating Margin";
  const profitFormula = "计算利润为 GameIntel 标准化口径。计算利润 = 毛利润 - 研发费用 - 销售费用 - 管理费用 + 折旧及摊销；计算利润率 = 计算利润 / 公司总收入。";

  return (
    <div className="page">
      <Crumbs items={[{ label: "首页", href: "#/" }, { label: "公司主页" }, { label: c.name_cn }]} />

      <div className="page-hero">
        <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
          <CompanyAvatar company={c} size={56} />
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <h1 className="page-title" style={{ margin: 0 }}>{c.name_cn}</h1>
              <TierBadge tier={c.tier} />
              <span className="mono dim" style={{ fontSize: 12 }}>{c.name_en} · {c.ticker === "NA" ? "未上市" : c.ticker} · {c.currency}</span>
            </div>
            <div className="page-subtitle" style={{ marginTop: 8, maxWidth: 700 }}>{c.positioning}</div>
            <div style={{ marginTop: 10, display: "flex", gap: 6, flexWrap: "wrap" }}>
              {(c.markets || []).map((m) => <span key={m} className="pill" style={{ background: "var(--c3-soft)", color: "var(--up)" }}>{m}</span>)}
              {(c.genres || []).map((g) => <span key={g} className="pill" style={{ background: "var(--c1-soft)", color: "#3a5bd9" }}>{g}</span>)}
            </div>
          </div>
        </div>
        {latest && <span className="period-chip">{latest.q} 最新</span>}
      </div>

      {!quarters.length ? (
        <div className="card card-pad" style={{ textAlign: "center", padding: "40px 20px", color: "var(--ink-3)" }}>
          {c.name_cn} 为非上市公司，暂无公开季度财务数据 · 通过 _memos/ 持续跟踪
        </div>
      ) : (
        <>
          <div className="stat-row" style={{ marginBottom: 22 }}>
            <div className="stat">
              <div className="lbl">{latest.q} 游戏收入</div>
              <div className="val">{money(latest.revenue_game)}</div>
              <div className="sub"><Delta value={latest.yoy} /> YoY</div>
            </div>
            <div className="stat">
              <div className="lbl">毛利率</div>
              <div className="val">{fmtPct(latest.gm)}</div>
              <div className="sub dim">Gross Margin</div>
            </div>
            <div className="stat">
              <div className="lbl" title={id === "tencent" ? profitFormula : undefined} style={id === "tencent" ? { cursor: "help", textDecoration: "underline dotted", textUnderlineOffset: 3 } : undefined}>{profitLabel}</div>
              <div className="val" style={{ color: (id === "tencent" ? latest.pcm : latest.om) < 0 ? "var(--down)" : "var(--ink)" }}>{fmtPct(id === "tencent" ? latest.pcm : latest.om)}</div>
              <div className="sub dim">{profitSub}</div>
            </div>
            <div className="stat">
              <div className="lbl">研发费用率</div>
              <div className="val">{fmtPct(latest.rd)}</div>
              <div className="sub dim">R&D / Revenue</div>
            </div>
            <div className="stat">
              <div className="lbl">销售费用率</div>
              <div className="val">{fmtPct(latest.sm)}</div>
              <div className="sub dim">S&M / Revenue</div>
            </div>
          </div>

          <div className="tabs">
            {[
              ["overview", "季度概览"],
              ["financials", "财务详情"],
              ["strategy", "战略演变"],
              ["products", `旗下产品 · ${relatedProducts.length}`],
              ["intel", `近期情报 · ${relatedMemos.length}`],
            ].map(([k, l]) => (
              <div key={k} className={`tab ${tab === k ? "active" : ""}`} onClick={() => setTab(k)}>{l}</div>
            ))}
          </div>

          {tab === "overview" && (
            <>
              <div className="grid grid-2">
                <div className="card card-pad">
                  <div className="card-title"><h3>游戏收入趋势</h3><span className="meta">Revenue_Game · M · segment</span></div>
                  {gameSegmentKeys.length ? (
                    <>
                      <div className="row" style={{ marginBottom: 10 }}>
                        {gameSegmentKeys.map((key) => (
                          <button
                            key={key}
                            className="pill"
                            style={{
                              border: "0",
                              cursor: "pointer",
                              background: activeGameSegmentKey === key ? "var(--c1-soft)" : "var(--bg)",
                              color: activeGameSegmentKey === key ? "#3a5bd9" : "var(--ink-3)",
                            }}
                            onClick={() => setGameSegmentKey(key)}
                          >
                            {key === "region" ? "按地区" : key === "platform" ? "按平台" : key}
                          </button>
                        ))}
                      </div>
                      <StackedRevenueChart
                        data={gameSegmentChartData}
                        height={230}
                        formatMoneyValue={fmtMoney}
                        currencyLabel={currency}
                      />
                    </>
                  ) : (
                    <div className="muted" style={{ padding: "34px 0", fontSize: 13, lineHeight: 1.7 }}>
                      暂无游戏收入 segment 数据。后续若公司披露地区、平台或产品拆分，可在此切换查看。
                    </div>
                  )}
                </div>
                <div className="card card-pad">
                  <div className="card-title"><h3>游戏收入 YoY 与 QoQ 增速对照</h3><span className="meta">Revenue_Game growth</span></div>
                  <LineChart
                    data={gameGrowthChartData}
                    xKey="q"
                    series={[
                      { key: "yoy", color: "var(--c1)", label: "YoY" },
                      { key: "qoq", color: "var(--c2)", label: "QoQ" },
                    ]}
                    formatY={(v) => (v * 100).toFixed(0) + "%"}
                    formatTip={(v) => fmtPctTip(v)}
                    height={230}
                  />
                </div>
                <div className="card card-pad">
                  <div className="card-title"><h3>公司收入趋势</h3><span className="meta">Revenue_Company · M · segment share</span></div>
                  <StackedRevenueChart
                    data={companyRevenueChartData}
                    height={230}
                    formatMoneyValue={fmtMoney}
                    currencyLabel={currency}
                  />
                </div>
                <div className="card card-pad">
                  <div className="card-title"><h3>公司收入 YoY 与 QoQ 增速对照</h3><span className="meta">Revenue_Company growth</span></div>
                  <LineChart
                    data={companyGrowthChartData}
                    xKey="q"
                    series={[
                      { key: "yoy", color: "var(--c1)", label: "YoY" },
                      { key: "qoq", color: "var(--c2)", label: "QoQ" },
                    ]}
                    formatY={(v) => (v * 100).toFixed(0) + "%"}
                    formatTip={(v) => fmtPctTip(v)}
                    height={230}
                  />
                </div>
              </div>

              <div className="section-head"><h2>相关 Briefing</h2><span className="aside">company_briefing 模板</span></div>
              {relatedBriefings.length ? (
                <div className="grid grid-3">
                  {relatedBriefings.map((b) => (
                    <a key={b.id} href={`#/briefing/${b.id}`}>
                      <div className="briefing-card">
                        <div className="head">
                          <span className="mono" style={{ color: "var(--c1)", fontWeight: 700, fontSize: 12 }}>{b.quarter}</span>
                          <span className="mono dim" style={{ fontSize: 11 }}>{b.publish_date}</span>
                        </div>
                        <div className="tagline">{b.tagline}</div>
                        <div className="foot"><span>阅读 Briefing</span><a>→</a></div>
                      </div>
                    </a>
                  ))}
                </div>
              ) : <div className="card card-pad muted" style={{ fontSize: 13 }}>暂无发布的 Briefing</div>}
            </>
          )}

          {tab === "financials" && (
            <>
              <div className="grid grid-2">
                <div className="card card-pad">
                  <div className="card-title"><h3>盈利能力演变</h3><span className="meta">Margins</span></div>
                  <LineChart
                    data={quarters.map((x) => ({ q: x.q, gm: x.gm, om: x.om, pcm: x.pcm }))}
                    xKey="q"
                    series={[
                      { key: "gm", color: "var(--c3)", label: "毛利率" },
                      { key: "om", color: "var(--c1)", label: "经营利润率" },
                      { key: "pcm", color: "var(--c2)", label: "计算利润率" },
                    ]}
                    formatY={(v) => (v * 100).toFixed(0) + "%"}
                    formatTip={(v) => fmtPctTip(v)}
                    height={230}
                  />
                  <div style={{
                    marginTop: 10,
                    padding: "10px 12px",
                    border: "1px solid var(--line)",
                    borderRadius: 10,
                    background: "rgba(248, 247, 243, 0.75)",
                    fontSize: 12.5,
                    lineHeight: 1.55,
                  }} className="muted">
                    口径备注：计算利润为 GameIntel 标准化口径。计算利润 = 毛利润 - 研发费用 - 销售费用 - 管理费用 + 折旧及摊销；计算利润率 = 计算利润 / 公司总收入。
                  </div>
                  <BriefingNote>{latestBriefing?.profitability}</BriefingNote>
                </div>
                <div className="card card-pad">
                  <div className="card-title"><h3>费用率结构变化</h3><span className="meta">占 Revenue_Company · R&D / S&M / G&A</span></div>
                  <LineChart
                    data={quarters.map((x) => ({ q: x.q, rd: x.rd, sm: x.sm, ga: x.ga }))}
                    xKey="q"
                    series={[
                      { key: "rd", color: "var(--c5)", label: "研发费用率" },
                      { key: "sm", color: "var(--c4)", label: "销售费用率" },
                      { key: "ga", color: "var(--c6)", label: "管理费用率" },
                    ]}
                    formatY={(v) => (v * 100).toFixed(0) + "%"}
                    formatTip={(v) => fmtPctTip(v)}
                    height={230}
                  />
                  <BriefingNote>{latestBriefing?.cost}</BriefingNote>
                </div>
              </div>

              <div className="section-head"><h2>季度财务概览</h2><span className="aside">近 {quarters.length} 季 · Dataview 聚合</span></div>
              <div className="card card-pad">
                <table className="tbl">
                  <thead>
                    <tr>
                      <th>季度</th>
                      <th className="num">游戏收入(M)</th>
                      <th className="num">YoY</th>
                      <th className="num">QoQ</th>
                      <th className="num">毛利率</th>
                      <th className="num">计算利润率</th>
                      <th className="num">研发费比</th>
                      <th className="num">销售费比</th>
                      <th className="num">管理费比</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[...quarters].reverse().map((q) => (
                      <tr key={q.q}>
                        <td><strong>{q.q}</strong></td>
                        <td className="num">{fmtMoney(q.revenue_game)}</td>
                        <td className="num"><Delta value={q.yoy} /></td>
                        <td className="num">{q.qoq !== undefined ? <Delta value={q.qoq} /> : <span className="dim">—</span>}</td>
                        <td className="num">{fmtPct(q.gm)}</td>
                        <td className="num" style={{ color: q.pcm < 0 ? "var(--down)" : "inherit" }}>{fmtPct(q.pcm)}</td>
                        <td className="num">{fmtPct(q.rd)}</td>
                        <td className="num">{fmtPct(q.sm)}</td>
                        <td className="num">{fmtPct(q.ga)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {tab === "strategy" && (
            <div className="card card-pad">
              <div className="card-title"><h3>战略关键词演变</h3><span className="meta">近 {quarters.length} 季</span></div>
              <table className="tbl">
                <thead><tr><th>季度</th><th>战略</th><th>驱动</th><th>拖累</th></tr></thead>
                <tbody>
                  {[...quarters].reverse().map((q) => (
                    <tr key={q.q}>
                      <td><strong>{q.q}</strong></td>
                      <td>{(q.strategy || []).map((k, i) => <Kw key={i} type="strategy">{k}</Kw>)}</td>
                      <td>{q.drivers.map((k, i) => <Kw key={i} type="driver">{k}</Kw>)}</td>
                      <td>{q.drags.length ? q.drags.map((k, i) => <Kw key={i} type="drag">{k}</Kw>) : <span className="dim">—</span>}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {tab === "products" && (
            <div className="grid grid-3">
              {relatedProducts.length ? relatedProducts.map((p) => (
                <div key={p.id} className="card card-pad">
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                    <span className={`pill ${p.status === "active" ? "pill-up" : ""}`}>{p.status}</span>
                    <span className="mono dim" style={{ fontSize: 11 }}>{p.platform}</span>
                  </div>
                  <div style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>{p.name}</div>
                  <div className="mono dim" style={{ fontSize: 11, marginBottom: 10 }}>{p.name_en}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-3)", borderTop: "1px dashed var(--line)", paddingTop: 10 }}>
                    <span>{p.genre}</span>
                    <span className="mono">上线 {p.launch}</span>
                  </div>
                </div>
              )) : <div className="card card-pad muted">暂无匹配产品档案</div>}
            </div>
          )}

          {tab === "intel" && (
            <div className="card card-pad">
              <div className="card-title"><h3>近期情报与研究</h3><span className="meta">_memos/ Dataview 聚合</span></div>
              {relatedMemos.length ? relatedMemos.map((m, i) => (
                <div key={i} className="memo-item">
                  <div className="memo-date">{m.date}</div>
                  <div className="memo-title">
                    {m.title}
                    <div style={{ marginTop: 6, display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
                      <span className="memo-type">{m.type}</span>
                      {m.company.filter(x => x !== id).map((cid) => <CompanyLink key={cid} id={cid} compact />)}
                    </div>
                  </div>
                </div>
              )) : <div className="muted" style={{ fontSize: 13, padding: 10 }}>暂无近期情报</div>}
            </div>
          )}
        </>
      )}

      <div className="foot-meta">
        <span>基于 company主页模板.md · Dataview 聚合视图</span>
        <span>Tier {c.tier} · {c.status}</span>
      </div>
    </div>
  );
}

window.CompanyPage = CompanyPage;
