(function () {
  const D = window.GI_WEB_DATA || {};
  const state = {
    page: location.hash.replace("#", "") || "home",
    selectedCompanies: [],
    start: "",
    end: "",
    tab: "finance",
    dimensions: {},
    companyQuery: "",
    otherFinanceWidths: {},
  };

  const COLORS = ["#6a8cff", "#ffb45a", "#4ec9a3", "#e86a7c", "#a788ff", "#5dc4e0"];
  const FEE_RATIO_IDS = [
    "ratio_sales_marketing",
    "ratio_r_d",
    "ratio_g_a_excl_r_d",
    "ratio_g_a",
    "ratio_personnel",
    "ratio_paid_commissions",
    "ratio_marketing",
    "ratio_share_based_payment",
    "ratio_operating_others",
    "ratio_operating_expenses_ex_cost_of_revenue",
  ];
  const PROFIT_RATIO_IDS = [
    "ratio_gross_margin",
    "ratio_operating_margin",
    "ratio_operating_non_ifrs_margin",
    "ratio_adjusted_ebitda_margin",
    "ratio_net_margin",
    "ratio_attrib_margin",
    "ratio_attrib_non_ifrs_margin",
    "ratio_attrib_non_gaap_margin",
    "ratio_attrib_ex_nonrecurring_margin",
  ];
  const OTHER_FINANCE_DEFAULT_WIDTHS = { field: 240, value: 104, yoy: 76, qoq: 76, source: 200 };
  const COMPANY_ALIASES = {
    Gbits_603444SS: "jbt jibite gbits g-bits 603444",
    Tencent_0700HK: "tx tengxun tencent 0700",
    NetEase_NTES: "wy wangyi netease ntes 9999",
    Krafton_259960KS: "krafton 259960",
    Roblox_RBLX: "roblox rblx",
    SeaGarena_SE: "sea garena se shopee monee bookings",
  };

  function esc(value) {
    return String(value ?? "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function tip(value) {
    return esc(value).replace(/\n/g, "&#10;");
  }

  function fmtMoney(value) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
    const n = Number(value);
    const b = n / 1000;
    if (Math.abs(n) >= 1000) return `${b.toLocaleString("zh-CN", { maximumFractionDigits: Math.abs(b) >= 10 ? 1 : 2 })}B`;
    return `${n.toLocaleString("zh-CN", { maximumFractionDigits: 1 })}M`;
  }

  function fmtPct(value, signed = false, decimals = 1) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
    const n = Number(value);
    return `${signed && n > 0 ? "+" : ""}${(n * 100).toFixed(decimals)}%`;
  }

  function fmtPp(value, signed = true, decimals = 1) {
    if (value === null || value === undefined || Number.isNaN(Number(value))) return "-";
    const n = Number(value);
    return `${signed && n > 0 ? "+" : ""}${(n * 100).toFixed(decimals)}pp`;
  }

  function periodRank(period) {
    const match = String(period || "").match(/^(\d{4})(Q[1-4]|FY)$/);
    if (!match) return 0;
    return Number(match[1]) * 10 + ({ Q1: 1, Q2: 2, Q3: 3, Q4: 4, FY: 5 }[match[2]] || 0);
  }

  function companies() {
    return Object.values(D.companies || {}).sort((a, b) => a.name_cn.localeCompare(b.name_cn, "zh-CN"));
  }

  function companyMeta(company) {
    return [company.name_en, company.ticker].filter(Boolean).join(" · ") || company.id;
  }

  function companySearchText(company) {
    return `${company.name_cn || ""} ${company.name_en || ""} ${company.ticker || ""} ${company.id || ""} ${COMPANY_ALIASES[company.id] || ""}`.toLowerCase();
  }

  function allPeriods() {
    const set = new Set();
    companies().forEach((company) => (company.periods || []).forEach((row) => {
      if (/^\d{4}Q[1-4]$/.test(row.calendar_period)) set.add(row.calendar_period);
    }));
    return Array.from(set).sort((a, b) => periodRank(a) - periodRank(b));
  }

  function selectedPeriods() {
    const periods = allPeriods();
    if (!periods.length) return [];
    const start = periods.includes(state.start) ? state.start : periods[0];
    const end = periods.includes(state.end) ? state.end : periods[periods.length - 1];
    const a = periods.indexOf(start);
    const b = periods.indexOf(end);
    return periods.slice(Math.min(a, b), Math.max(a, b) + 1);
  }

  function periodRow(company, period) {
    return (company?.periods || []).find((row) => row.calendar_period === period) || null;
  }

  function latestRow(company, periods) {
    for (let i = periods.length - 1; i >= 0; i -= 1) {
      const row = periodRow(company, periods[i]);
      if (row) return row;
    }
    return null;
  }

  function field(row, id) {
    return row?.fields?.[id] || null;
  }

  function fieldByTag(row, tag) {
    return Object.values(row?.fields || {}).find((item) => (item.comparable_tags || []).includes(tag)) || null;
  }

  function previousQuarter(period) {
    const match = String(period || "").match(/^(\d{4})Q([1-4])$/);
    if (!match) return "";
    const year = Number(match[1]);
    const quarter = Number(match[2]);
    return quarter === 1 ? `${year - 1}Q4` : `${year}Q${quarter - 1}`;
  }

  function previousYearQuarter(period) {
    const match = String(period || "").match(/^(\d{4})Q([1-4])$/);
    if (!match) return "";
    return `${Number(match[1]) - 1}Q${match[2]}`;
  }

  function computedGrowth(current, base) {
    const a = Number(current?.value);
    const b = Number(base?.value);
    if (!Number.isFinite(a) || !Number.isFinite(b) || b === 0) return null;
    return a / b - 1;
  }

  function computedPp(current, base) {
    const a = Number(current?.value);
    const b = Number(base?.value);
    if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
    return a - b;
  }

  function fieldSeries(company, periods, fieldId) {
    return periods.map((period) => {
      const row = periodRow(company, period);
      const item = field(row, fieldId);
      const previous = field(periodRow(company, previousQuarter(period)), fieldId);
      const lastYear = field(periodRow(company, previousYearQuarter(period)), fieldId);
      return {
        q: period,
        value: item?.value ?? null,
        yoy: item?.reported_yoy ?? computedGrowth(item, lastYear),
        qoq: item?.reported_qoq ?? computedGrowth(item, previous),
        field: item,
      };
    });
  }

  function isRatioField(item) {
    return item?.unit === "ratio" || item?.metric_type === "ratio" || /ratio|margin|率/.test(`${item?.field_id || ""} ${item?.display_name || ""}`);
  }

  function numeratorId(item) {
    const formula = String(item?.extraction_formula || "");
    const formulaMatch = formula.match(/([A-Za-z0-9_{}（）()一-龥]+)\s*\//);
    if (formulaMatch) return formulaMatch[1];
    return {
      ratio_gross_margin: "gross_profit",
      ratio_sales_marketing: "expense_sales_marketing",
      ratio_r_d: "expense_r_d",
      ratio_g_a: "expense_g_a",
      ratio_g_a_excl_r_d: "expense_g_a_excl_r_d",
      ratio_personnel: "expense_personnel",
      ratio_paid_commissions: "expense_paid_commissions",
      ratio_marketing: "expense_marketing",
      ratio_share_based_payment: "expense_share_based_payment",
      ratio_operating_others: "expense_operating_others",
      ratio_operating_expenses_ex_cost_of_revenue: "operating_costs_total",
      ratio_attrib_margin: "profit_attrib",
      ratio_attrib_non_ifrs_margin: "profit_attrib_non_ifrs",
      ratio_attrib_non_gaap_margin: "profit_attrib_non_gaap",
      ratio_attrib_ex_nonrecurring_margin: "profit_attrib_ex_nonrecurring",
      ratio_operating_margin: "profit_operating",
      ratio_operating_non_ifrs_margin: "profit_operating_non_ifrs",
      ratio_adjusted_ebitda_margin: "adjusted_ebitda",
      ratio_net_margin: "profit_net",
    }[item?.field_id] || "";
  }

  function ratioPpSeries(company, periods, fieldId, valueLabel = "比例") {
    return periods.map((period) => {
      const row = periodRow(company, period);
      const item = field(row, fieldId);
      const previous = field(periodRow(company, previousQuarter(period)), fieldId);
      const lastYear = field(periodRow(company, previousYearQuarter(period)), fieldId);
      const value = item?.value ?? null;
      const yoyPp = computedPp(item, lastYear);
      const qoqPp = computedPp(item, previous);
      const name = item?.display_name || fieldId;
      const tipText = `${period} ${name}\n${valueLabel}: ${fmtPct(value)}\nYoY: ${fmtPp(yoyPp)}\nQoQ: ${fmtPp(qoqPp)}`;
      return {
        q: period,
        value,
        yoyPp,
        qoqPp,
        value__tip: tipText,
        yoyPp__tip: tipText,
        qoqPp__tip: tipText,
        field: item,
      };
    });
  }

  function valueText(value, item) {
    if (isRatioField(item)) return fmtPct(value);
    if (["million", "gross_receipts"].includes(item?.unit)) return fmtMoney(value);
    if (value === null || value === undefined) return "-";
    return Number(value).toLocaleString("zh-CN", { maximumFractionDigits: 2 });
  }

  function chartValueFormatter(item) {
    return (value) => valueText(value, item);
  }

  function metricNoteLine(item, note = "") {
    const formula = String(item?.extraction_formula || "").trim();
    const text = String(note || item?.template_note || item?.official_explanation || (formula ? "计算值，hover 查看公式" : "")).trim();
    if (!text) return "";
    const title = formula ? `${text}\n公式: ${formula}` : text;
    return `<div class="metric-note-line" title="${tip(title)}">${esc(text)}</div>`;
  }

  function aggregationGroupLabel(group) {
    return {
      business: "按业务",
      geography: "按地区",
      platform: "按平台",
      product: "按产品",
      ip: "按IP",
      cost: "按成本",
    }[group] || group || "按业务";
  }

  function splitDimension(item) {
    if (item.aggregation_group) return aggregationGroupLabel(item.aggregation_group);
    if (["domestic", "international", "overseas"].includes(item.segment_scope)) return "按地区";
    if (/platform|mobile|pc|console/i.test(`${item.segment_scope} ${item.field_id}`)) return "按平台";
    if (item.business_scope === "product" || /^gross_receipts_product_/.test(item.field_id || "")) return "按产品";
    return "按业务";
  }

  function splitGroups(row, totalField) {
    const fields = Object.values(row?.fields || {});
    let splits = fields.filter((item) =>
      item.parent_field_id === totalField?.field_id
      && item.value !== null
      && item.value !== undefined
    );
    if (!splits.length && totalField?.field_id === "revenue_game_total") {
      splits = fields.filter((item) =>
        item.field_id !== totalField.field_id
        && item.metric_type === "revenue"
        && item.business_scope === "game"
        && item.segment_scope !== "total"
        && item.value !== null
        && item.value !== undefined
      );
    }
    if (!splits.length && totalField?.field_id === "revenue_company_total") {
      splits = fields.filter((item) =>
        item.field_id !== totalField.field_id
        && item.metric_type === "revenue"
        && item.value !== null
        && item.value !== undefined
        && (
          item.field_id === "revenue_game_total"
          || !["game", "company"].includes(item.business_scope)
          || item.field_id === "revenue_others"
        )
      );
    }
    const groups = {};
    splits.forEach((item) => {
      const key = splitDimension(item);
      if (!groups[key]) groups[key] = [];
      groups[key].push(item);
    });
    return Object.entries(groups)
      .map(([key, fields]) => ({ key, fields }))
      .filter((group) => group.fields.length > 1);
  }

  function briefing(companyId, period) {
    return D.briefings?.[`${companyId}::${period}`] || null;
  }

  function eventsFor(companyId, period) {
    return (D.events || []).filter((event) => event.calendar_period === period && (event.company_ids || []).includes(companyId));
  }

  function earningsDisclosureEvent(companyId, period) {
    return (D.events || [])
      .filter((event) =>
        event.event_type === "earnings_release"
        && (event.company_ids || []).includes(companyId)
        && (event.calendar_period === period || (event.related_periods || []).includes(period))
      )
      .sort((a, b) => String(b.event_date || "").localeCompare(String(a.event_date || "")))[0] || null;
  }

  function disclosureDateForUpdate(item) {
    return item.disclosure_date || item.earnings_release_date || earningsDisclosureEvent(item.company_id, item.calendar_period)?.event_date || "";
  }

  function fieldExplanation(companyId, period, fieldId) {
    const event = eventsFor(companyId, period).find((item) => item.field_explanations?.[fieldId]);
    return event?.field_explanations?.[fieldId] || null;
  }

  function init() {
    const periodList = allPeriods();
    const companyList = companies();
    state.start = periodList[Math.max(0, periodList.length - 5)] || "";
    state.end = periodList[periodList.length - 1] || "";
    state.selectedCompanies = companyList[0] ? [companyList[0].id] : [];
    render();
  }

  function setPage(page) {
    state.page = page;
    if (location.hash !== `#${page}`) location.hash = page;
    render();
  }

  function render() {
    document.getElementById("root").innerHTML = `${topbar()}<main class="page">${page()}</main>`;
    bind();
  }

  function topbar() {
    const generated = D.meta?.generated_at ? D.meta.generated_at.slice(0, 10) : "mock";
    const nav = [["home", "首页"], ["workbench", "信号工作台"], ["company", "公司主页"], ["products", "产品信息"]];
    return `
      <div class="topbar">
        <div class="topbar-inner">
          <button class="brand" data-nav="home" type="button"><span class="brand-mark"></span><span class="brand-name">GameIntel</span><span class="brand-sub">v3 WebV0</span></button>
          <nav class="nav">${nav.map(([id, label]) => `<button class="${state.page === id ? "active" : ""}" data-nav="${id}" type="button">${label}</button>`).join("")}</nav>
          <div class="topbar-spacer"></div>
          <span class="period-chip">${esc(generated)}</span>
        </div>
      </div>
    `;
  }

  function page() {
    if (state.page === "workbench") return workbenchPage();
    if (state.page === "company") return placeholder("公司主页", "公司主页待开发");
    if (state.page === "products") return placeholder("产品信息", "产品信息待开发");
    return homePage();
  }

  function homePage() {
    const financial = (D.latest_updates?.financial || [])
      .slice()
      .sort((a, b) => {
        const ad = disclosureDateForUpdate(a);
        const bd = disclosureDateForUpdate(b);
        if (ad && bd && ad !== bd) return String(bd).localeCompare(String(ad));
        if (ad && !bd) return -1;
        if (!ad && bd) return 1;
        return periodRank(b.calendar_period) - periodRank(a.calendar_period);
      })
      .slice(0, 6);
    return `
      <div class="page-hero">
        <div><div class="crumbs">GameIntel / Home</div><h1 class="page-title">GameIntel v3</h1><div class="page-subtitle">个人战略研究用财报信号阅读工作台。数字来自 JSON，判断来自 Human 写入内容。</div></div>
        <button class="soft-btn" data-nav="workbench" type="button">进入信号工作台</button>
      </div>
      <section class="summary-hero">
        <div class="card-title home-section-title">
          <div><div class="eyebrow">Financial Updates</div><h2>财报数据更新</h2></div>
          <span class="meta">按财报披露日新 → 旧</span>
        </div>
        ${updateList("最近财报", financial, (item) => `${item.company_name} · ${item.company_id} · ${item.calendar_period}`, (item) => disclosureDateForUpdate(item) || "披露日待补")}
      </section>
      <section class="summary-hero home-section-gap">
        <div class="card-title home-section-title">
          <div><div class="eyebrow">Event Updates</div><h2>事件更新</h2></div>
          <span class="meta">Future</span>
        </div>
        <div class="data-missing">事件更新功能待开发</div>
      </section>
      <div class="grid grid-2" style="margin-top:18px">
        <section class="card card-pad"><div class="card-title"><h3>产品动态</h3><span class="meta">Future</span></div><div class="data-missing">产品动态功能未来更新</div></section>
        <section class="card card-pad"><div class="card-title"><h3>财报日历</h3><span class="meta">Future</span></div><div class="data-missing">财报日历功能未来更新</div></section>
      </div>
    `;
  }

  function updateList(title, items, labeler, dateGetter) {
    return `
      <div class="card-title"><h3>${esc(title)}</h3><span class="meta">${items.length}</span></div>
      <div class="update-list">
        ${items.length ? items.map((item) => `<div class="memo-item"><span class="memo-date">${esc(dateGetter ? dateGetter(item) : item.calendar_period || item.event_date || item.updated_at?.slice(0, 10) || "")}</span><span class="memo-title">${esc(labeler(item))}</span><span class="memo-type">→</span></div>`).join("") : `<div class="data-missing">暂无更新</div>`}
      </div>
    `;
  }

  function workbenchPage() {
    const selected = state.selectedCompanies.map((id) => D.companies[id]).filter(Boolean);
    const periods = selectedPeriods();
    const mode = selected.length <= 1 ? "single" : "multi";
    return `
      <div class="page-hero">
        <div><div class="crumbs">GameIntel / 信号工作台</div><h1 class="page-title">财报信号工作台</h1><div class="page-subtitle">v3：财务图表来自 GameIntel.v3 JSON；观点、原因、产品信号只展示人工写入内容，缺失时不自动补写。</div></div>
        <span class="pill">数据源：financial JSON</span>
      </div>
      ${selectorPanel(periods)}
      ${insightPanel(selected, periods, mode)}
      ${tabs()}
      ${mode === "single" ? singleCompany(selected[0], periods) : multiCompany(selected, periods)}
    `;
  }

  function selectorPanel(selected) {
    const periodOptions = allPeriods();
    return `
      <section class="card card-pad selector-panel">
        <div class="selector-topline">
          <div><div class="eyebrow">Selectors</div><h3>公司搜索 + 连续周期</h3></div>
          <div class="selector-summary"><div class="period-type-switch"><button class="active" type="button">自然年 Q</button><button type="button">年度汇总</button></div><div class="range-label">${esc(selected[0] || "-")} → ${esc(selected[selected.length - 1] || "-")} · ${selected.length} 个节点</div></div>
        </div>
        <div class="selector-stack">
          <div class="company-combobox">
            <div class="selector-label">公司选择</div>
            <input id="company-search" class="company-search-input" value="${esc(state.companyQuery)}" placeholder="输入腾讯、Tencent、0700.HK 或 NTES" autocomplete="off" />
            <div class="combo-menu" data-company-menu ${state.companyQuery ? "" : "hidden"}>
              ${companies().map((company) => `<button class="combo-option" data-pick-company="${esc(company.id)}" data-company-search="${esc(companySearchText(company))}" type="button"><span class="company-avatar">${esc(company.name_cn.slice(0, 1))}</span><span>${esc(company.name_cn)}</span><em>${esc(companyMeta(company))}</em></button>`).join("")}
              <div class="combo-empty" data-company-empty hidden>没有匹配公司</div>
            </div>
            <div class="selected-company-row">
              <button class="selection-clear-action" data-clear-companies="1" type="button">清空</button>
              <div class="selected-company-list">
                ${state.selectedCompanies.length ? state.selectedCompanies.map((id) => D.companies[id]).filter(Boolean).map((company) => `<button class="selected-company-chip" data-company="${esc(company.id)}" type="button"><span class="company-avatar">${esc(company.name_cn.slice(0, 1))}</span>${esc(company.name_cn)}<span>×</span></button>`).join("") : `<span class="selector-note">请选择公司</span>`}
              </div>
            </div>
            <div class="quick-company-row">
              <button class="quick-action" data-pick-tier="5" type="button">全选 Tier 5</button>
              ${companies().map((company) => `<button data-pick-company="${esc(company.id)}" type="button">${esc(company.name_cn)}</button>`).join("")}
            </div>
          </div>
          <div class="period-input-panel">
            <div class="selector-label">连续周期</div>
            <div class="period-input-grid">
              <label>开始周期<input id="start-period" list="period-options" value="${esc(state.start)}" placeholder="例如 2025Q4" autocomplete="off" /></label>
              <label>结束周期<input id="end-period" list="period-options" value="${esc(state.end)}" placeholder="例如 2026Q1" autocomplete="off" /></label>
            </div>
            <datalist id="period-options">${periodOptions.map((period) => `<option value="${esc(period)}"></option>`).join("")}</datalist>
          </div>
        </div>
      </section>
    `;
  }

  function insightPanel(selected, periods, mode) {
    if (!selected.length) return "";
    const end = periods[periods.length - 1];
    if (mode === "multi") {
      const summary = D.quarterly_summaries?.[end];
      return `
        <section class="card card-pad insight-panel">
          <div class="card-title"><h3>${esc(end)} 季度总结</h3><span class="meta">${summary ? esc(summary.source_path) : "pending"}</span></div>
          ${summary?.core_judgments?.length ? `<div class="insight-lines">${summary.core_judgments.map((line, index) => `<div class="insight-line"><span>${index + 1}</span><p>${esc(line)}</p></div>`).join("")}</div>` : `<div class="insight-empty-state">季度总结待补充</div>`}
        </section>
      `;
    }
    const company = selected[0];
    const row = latestRow(company, periods);
    const b = briefing(company.id, row?.calendar_period);
    return `
      <section class="card card-pad insight-panel">
        <div class="card-title"><h3>${esc(company.name_cn)} ${esc(row?.calendar_period || end)} Briefing</h3><span class="meta">${b ? esc(b.source_path) : "pending"}</span></div>
        ${b?.core_judgments?.length ? `<div class="insight-lines">${b.core_judgments.map((line, index) => `<div class="insight-line"><span>${index + 1}</span><p>${esc(line)}</p></div>`).join("")}</div>` : `<div class="insight-empty-state">观点待补充</div>`}
      </section>
    `;
  }

  function tabs() {
    return `
      <div class="workbench-tabs">
        <button class="${state.tab === "finance" ? "active" : ""}" data-tab="finance" type="button">财务数据</button>
        <button class="${state.tab === "otherFinance" ? "active" : ""}" data-tab="otherFinance" type="button">其他财务</button>
        <button class="${state.tab === "products" ? "active" : ""}" data-tab="products" type="button">产品情况</button>
        <button class="${state.tab === "strategy" ? "active" : ""}" data-tab="strategy" type="button">战略关键词</button>
      </div>
    `;
  }

  function singleCompany(company, periods) {
    if (!company) return `<section class="card card-pad empty-workbench"><h2>请选择公司</h2></section>`;
    const latest = latestRow(company, periods);
    if (!latest) return `<section class="card card-pad empty-workbench"><h2>所选周期暂无该公司数据</h2></section>`;
    if (state.tab === "otherFinance") return otherFinanceTab(company, periods, latest);
    if (state.tab === "products") return productsTab(company, latest);
    if (state.tab === "strategy") return strategyTab(company, periods, latest);
    return financeTab(company, periods, latest);
  }

  function financeTab(company, periods, latest) {
    const b = briefing(company.id, latest.calendar_period);
    return `
      <div class="tab-stack">
        ${metricPair(company, periods, latest, field(latest, "revenue_game_total"), b, "游戏收入")}
        ${metricPair(company, periods, latest, field(latest, "revenue_company_total"), b, "公司总营收")}
        ${customMetricPairs(company, periods, latest, b)}
        ${customRatioPpPairs(company, periods, latest, b)}
        ${profitExpensePair(company, periods, latest, b)}
        ${netEaseGameMarginPair(company, periods, latest, b)}
      </div>
    `;
  }

  function metricPair(company, periods, latest, totalField, b, title, note = "") {
    if (!totalField) return "";
    const groups = splitGroups(latest, totalField);
    const active = groups.find((group) => group.key === state.dimensions[totalField.field_id]) || groups[0] || null;
    const series = fieldSeries(company, periods, totalField.field_id);
    const formatValue = chartValueFormatter(totalField);
    const briefNote = b?.field_briefings?.[totalField.field_id] || totalField.field_briefing;
    const explain = typeof briefNote === "string" ? briefNote : briefNote?.briefing || "";
    const official = fieldExplanation(company.id, latest.calendar_period, totalField.field_id) || (
      totalField.official_explanation
        ? { official_explanation: totalField.official_explanation, source_doc: totalField.explanation_source_doc }
        : null
    );
    return `
      <section class="card card-pad metric-pair">
        <div class="metric-pair-head">
          <h2>${esc(title)}</h2>
          <div class="metric-head-actions">
            ${groups.length ? dimSwitch(totalField.field_id, groups, active.key) : ""}
          </div>
        </div>
        <div class="metric-combo-grid">
          <div class="metric-combo-panel">
            <div class="metric-combo-title"><span>绝对值</span><em>${valueText(totalField.value, totalField)}</em></div>
            ${active?.fields?.length > 1 ? stackedRevenueChart(company, periods, totalField, active.fields, title) : barChart(series.map((row) => ({ q: row.q, value: row.value })), [{ key: "value", label: title, color: COLORS[0] }], formatValue)}
          </div>
          <div class="metric-combo-panel">
            <div class="metric-combo-title"><span>YoY / QoQ</span><em>总体口径</em></div>
            ${lineChart(series.map((row) => ({ q: row.q, yoy: row.yoy, qoq: row.qoq })), [
              { key: "yoy", label: "YoY", color: COLORS[0] },
              { key: "qoq", label: "QoQ", color: COLORS[1] },
            ], (value) => fmtPct(value, true), "未披露 YoY/QoQ，且缺少上一期或去年同期数据用于计算")}
          </div>
        </div>
        ${metricNoteLine(totalField, note)}
        <div class="reason-text ${explain || official ? "" : "pending"}">
          <p>${esc(explain || "观点待补充")}</p>
          ${official ? `<p>${esc(official.official_explanation || "暂无解释")} <span class="dim">${esc(official.source_doc || "")}</span></p>` : ""}
        </div>
      </section>
    `;
  }

  function customChartConfigs(company) {
    return (D.chart_templates?.[company?.id] || [])
      .filter((item) => item?.field_id)
      .slice()
      .sort((a, b) => (a.order || 999) - (b.order || 999) || String(a.field_id).localeCompare(String(b.field_id)));
  }

  function customChartHasData(company, periods, fieldId) {
    return periods.some((period) => {
      const item = field(periodRow(company, period), fieldId);
      return item?.value !== null && item?.value !== undefined;
    });
  }

  function customMetricPairs(company, periods, latest, b) {
    return customChartConfigs(company)
      .filter((config) => config.chart_type === "metric_pair")
      .filter((config) => !isNetEaseGameMarginConfig(company, config))
      .filter((config) => field(latest, config.field_id) && customChartHasData(company, periods, config.field_id))
      .map((config) => metricPair(company, periods, latest, field(latest, config.field_id), b, config.title || field(latest, config.field_id)?.display_name || config.field_id, config.note || ""))
      .join("");
  }

  function customRatioPpPairs(company, periods, latest, b) {
    return customChartConfigs(company)
      .filter((config) => config.chart_type === "ratio_pp_pair")
      .filter((config) => field(latest, config.field_id) && customChartHasData(company, periods, config.field_id))
      .map((config) => ratioPpPair(company, periods, latest, field(latest, config.field_id), b, config.title || field(latest, config.field_id)?.display_name || config.field_id, config.note || ""))
      .join("");
  }

  function isNetEaseGameMarginConfig(company, config) {
    return company?.id === "NetEase_NTES" && config?.field_id === "ratio_gross_margin_game";
  }

  function netEaseGameMarginPair(company, periods, latest, b) {
    const config = customChartConfigs(company).find((item) => isNetEaseGameMarginConfig(company, item));
    const totalField = field(latest, "ratio_gross_margin_game");
    if (!config || !totalField || !customChartHasData(company, periods, "ratio_gross_margin_game")) return "";
    const data = ratioPpSeries(company, periods, "ratio_gross_margin_game", "毛利率");
    const briefNote = b?.field_briefings?.[totalField.field_id] || totalField.field_briefing;
    const explain = typeof briefNote === "string" ? briefNote : briefNote?.briefing || "";
    const official = fieldExplanation(company.id, latest.calendar_period, totalField.field_id) || (
      totalField.official_explanation
        ? { official_explanation: totalField.official_explanation, source_doc: totalField.explanation_source_doc }
        : null
    );
    return `
      <section class="card card-pad metric-pair">
        <div class="metric-pair-head">
          <h2>${esc(config.title || totalField.display_name || "游戏分部毛利率")}</h2>
        </div>
        <div class="metric-combo-grid">
          <div class="metric-combo-panel">
            <div class="metric-combo-title"><span>毛利率</span><em>${valueText(totalField.value, totalField)}</em></div>
            ${lineChart(data, [{ key: "value", label: totalField.display_name || "游戏分部毛利率", color: COLORS[0] }], fmtPct)}
          </div>
          <div class="metric-combo-panel">
            <div class="metric-combo-title"><span>YoY / QoQ</span><em>pp 变化</em></div>
            ${lineChart(data, [
              { key: "yoyPp", label: "YoY pp", color: COLORS[0] },
              { key: "qoqPp", label: "QoQ pp", color: COLORS[1] },
            ], fmtPp, "缺少上一期或去年同期毛利率数据用于计算 pp")}
          </div>
        </div>
        ${metricNoteLine(totalField, config.note || "")}
        <div class="reason-text ${explain || official ? "" : "pending"}">
          <p>${esc(explain || "观点待补充")}</p>
          ${official ? `<p>${esc(official.official_explanation || "暂无解释")} <span class="dim">${esc(official.source_doc || "")}</span></p>` : ""}
        </div>
      </section>
    `;
  }

  function ratioPpPair(company, periods, latest, totalField, b, title, note = "") {
    if (!totalField) return "";
    const data = ratioPpSeries(company, periods, totalField.field_id);
    const briefNote = b?.field_briefings?.[totalField.field_id] || totalField.field_briefing;
    const explain = typeof briefNote === "string" ? briefNote : briefNote?.briefing || "";
    const official = fieldExplanation(company.id, latest.calendar_period, totalField.field_id) || (
      totalField.official_explanation
        ? { official_explanation: totalField.official_explanation, source_doc: totalField.explanation_source_doc }
        : null
    );
    return `
      <section class="card card-pad metric-pair">
        <div class="metric-pair-head">
          <h2>${esc(title)}</h2>
        </div>
        <div class="metric-combo-grid">
          <div class="metric-combo-panel">
            <div class="metric-combo-title"><span>比例</span><em>${valueText(totalField.value, totalField)}</em></div>
            ${lineChart(data, [{ key: "value", label: totalField.display_name || title, color: COLORS[0] }], fmtPct)}
          </div>
          <div class="metric-combo-panel">
            <div class="metric-combo-title"><span>YoY / QoQ</span><em>pp 变化</em></div>
            ${lineChart(data, [
              { key: "yoyPp", label: "YoY pp", color: COLORS[0] },
              { key: "qoqPp", label: "QoQ pp", color: COLORS[1] },
            ], fmtPp, "缺少上一期或去年同期比例数据用于计算 pp")}
          </div>
        </div>
        ${metricNoteLine(totalField, note)}
        <div class="reason-text ${explain || official ? "" : "pending"}">
          <p>${esc(explain || "观点待补充")}</p>
          ${official ? `<p>${esc(official.official_explanation || "暂无解释")} <span class="dim">${esc(official.source_doc || "")}</span></p>` : ""}
        </div>
      </section>
    `;
  }

  function customChartFieldIds(company, periods, latest) {
    return new Set(customChartConfigs(company)
      .filter((config) => field(latest, config.field_id) && customChartHasData(company, periods, config.field_id))
      .map((config) => config.field_id));
  }

  function profitExpensePair(company, periods, latest, b) {
    const fields = Object.values(latest.fields || {}).filter((item) => isRatioField(item) && item.metric_type === "ratio");
    const feeRatios = FEE_RATIO_IDS
      .map((id) => field(latest, id))
      .filter(Boolean)
      .filter((item, index, arr) => arr.findIndex((x) => x.field_id === item.field_id) === index);
    const profitRatios = PROFIT_RATIO_IDS
      .map((id) => field(latest, id))
      .filter(Boolean)
      .filter((item, index, arr) => arr.findIndex((x) => x.field_id === item.field_id) === index);
    const fallbackProfitRatios = fields
      .filter((item) => !feeRatios.some((fee) => fee.field_id === item.field_id))
      .filter((item) => /margin|毛利率|利润率|EBITDA率|净利率/.test(`${item.field_id} ${item.display_name}`));
    const marginRatios = profitRatios.length ? profitRatios : fallbackProfitRatios;
    const feeData = periods.map((period) => {
      const row = periodRow(company, period);
      const out = { q: period };
      feeRatios.forEach((item) => {
        const actual = field(row, item.field_id);
        const abs = field(row, numeratorId(actual || item));
        out[item.field_id] = actual?.value ?? null;
        out[`${item.field_id}__tip`] = `${period} ${item.display_name} ${fmtPct(actual?.value)}${abs ? `\n${abs.display_name}: ${fmtMoney(abs.value)}` : ""}`;
      });
      return out;
    });
    return `
      <section class="card card-pad metric-pair">
        <div class="metric-pair-head"><h2>利润及费用</h2></div>
        <div class="metric-combo-grid">
          <div class="metric-combo-panel">
            <div class="metric-combo-title"><span>费用率 / 成本结构</span><em>${feeRatios.length} fields</em></div>
            ${lineChart(feeData, feeRatios.slice(0, 6).map((item, index) => ({ key: item.field_id, label: item.display_name, color: COLORS[index] })), fmtPct)}
          </div>
          <div class="metric-combo-panel">
            <div class="metric-combo-title"><span>利润率</span><em>${marginRatios.length} fields</em></div>
            ${lineChart(periods.map((period) => {
              const row = periodRow(company, period);
              const out = { q: period };
              marginRatios.slice(0, 4).forEach((item) => {
                const actual = field(row, item.field_id);
                const abs = field(row, numeratorId(actual || item));
                out[item.field_id] = actual?.value ?? null;
                out[`${item.field_id}__tip`] = `${period} ${item.display_name} ${fmtPct(actual?.value)}${abs ? `\n${abs.display_name}: ${fmtMoney(abs.value)}` : ""}`;
              });
              return out;
            }), marginRatios.slice(0, 4).map((item, index) => ({ key: item.field_id, label: item.display_name, color: COLORS[index] })), fmtPct)}
          </div>
        </div>
      </section>
    `;
  }

  function mainFinanceFieldIds(company, periods, latest) {
    const ids = new Set();
    ["revenue_game_total", "revenue_company_total"].forEach((id) => {
      const total = field(latest, id);
      if (!total) return;
      ids.add(id);
      splitGroups(latest, total).forEach((group) => group.fields.forEach((item) => ids.add(item.field_id)));
    });
    const ratios = Object.values(latest.fields || {}).filter((item) => isRatioField(item) && item.metric_type === "ratio");
    const fees = FEE_RATIO_IDS
      .map((id) => field(latest, id))
      .filter(Boolean)
      .filter((item, index, arr) => arr.findIndex((x) => x.field_id === item.field_id) === index);
    const marginRatios = PROFIT_RATIO_IDS
      .map((id) => field(latest, id))
      .filter(Boolean)
      .filter((item, index, arr) => arr.findIndex((x) => x.field_id === item.field_id) === index);
    fees.forEach((item) => ids.add(item.field_id));
    marginRatios.slice(0, 4).forEach((item) => ids.add(item.field_id));
    customChartFieldIds(company, periods, latest).forEach((id) => ids.add(id));
    return ids;
  }

  function otherFinanceRows(company, periods, latest) {
    const shown = mainFinanceFieldIds(company, periods, latest);
    const byId = new Map();
    periods.forEach((period) => {
      const row = periodRow(company, period);
      Object.values(row?.fields || {}).forEach((item) => {
        if (shown.has(item.field_id)) return;
        if (item.value === null || item.value === undefined) return;
        if (!byId.has(item.field_id)) byId.set(item.field_id, item);
      });
    });
    return Array.from(byId.values()).sort((a, b) => {
      const importance = { core: 0, watch: 1 };
      const type = { revenue: 0, profit: 1, expense: 2, ratio: 3 };
      return (importance[a.importance] ?? 9) - (importance[b.importance] ?? 9)
        || (type[a.metric_type] ?? 9) - (type[b.metric_type] ?? 9)
        || String(a.display_name || a.field_id).localeCompare(String(b.display_name || b.field_id), "zh-CN");
    });
  }

  function fieldGrowth(company, period, fieldId) {
    const item = field(periodRow(company, period), fieldId);
    const previous = field(periodRow(company, previousQuarter(period)), fieldId);
    const lastYear = field(periodRow(company, previousYearQuarter(period)), fieldId);
    return {
      item,
      yoy: item?.reported_yoy ?? computedGrowth(item, lastYear),
      qoq: item?.reported_qoq ?? computedGrowth(item, previous),
    };
  }

  function fieldSourceSummary(company, periods, fieldId) {
    const sourcePeriods = new Map();
    periods.forEach((period) => {
      const item = field(periodRow(company, period), fieldId);
      if (!item) return;
      const source = item.source_doc || item.template_note || "";
      if (!source) return;
      if (!sourcePeriods.has(source)) sourcePeriods.set(source, []);
      sourcePeriods.get(source).push(period);
    });
    return Array.from(sourcePeriods.entries())
      .map(([source, usedPeriods]) => `${source} (${usedPeriods.join(", ")})`)
      .join("; ");
  }

  function otherFinanceColumns(periods) {
    return [
      { key: "field", type: "field", label: "字段" },
      ...periods.flatMap((period) => [
        { key: `${period}:value`, type: "value", label: "数值", period },
        { key: `${period}:yoy`, type: "yoy", label: "YoY", period },
        { key: `${period}:qoq`, type: "qoq", label: "QoQ", period },
      ]),
      { key: "source", type: "source", label: "来源 / 口径" },
    ];
  }

  function otherFinanceColumnWidth(key, type) {
    return state.otherFinanceWidths[key] || OTHER_FINANCE_DEFAULT_WIDTHS[type] || 100;
  }

  function otherFinanceTableWidth(periods) {
    return otherFinanceColumns(periods).reduce((sum, column) => sum + otherFinanceColumnWidth(column.key, column.type), 0);
  }

  function resizeHandle(key) {
    return `<span class="col-resize-handle" data-resize-col="${esc(key)}" aria-hidden="true"></span>`;
  }

  function otherFinanceTab(company, periods, latest) {
    const rows = otherFinanceRows(company, periods, latest);
    if (!rows.length) return `<section class="card card-pad empty-workbench"><h2>暂无其他财务字段</h2></section>`;
    const tableWidth = Math.max(1280, otherFinanceTableWidth(periods));
    return `
      <section class="card card-pad">
        <div class="card-title">
          <h3>其他财务</h3>
          <span class="meta">${esc(company.name_cn)} · ${rows.length} 个字段</span>
        </div>
        <div class="other-finance-scrollbar" data-other-scrollbar><div style="width:${tableWidth}px"></div></div>
        <div class="product-table-wrap other-finance-wrap" data-other-scroll>
          <table class="tbl other-finance-table" style="width:${tableWidth}px; min-width:${tableWidth}px">
            <colgroup>
              <col data-col-key="field" style="width:${otherFinanceColumnWidth("field", "field")}px">
              ${periods.map((period) => `
                <col data-col-key="${esc(`${period}:value`)}" style="width:${otherFinanceColumnWidth(`${period}:value`, "value")}px">
                <col data-col-key="${esc(`${period}:yoy`)}" style="width:${otherFinanceColumnWidth(`${period}:yoy`, "yoy")}px">
                <col data-col-key="${esc(`${period}:qoq`)}" style="width:${otherFinanceColumnWidth(`${period}:qoq`, "qoq")}px">
              `).join("")}
              <col data-col-key="source" style="width:${otherFinanceColumnWidth("source", "source")}px">
            </colgroup>
            <thead>
              <tr>
                <th class="sticky-col resizable-th">字段${resizeHandle("field")}</th>
                ${periods.map((period) => `<th class="num" colspan="3">${esc(period)}</th>`).join("")}
                <th class="resizable-th">来源 / 口径${resizeHandle("source")}</th>
              </tr>
              <tr>
                <th class="sticky-col subhead"></th>
                ${periods.map((period) => `<th class="num resizable-th">数值${resizeHandle(`${period}:value`)}</th><th class="num resizable-th">YoY${resizeHandle(`${period}:yoy`)}</th><th class="num resizable-th">QoQ${resizeHandle(`${period}:qoq`)}</th>`).join("")}
                <th class="subhead"></th>
              </tr>
            </thead>
            <tbody>
              ${rows.map((template) => `<tr>
                <td class="sticky-col"><strong>${esc(template.display_name || template.field_id)}</strong><small>${esc(template.field_id)}</small></td>
                ${periods.map((period) => {
                  const { item, yoy, qoq } = fieldGrowth(company, period, template.field_id);
                  const title = item ? `${item.display_name || item.field_id}\n${period}: ${valueText(item.value, item)}\nYoY: ${fmtPct(yoy, true)}\nQoQ: ${fmtPct(qoq, true)}` : "";
                  return `<td class="num" title="${tip(title)}">${item ? valueText(item.value, item) : "-"}</td><td class="num muted-num" title="${tip(title)}">${fmtPct(yoy, true)}</td><td class="num muted-num" title="${tip(title)}">${fmtPct(qoq, true)}</td>`;
                }).join("")}
                <td title="${tip(fieldSourceSummary(company, periods, template.field_id))}">${esc(fieldSourceSummary(company, periods, template.field_id))}</td>
              </tr>`).join("")}
            </tbody>
          </table>
        </div>
      </section>
    `;
  }

  function productsTab(company, latest) {
    const rows = Object.values(latest.fields || {}).filter((item) => item.business_scope === "product" || /^gross_receipts_product_/.test(item.field_id || ""));
    if (!rows.length) return `<section class="card card-pad empty-workbench"><h2>产品情况待补充</h2></section>`;
    return `<section class="card card-pad"><div class="card-title"><h3>产品情况</h3><span class="meta">${company.name_cn} ${latest.calendar_period}</span></div><div class="product-table-wrap"><table class="tbl"><thead><tr><th>产品/指标</th><th class="num">数值</th><th class="num">YoY</th><th>来源</th></tr></thead><tbody>${rows.map((item) => `<tr><td>${esc(item.display_name)}</td><td class="num">${valueText(item.value, item)}</td><td class="num">${fmtPct(item.reported_yoy, true)}</td><td>${esc(item.source_doc || "")}</td></tr>`).join("")}</tbody></table></div></section>`;
  }

  function strategyKeywordsFor(company, period) {
    const b = briefing(company.id, period);
    const sortedEvents = eventsFor(company.id, period).slice().sort((a, bEvent) => {
      const aDate = a.event_date || a.date || a.source_path || a.id || "";
      const bDate = bEvent.event_date || bEvent.date || bEvent.source_path || bEvent.id || "";
      return String(bDate).localeCompare(String(aDate));
    });
    const fromBriefing = Array.isArray(b?.strategy_keywords) ? b.strategy_keywords : [];
    const fromEvent = fromBriefing.length ? [] : (sortedEvents.find((event) => event.event_type === "earnings_release" && event.strategy_keywords?.length)?.strategy_keywords || []);
    const seen = new Set();
    const keywords = [...fromBriefing, ...fromEvent].map((keyword) => String(keyword || "").trim()).filter((keyword) => {
      if (!keyword || seen.has(keyword)) return false;
      seen.add(keyword);
      return true;
    });
    const eventSource = sortedEvents.find((event) => event.event_type === "earnings_release" && event.strategy_keywords?.length)?.source_path || "";
    const source = fromBriefing.length ? b?.source_path || "briefing" : eventSource;
    return { keywords, source };
  }

  function strategyTab(company, periods, latest) {
    const rows = periods.slice().sort((a, b) => periodRank(b) - periodRank(a)).map((period) => {
      const data = strategyKeywordsFor(company, period);
      return { period, ...data };
    }).filter((row) => row.keywords.length);
    return `
      <section class="card card-pad">
        <div class="card-title">
          <h3>战略关键词</h3>
          <span class="meta">${esc(company.name_cn)} · 新 → 旧</span>
        </div>
        ${rows.length ? `<div class="strategy-period-list">
          ${rows.map((row) => `<div class="strategy-period">
            <div class="strategy-period-head">
              <strong>${esc(row.period)}</strong>
              <span>${esc(row.source || "")}</span>
            </div>
            <div class="kw-row">${row.keywords.map((tag) => `<span class="kw kw-strategy">${esc(tag)}</span>`).join("")}</div>
          </div>`).join("")}
        </div>` : `<div class="data-missing">战略关键词待补充</div>`}
      </section>
    `;
  }

  function multiCompany(selected, periods) {
    if (state.tab !== "finance") return `<section class="card card-pad empty-workbench"><h2>多公司 ${state.tab === "products" ? "产品情况" : state.tab === "otherFinance" ? "其他财务" : "战略关键词"}待开发</h2></section>`;
    const tags = Object.keys(D.comparable_tags || {}).filter((tag) => comparableCoverage(selected, periods, tag) >= 2);
    if (!tags.length) return `<section class="card card-pad empty-workbench"><h2>所选公司暂无可比指标</h2></section>`;
    return `<div class="tab-stack">${tags.map((tag) => comparableCard(selected, periods, tag)).join("")}</div>`;
  }

  function comparableCoverage(selected, periods, tag) {
    return selected.filter((company) => periods.some((period) => {
      const item = fieldByTag(periodRow(company, period), tag);
      return item?.value !== null && item?.value !== undefined;
    })).length;
  }

  function comparableCard(selected, periods, tag) {
    const meta = D.comparable_tags?.[tag] || { label: tag };
    const data = periods.map((period) => {
      const out = { q: period };
      selected.forEach((company) => {
        const f = fieldByTag(periodRow(company, period), tag);
        out[company.id] = tag.includes("growth") ? f?.reported_yoy ?? null : f?.value ?? null;
      });
      return out;
    });
    return `<section class="card card-pad metric-pair"><div class="metric-pair-head"><h2>${esc(meta.label)}</h2><span class="meta">${esc(tag)}</span></div>${lineChart(data, selected.map((company, index) => ({ key: company.id, label: company.name_cn, color: COLORS[index % COLORS.length] })), tag.includes("growth") ? (value) => fmtPct(value, true) : fmtPct)}</section>`;
  }

  function dimSwitch(fieldId, groups, activeKey) {
    return `<div class="dim-switch">${groups.map((group) => `<button class="${group.key === activeKey ? "active" : ""}" data-dim-field="${esc(fieldId)}" data-dim="${esc(group.key)}" type="button">${esc(group.key)}</button>`).join("")}</div>`;
  }

  function lineChart(data, series, formatY, emptyText = "暂无数据") {
    const w = 520;
    const h = 240;
    const pad = { t: 24, r: 18, b: 34, l: 50 };
    const values = series.flatMap((s) => data.map((d) => d[s.key])).filter((v) => v !== null && v !== undefined && !Number.isNaN(Number(v))).map(Number);
    if (!values.length) return `<div class="data-missing">${esc(emptyText)}</div>`;
    const max = Math.max(...values);
    const min = Math.min(0, ...values);
    const span = Math.max(max - min, Math.abs(max) * 0.2, 0.01);
    const yMax = max + span * 0.12;
    const yMin = min < 0 ? min - span * 0.12 : 0;
    const x = (i) => pad.l + ((w - pad.l - pad.r) * i) / Math.max(data.length - 1, 1);
    const y = (v) => pad.t + (1 - (v - yMin) / (yMax - yMin)) * (h - pad.t - pad.b);
    const ticks = [0, 0.33, 0.66, 1].map((r) => yMin + (yMax - yMin) * r);
    return `<div class="chart-area"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">
      ${ticks.map((t) => `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y(t)}" y2="${y(t)}" class="grid-line"></line><text x="${pad.l - 8}" y="${y(t)}" class="axis-label" text-anchor="end">${esc(formatY(t))}</text>`).join("")}
      ${data.map((d, i) => `<text x="${x(i)}" y="${h - 12}" class="axis-label" text-anchor="middle">${esc(d.q)}</text>`).join("")}
      ${series.map((s) => {
        const pts = data.map((d, i) => d[s.key] === null || d[s.key] === undefined ? null : [x(i), y(d[s.key]), d]).filter(Boolean);
        if (!pts.length) return "";
        return `<path d="${pts.map((p, i) => `${i ? "L" : "M"}${p[0]},${p[1]}`).join(" ")}" stroke="${s.color}" stroke-width="2" fill="none" stroke-linecap="round"></path>${pts.map((p) => `<circle class="chart-hotspot" data-tip="${tip(p[2][`${s.key}__tip`] || `${p[2].q} ${s.label} ${formatY(p[2][s.key])}`)}" cx="${p[0]}" cy="${p[1]}" r="4" fill="#fff" stroke="${s.color}" stroke-width="2"></circle>`).join("")}`;
      }).join("")}
    </svg><div class="chart-legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join("")}</div></div>`;
  }

  function barChart(data, series, formatY) {
    const w = 520;
    const h = 240;
    const pad = { t: 24, r: 18, b: 34, l: 50 };
    const values = series.flatMap((s) => data.map((d) => d[s.key])).filter((v) => v !== null && v !== undefined).map(Number);
    if (!values.length) return `<div class="data-missing">暂无数据</div>`;
    const max = Math.max(...values, 0);
    const min = Math.min(...values, 0);
    const yMax = max + (max - min || max || 1) * 0.12;
    const yMin = min < 0 ? min * 1.2 : 0;
    const y = (v) => pad.t + (1 - (v - yMin) / (yMax - yMin || 1)) * (h - pad.t - pad.b);
    const groupW = (w - pad.l - pad.r) / Math.max(data.length, 1);
    const barW = (groupW * 0.62) / series.length;
    const y0 = y(0);
    const ticks = [0, 0.33, 0.66, 1].map((r) => yMin + (yMax - yMin) * r);
    return `<div class="chart-area"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">
      ${ticks.map((t) => `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y(t)}" y2="${y(t)}" class="grid-line"></line><text x="${pad.l - 8}" y="${y(t)}" class="axis-label" text-anchor="end">${esc(formatY(t))}</text>`).join("")}
      ${data.map((d, i) => {
        const cx = pad.l + groupW * i + groupW / 2;
        const bars = series.map((s, si) => {
          const v = d[s.key];
          if (v === null || v === undefined) return "";
          const bx = cx - (barW * series.length) / 2 + si * barW + 1;
          const by = v >= 0 ? y(v) : y0;
          const labelY = Math.max(12, by - 7);
          return `<rect class="chart-hotspot" data-tip="${tip(`${d.q} ${s.label}\n${formatY(v)}`)}" x="${bx}" y="${by}" width="${barW - 2}" height="${Math.abs(y(v) - y0)}" rx="3" fill="${s.color}"></rect><text class="chart-value-label" x="${bx + (barW - 2) / 2}" y="${labelY}" text-anchor="middle">${esc(formatY(v))}</text>`;
        }).join("");
        return `${bars}<text x="${cx}" y="${h - 12}" class="axis-label" text-anchor="middle">${esc(d.q)}</text>`;
      }).join("")}
    </svg><div class="chart-legend">${series.map((s) => `<span><i style="background:${s.color}"></i>${esc(s.label)}</span>`).join("")}</div></div>`;
  }

  function stackedRevenueChart(company, periods, totalField, splitFields, totalLabel) {
    const data = periods.map((period) => {
      const row = periodRow(company, period);
      const total = field(row, totalField.field_id)?.value ?? null;
      const segments = splitFields.map((template, index) => {
        const actual = field(row, template.field_id);
        return { name: template.display_name, value: actual?.value ?? null, color: COLORS[index % COLORS.length] };
      }).filter((item) => item.value !== null && item.value !== undefined);
      const segmentSum = segments.reduce((sum, item) => sum + Number(item.value || 0), 0);
      const residual = total !== null && total !== undefined ? Number(total) - segmentSum : 0;
      const tolerance = Math.max(Math.abs(Number(total || 0)) * 0.005, 1e-6);
      if (residual > tolerance) {
        segments.push({ name: "未拆分收入", value: residual, color: COLORS[segments.length % COLORS.length] });
      }
      return { q: period, total, segments };
    });
    const max = Math.max(...data.map((row) => Math.max(row.total || 0, row.segments.reduce((sum, s) => sum + s.value, 0))), 0);
    if (!max) return `<div class="data-missing">暂无拆分数据</div>`;
    const w = 520;
    const h = 240;
    const pad = { t: 24, r: 18, b: 34, l: 50 };
    const yMax = max * 1.18;
    const groupW = (w - pad.l - pad.r) / Math.max(data.length, 1);
    const barW = groupW * 0.52;
    const y = (v) => pad.t + (1 - v / yMax) * (h - pad.t - pad.b);
    const ticks = [0, 0.33, 0.66, 1].map((r) => yMax * r);
    const names = Array.from(new Set(data.flatMap((row) => row.segments.map((s) => s.name))));
    return `<div class="chart-area"><svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="xMidYMid meet">
      ${ticks.map((t) => `<line x1="${pad.l}" x2="${w - pad.r}" y1="${y(t)}" y2="${y(t)}" class="grid-line"></line><text x="${pad.l - 8}" y="${y(t)}" class="axis-label" text-anchor="end">${esc(fmtMoney(t))}</text>`).join("")}
      ${data.map((row, i) => {
        const cx = pad.l + groupW * i + groupW / 2;
        let acc = 0;
        const rects = row.segments.map((s) => {
          const top = y(acc + s.value);
          const bottom = y(acc);
          acc += s.value;
          return `<rect class="chart-hotspot" data-tip="${tip(`${row.q} ${s.name}\n绝对值: ${fmtMoney(s.value)}\n占比: ${fmtPct(row.total ? s.value / row.total : null)}`)}" x="${cx - barW / 2}" y="${top}" width="${barW}" height="${Math.max(0, bottom - top)}" rx="3" fill="${s.color}"></rect>`;
        }).join("");
        const total = row.total || acc;
        const labelY = Math.max(12, y(total) - 7);
        return `${rects}<text class="chart-value-label" x="${cx}" y="${labelY}" text-anchor="middle">${esc(fmtMoney(total))}</text><text x="${cx}" y="${h - 12}" class="axis-label" text-anchor="middle">${esc(row.q)}</text>`;
      }).join("")}
    </svg><div class="chart-legend"><span><i style="background:#1e2230"></i>${esc(totalLabel)}</span>${names.map((name, index) => `<span><i style="background:${COLORS[index % COLORS.length]}"></i>${esc(name)}</span>`).join("")}</div></div>`;
  }

  function placeholder(title, text) {
    return `<div class="page-hero"><div><div class="crumbs">GameIntel / ${esc(title)}</div><h1 class="page-title">${esc(title)}</h1><div class="page-subtitle">${esc(text)}</div></div></div><section class="card card-pad empty-workbench"><h2>${esc(text)}</h2></section>`;
  }

  function bind() {
    document.querySelectorAll("[data-nav]").forEach((button) => button.addEventListener("click", () => setPage(button.dataset.nav)));
    document.querySelectorAll("[data-tab]").forEach((button) => button.addEventListener("click", () => { state.tab = button.dataset.tab; render(); }));
    document.querySelectorAll("[data-company]").forEach((button) => button.addEventListener("click", () => { state.selectedCompanies = state.selectedCompanies.filter((id) => id !== button.dataset.company); render(); }));
    document.querySelectorAll("[data-pick-company]").forEach((button) => button.addEventListener("click", () => { const id = button.dataset.pickCompany; if (!state.selectedCompanies.includes(id)) state.selectedCompanies.push(id); state.companyQuery = ""; render(); }));
    document.querySelectorAll(".combo-option").forEach((button) => button.addEventListener("mousedown", (event) => event.preventDefault()));
    document.querySelectorAll("[data-pick-tier]").forEach((button) => button.addEventListener("click", () => {
      const tier = Number(button.dataset.pickTier);
      state.selectedCompanies = companies().filter((company) => Number(company.tier) === tier).map((company) => company.id);
      state.companyQuery = "";
      render();
    }));
    document.querySelectorAll("[data-clear-companies]").forEach((button) => button.addEventListener("click", () => {
      state.selectedCompanies = [];
      state.companyQuery = "";
      render();
    }));
    document.querySelectorAll("[data-dim-field]").forEach((button) => button.addEventListener("click", () => { state.dimensions[button.dataset.dimField] = button.dataset.dim; render(); }));
    const search = document.getElementById("company-search");
    if (search) {
      search.addEventListener("focus", () => filterCompanyMenu(search, true));
      search.addEventListener("input", (event) => {
        state.companyQuery = event.target.value;
        filterCompanyMenu(search, true);
      });
      search.addEventListener("blur", () => {
        window.setTimeout(() => {
          const menu = document.querySelector("[data-company-menu]");
          if (menu) menu.hidden = true;
        }, 120);
      });
      filterCompanyMenu(search, Boolean(state.companyQuery));
    }
    const periods = new Set(allPeriods());
    const bindPeriodInput = (id, key) => {
      const input = document.getElementById(id);
      if (!input) return;
      const commit = () => {
        const value = input.value.trim().toUpperCase();
        if (!periods.has(value) || state[key] === value) return;
        state[key] = value;
        render();
      };
      input.addEventListener("input", commit);
      input.addEventListener("change", commit);
      input.addEventListener("keydown", (event) => {
        if (event.key === "Enter") commit();
      });
    };
    bindPeriodInput("start-period", "start");
    bindPeriodInput("end-period", "end");
    bindOtherFinanceTable();
    bindTooltips();
  }

  function filterCompanyMenu(input, open) {
    const menu = document.querySelector("[data-company-menu]");
    if (!menu) return;
    const query = String(input?.value || "").trim().toLowerCase();
    let count = 0;
    menu.querySelectorAll(".combo-option").forEach((option) => {
      const matched = !query || (option.dataset.companySearch || "").includes(query);
      option.hidden = !matched;
      if (matched) count += 1;
    });
    const empty = menu.querySelector("[data-company-empty]");
    if (empty) empty.hidden = count > 0;
    menu.hidden = !open && !query;
  }

  function bindOtherFinanceTable() {
    const scroller = document.querySelector("[data-other-scroll]");
    const topScroller = document.querySelector("[data-other-scrollbar]");
    if (scroller && topScroller) {
      let syncing = false;
      topScroller.addEventListener("scroll", () => {
        if (syncing) return;
        syncing = true;
        scroller.scrollLeft = topScroller.scrollLeft;
        syncing = false;
      });
      scroller.addEventListener("scroll", () => {
        if (syncing) return;
        syncing = true;
        topScroller.scrollLeft = scroller.scrollLeft;
        syncing = false;
      });
    }

    document.querySelectorAll("[data-resize-col]").forEach((handle) => {
      handle.addEventListener("mousedown", (event) => {
        event.preventDefault();
        event.stopPropagation();
        const key = handle.dataset.resizeCol;
        const startX = event.clientX;
        const type = key === "field" || key === "source" ? key : key.split(":")[1];
        const minWidth = type === "field" ? 180 : type === "source" ? 150 : 58;
        const startWidth = otherFinanceColumnWidth(key, type);
        document.body.classList.add("is-resizing-col");

        const applyWidth = (width) => {
          const next = Math.max(minWidth, Math.min(460, width));
          state.otherFinanceWidths[key] = next;
          document.querySelectorAll("[data-col-key]").forEach((col) => {
            if (col.dataset.colKey === key) col.style.width = `${next}px`;
          });
          const widthNow = Math.max(1280, otherFinanceTableWidth(selectedPeriods()));
          document.querySelectorAll(".other-finance-table").forEach((table) => {
            table.style.width = `${widthNow}px`;
            table.style.minWidth = `${widthNow}px`;
          });
          document.querySelectorAll("[data-other-scrollbar] > div").forEach((inner) => {
            inner.style.width = `${widthNow}px`;
          });
        };

        const onMove = (moveEvent) => applyWidth(startWidth + moveEvent.clientX - startX);
        const onUp = () => {
          document.body.classList.remove("is-resizing-col");
          window.removeEventListener("mousemove", onMove);
          window.removeEventListener("mouseup", onUp);
        };
        window.addEventListener("mousemove", onMove);
        window.addEventListener("mouseup", onUp);
      });
    });
  }

  function bindTooltips() {
    let node = document.querySelector(".chart-tooltip");
    if (!node) {
      node = document.createElement("div");
      node.className = "chart-tooltip";
      document.body.appendChild(node);
    }
    document.querySelectorAll(".chart-hotspot").forEach((hotspot) => {
      hotspot.addEventListener("mouseenter", () => { node.textContent = hotspot.dataset.tip || ""; node.classList.add("show"); });
      hotspot.addEventListener("mousemove", (event) => { node.style.left = `${event.clientX + 14}px`; node.style.top = `${event.clientY + 14}px`; });
      hotspot.addEventListener("mouseleave", () => node.classList.remove("show"));
    });
  }

  window.addEventListener("hashchange", () => {
    state.page = location.hash.replace("#", "") || "home";
    render();
  });

  init();
})();
