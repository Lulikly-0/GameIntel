// Briefing page — QoQ-enriched
function BriefingPage({ id }) {
  const D = window.GI_DATA;
  const [gameSegmentKey, setGameSegmentKey] = React.useState("region");
  const b = D.briefings.find((x) => x.id === id);
  if (!b) return <div className="page">未找到 Briefing</div>;
  const c = D.companies[b.company];
  const quarters = c.quarters;
  const q = quarters.find((x) => x.q === b.quarter);
  const qIdx = quarters.findIndex((x) => x.q === b.quarter);
  const prevQ = qIdx > 0 ? quarters[qIdx - 1] : null;
  const prev = quarters.slice(-6);

  // Compute QoQ for margin/cost metrics (pp changes vs prev quarter)
  const dpp = (a, b) => (a !== undefined && b !== undefined) ? (a - b) : null;
  const qoqGm = prevQ ? dpp(q.gm, prevQ.gm) : null;
  const qoqOm = prevQ ? dpp(q.om, prevQ.om) : null;
  const qoqPcm = prevQ ? dpp(q.pcm, prevQ.pcm) : null;
  const qoqRd = prevQ ? dpp(q.rd, prevQ.rd) : null;
  const qoqSm = prevQ ? dpp(q.sm, prevQ.sm) : null;
  const qoqGa = prevQ ? dpp(q.ga, prevQ.ga) : null;
  const qoqCompany = q.revenue_company_qoq !== undefined ? q.revenue_company_qoq : (prevQ ? (q.revenue_company - prevQ.revenue_company) / prevQ.revenue_company : null);

  // Build per-quarter QoQ series for charts
  const prevWithQoQ = prev.map((x, i) => {
    const p = i > 0 ? prev[i - 1] : null;
    const priorYear = quarters.find((item) => {
      const m = x.q.match(/^(\d{4})Q([1-4])$/);
      return m && item.q === `${Number(m[1]) - 1}Q${m[2]}`;
    });
    const companyYoY = priorYear && priorYear.revenue_company
      ? (x.revenue_company - priorYear.revenue_company) / priorYear.revenue_company
      : null;
    const fallbackSegments = [
      { name: "Game", value: x.revenue_game || 0, color: "var(--c3)" },
      { name: "Other", value: Math.max((x.revenue_company || 0) - (x.revenue_game || 0), 0), color: "var(--c2)" },
    ];
    return {
      ...x,
      qoq_game: p ? (x.revenue_game - p.revenue_game) / p.revenue_game : null,
      qoq_co: x.revenue_company_qoq !== undefined ? x.revenue_company_qoq : (p ? (x.revenue_company - p.revenue_company) / p.revenue_company : null),
      yoy_co: x.revenue_company_yoy !== undefined ? x.revenue_company_yoy : companyYoY,
      revenue_segments_chart: (x.revenue_segments || fallbackSegments).filter((seg) => seg.value > 0),
    };
  });

  const companyRevenueChartData = prevWithQoQ.map((x) => ({
    q: x.q,
    total: x.revenue_company,
    segments: x.revenue_segments_chart,
  }));

  const companyGrowthChartData = prevWithQoQ.map((x) => ({
    q: x.q,
    yoy: x.yoy_co,
    qoq: x.qoq_co,
  }));

  const gameGrowthChartData = prevWithQoQ.map((x) => ({
    q: x.q,
    yoy: x.yoy,
    qoq: x.qoq_game,
  }));
  const gameSegmentKeys = Array.from(new Set(
    prev.flatMap((x) => Object.keys(x.game_revenue_segments || {}))
  ));
  const activeGameSegmentKey = gameSegmentKeys.includes(gameSegmentKey) ? gameSegmentKey : gameSegmentKeys[0];
  const gameSegmentChartData = activeGameSegmentKey
    ? prev.map((x) => ({
        q: x.q,
        total: x.revenue_game,
        segments: x.game_revenue_segments?.[activeGameSegmentKey] || [],
      })).filter((x) => x.segments.length)
    : [];

  const fmtPctTip = (v) => v === null || v === undefined ? "—" : (v * 100).toFixed(2) + "%";
  const currency = q.currency || c.currency || D.meta.currency || "CNY";
  const money = (n) => `${currency} ${fmtMoney(n)}M`;
  const noteStyle = { marginTop: 14, fontSize: 13.5, lineHeight: 1.6, display: "flex", gap: 8, alignItems: "flex-start" };
  const Note = ({ children }) => (
    <div style={noteStyle} className="muted">
      <span style={{ color: "var(--c1)", fontWeight: 700, lineHeight: 1.6 }}>•</span>
      <span>{children}</span>
    </div>
  );

  return (
    <div className="page">
      <Crumbs items={[
        { label: "首页", href: "#/" },
        { label: "Briefing" },
        { label: `${c.name_cn} ${b.quarter}` },
      ]} />
      <div className="page-hero">
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
            <CompanyAvatar company={c} size={32} />
            <span style={{ fontWeight: 700, fontSize: 15 }}>{c.name_cn}</span>
            <span className="mono dim" style={{ fontSize: 12 }}>{c.name_en} · {c.ticker}</span>
            <TierBadge tier={c.tier} />
            <a href={`#/company/${c.id}`} style={{ color: "var(--c1)", fontSize: 12, fontWeight: 600, marginLeft: 8 }}>公司主页 →</a>
          </div>
          <h1 className="page-title">{c.name_cn} {b.quarter} 财报 Briefing</h1>
          <div className="page-subtitle">{b.tagline}</div>
        </div>
        <div style={{ textAlign: "right" }}>
          <span className="period-chip">{b.quarter}</span>
          <div className="mono dim" style={{ fontSize: 11, marginTop: 8 }}>发布 {b.publish_date}</div>
        </div>
      </div>

      {/* 核心指标 stat row — 含 QoQ */}
      <div className="stat-row" style={{ marginBottom: 22 }}>
        <div className="stat">
          <div className="lbl">游戏收入</div>
          <div className="val">{money(q.revenue_game)}</div>
          <div className="sub"><Delta value={q.yoy} /> YoY · <Delta value={q.qoq} /> QoQ</div>
        </div>
        <div className="stat">
          <div className="lbl">公司整体</div>
          <div className="val">{money(q.revenue_company)}</div>
          <div className="sub">{qoqCompany !== null && <><Delta value={qoqCompany} /> QoQ</>}</div>
        </div>
        <div className="stat">
          <div className="lbl">毛利率</div>
          <div className="val">{fmtPct(q.gm)}</div>
          <div className="sub">{qoqGm !== null && <span className={deltaClass(qoqGm)}><Arrow n={qoqGm} /> {fmtPP(qoqGm).replace(/^[+-]/, "")} QoQ</span>}</div>
        </div>
        <div className="stat">
          <div className="lbl">营业利润率</div>
          <div className="val" style={{ color: q.om < 0 ? "var(--down)" : "var(--ink)" }}>{fmtPct(q.om)}</div>
          <div className="sub">{qoqOm !== null && <span className={deltaClass(qoqOm)}><Arrow n={qoqOm} /> {fmtPP(qoqOm).replace(/^[+-]/, "")} QoQ</span>}</div>
        </div>
        <div className="stat">
          <div className="lbl">计算利润率</div>
          <div className="val">{fmtPct(q.pcm)}</div>
          <div className="sub">{qoqPcm !== null && <span className={deltaClass(qoqPcm)}><Arrow n={qoqPcm} /> {fmtPP(qoqPcm).replace(/^[+-]/, "")} QoQ</span>}</div>
        </div>
      </div>

      {/* 核心判断 */}
      <div className="grid grid-hero">
        <div className="card card-pad">
          <div className="card-title"><h3>一、核心判断</h3><span className="meta">三句话</span></div>
          {b.core_judgements.map((j, i) => (
            <div key={i} style={{ display: "flex", gap: 12, padding: "10px 0", borderBottom: i < b.core_judgements.length - 1 ? "1px dashed var(--line)" : "none" }}>
              <div className="mono" style={{ color: CHART_COLORS[i], fontWeight: 700, fontSize: 15, minWidth: 24 }}>0{i + 1}</div>
              <div style={{ fontSize: 14, lineHeight: 1.6 }}>{j}</div>
            </div>
          ))}
        </div>

        <div className="card card-pad">
          <div className="card-title"><h3>二、本季关键词</h3><span className="meta">Properties</span></div>
          <div style={{ marginBottom: 14 }}>
            <div className="eyebrow" style={{ color: "var(--up)", marginBottom: 6 }}>驱动</div>
            <div className="kw-row">{b.keywords.drivers.map((k, i) => <Kw key={i} type="driver">🔺 {k}</Kw>)}</div>
          </div>
          <div style={{ marginBottom: 14 }}>
            <div className="eyebrow" style={{ color: "var(--down)", marginBottom: 6 }}>拖累</div>
            <div className="kw-row">{b.keywords.drags.length ? b.keywords.drags.map((k, i) => <Kw key={i} type="drag">🔻 {k}</Kw>) : <span className="dim" style={{ fontSize: 12 }}>无明显拖累</span>}</div>
          </div>
          <div>
            <div className="eyebrow" style={{ color: "#3a5bd9", marginBottom: 6 }}>战略</div>
            <div className="kw-row">{b.keywords.strategy.map((k, i) => <Kw key={i} type="strategy">{k}</Kw>)}</div>
          </div>
        </div>
      </div>

      {/* YoY / QoQ 快速对比表 */}
      <div className="section-head"><h2>YoY / QoQ 快速对比</h2><span className="aside">本季 vs 去年同期 / 上季</span></div>
      <div className="card card-pad">
        <table className="tbl">
          <thead>
            <tr>
              <th>指标</th>
              <th className="num">本季 ({b.quarter})</th>
              <th className="num">上季 ({prevQ?.q || "—"})</th>
              <th className="num">YoY</th>
              <th className="num">QoQ</th>
              <th>备注</th>
            </tr>
          </thead>
          <tbody>
            <tr>
              <td><strong>Revenue_Game</strong></td>
              <td className="num">{money(q.revenue_game)}</td>
              <td className="num">{prevQ ? money(prevQ.revenue_game) : "—"}</td>
              <td className="num"><Delta value={q.yoy} /></td>
              <td className="num"><Delta value={q.qoq} /></td>
              <td className="muted" style={{ fontSize: 12 }}>游戏业务收入</td>
            </tr>
            <tr>
              <td><strong>Revenue_Company</strong></td>
              <td className="num">{money(q.revenue_company)}</td>
              <td className="num">{prevQ ? money(prevQ.revenue_company) : "—"}</td>
              <td className="num"><Delta value={q.revenue_company_yoy} /></td>
              <td className="num">{qoqCompany !== null ? <Delta value={qoqCompany} /> : "—"}</td>
              <td className="muted" style={{ fontSize: 12 }}>公司整体收入</td>
            </tr>
            <tr>
              <td><strong>Gross Margin</strong></td>
              <td className="num">{fmtPct(q.gm)}</td>
              <td className="num">{prevQ ? fmtPct(prevQ.gm) : "—"}</td>
              <td className="num">—</td>
              <td className="num">{qoqGm !== null ? <span className={deltaClass(qoqGm)}>{fmtPP(qoqGm)}</span> : "—"}</td>
              <td className="muted" style={{ fontSize: 12 }}>毛利率</td>
            </tr>
            <tr>
              <td><strong>Operating Margin</strong></td>
              <td className="num">{fmtPct(q.om)}</td>
              <td className="num">{prevQ ? fmtPct(prevQ.om) : "—"}</td>
              <td className="num">—</td>
              <td className="num">{qoqOm !== null ? <span className={deltaClass(qoqOm)}>{fmtPP(qoqOm)}</span> : "—"}</td>
              <td className="muted" style={{ fontSize: 12 }}>营业利润率</td>
            </tr>
            <tr>
              <td><strong>R&D Ratio</strong></td>
              <td className="num">{fmtPct(q.rd)}</td>
              <td className="num">{prevQ ? fmtPct(prevQ.rd) : "—"}</td>
              <td className="num">—</td>
              <td className="num">{qoqRd !== null ? <span className={deltaClass(-qoqRd)}>{fmtPP(qoqRd)}</span> : "—"}</td>
              <td className="muted" style={{ fontSize: 12 }}>研发费比（降为正面）</td>
            </tr>
            <tr>
              <td><strong>S&M Ratio</strong></td>
              <td className="num">{fmtPct(q.sm)}</td>
              <td className="num">{prevQ ? fmtPct(prevQ.sm) : "—"}</td>
              <td className="num">—</td>
              <td className="num">{qoqSm !== null ? <span className={deltaClass(-qoqSm)}>{fmtPP(qoqSm)}</span> : "—"}</td>
              <td className="muted" style={{ fontSize: 12 }}>销售费比（降为正面）</td>
            </tr>
            <tr>
              <td><strong>G&A Ratio</strong></td>
              <td className="num">{fmtPct(q.ga)}</td>
              <td className="num">{prevQ ? fmtPct(prevQ.ga) : "—"}</td>
              <td className="num">—</td>
              <td className="num">{qoqGa !== null ? <span className={deltaClass(-qoqGa)}>{fmtPP(qoqGa)}</span> : "—"}</td>
              <td className="muted" style={{ fontSize: 12 }}>管理费比（降为正面）</td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* 财务详情 charts */}
      <div className="section-head"><h2>三、财务详情</h2><span className="aside">近 6 季 · 悬停查看详细数据</span></div>
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
                height={220}
                formatMoneyValue={fmtMoney}
                currencyLabel={currency}
              />
            </>
          ) : (
            <div className="muted" style={{ padding: "34px 0", fontSize: 13, lineHeight: 1.7 }}>
              暂无游戏收入 segment 数据。后续若公司披露地区、平台或产品拆分，可在此切换查看。
            </div>
          )}
          <Note>{b.game_business}</Note>
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
            height={220}
          />
          <Note>
            本季 YoY <b>{fmtPct(q.yoy, { signed: true })}</b> · QoQ <b>{fmtPct(q.qoq, { signed: true })}</b>。QoQ 反映季节性与上线节奏，YoY 反映结构性增长。
          </Note>
        </div>

        <div className="card card-pad">
          <div className="card-title"><h3>公司收入趋势</h3><span className="meta">Revenue_Company · M · segment share</span></div>
          <StackedRevenueChart
            data={companyRevenueChartData}
            height={220}
            formatMoneyValue={fmtMoney}
            currencyLabel={currency}
          />
          <Note>
            公司收入拆分来自季度 md 的公司整体收入分部；未披露的分部不会由脚本补造。
          </Note>
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
            height={220}
          />
          <Note>
            公司总收入增速用于判断非游戏业务是否同步改善，或是否对游戏收入形成对冲。
          </Note>
        </div>

        <div className="card card-pad">
          <div className="card-title"><h3>盈利能力演变</h3><span className="meta">Margins · 悬停对比</span></div>
          <LineChart
            data={prev.map((x) => ({ q: x.q, gm: x.gm, om: x.om, pcm: x.pcm }))}
            xKey="q"
            series={[
              { key: "gm", color: "var(--c3)", label: "毛利率" },
              { key: "om", color: "var(--c1)", label: "经营利润率" },
              { key: "pcm", color: "var(--c2)", label: "计算利润率" },
            ]}
            formatY={(v) => (v * 100).toFixed(0) + "%"}
            formatTip={(v) => fmtPctTip(v)}
            height={220}
          />
          <Note>{b.profitability}</Note>
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
        </div>

        <div className="card card-pad">
          <div className="card-title"><h3>费用率结构变化</h3><span className="meta">占 Revenue_Company · R&D / S&M / G&A</span></div>
          <LineChart
            data={prev.map((x) => ({ q: x.q, rd: x.rd, sm: x.sm, ga: x.ga }))}
            xKey="q"
            series={[
              { key: "rd", color: "var(--c5)", label: "研发费用率" },
              { key: "sm", color: "var(--c4)", label: "销售费用率" },
              { key: "ga", color: "var(--c6)", label: "管理费用率" },
            ]}
            formatY={(v) => (v * 100).toFixed(0) + "%"}
            formatTip={(v) => fmtPctTip(v)}
            height={220}
          />
          <Note>{b.cost}</Note>
        </div>
      </div>

      {/* 洞察 */}
      <div className="section-head"><h2>四、洞察与启发</h2><span className="aside">讨论后生成 · {b.insights.length} 条</span></div>
      <div className="grid">
        {b.insights.map((it, i) => (
          <div key={i} className="card card-pad">
            <div className={`insight alt-${i % 4}`}>
              <div className="title">观察 {i + 1}｜{it.title}</div>
              <div className="row"><div className="k">现象</div><div className="v">{it.phenomenon}</div></div>
              <div className="row"><div className="k">背后</div><div className="v muted">{it.background}</div></div>
              <div className="row"><div className="k">值得思考</div><div className="v" style={{ fontStyle: "italic" }}>{it.question}</div></div>
            </div>
          </div>
        ))}
      </div>

      <div className="foot-meta">
        <span>基于 company_briefing模版.md · author_type: mixed · 季度模板含 YoY/QoQ</span>
        <span>来源：{c.name_cn} IR · {b.publish_date}</span>
      </div>
    </div>
  );
}

window.BriefingPage = BriefingPage;
