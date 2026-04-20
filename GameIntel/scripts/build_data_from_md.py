from __future__ import annotations

import json
import re
from datetime import datetime
from pathlib import Path


QUARTER_RE = re.compile(r"^(\d{4})(Q[1-4])\.md$")
COLOR_BY_SEGMENT = {
    "Domestic": "var(--c1)",
    "Overseas": "var(--c2)",
    "VAS": "var(--c1)",
    "Social Networks": "var(--c5)",
    "Marketing Services": "var(--c2)",
    "FinTech and Business Services": "var(--c3)",
    "Others": "var(--c4)",
}


def find_vault_root() -> Path:
    current = Path(__file__).resolve()
    for parent in current.parents:
        if parent.name == "Obsidian Vault":
            return parent
    raise RuntimeError("Cannot find 'Obsidian Vault' in script path.")


def read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8-sig")


def parse_scalar(raw: str):
    value = raw.strip()
    if value == "" or value.lower() in {"null", "none"}:
        return None
    if (value.startswith('"') and value.endswith('"')) or (value.startswith("'") and value.endswith("'")):
        return value[1:-1]
    if re.fullmatch(r"-?\d+", value):
        return int(value)
    if re.fullmatch(r"-?\d+\.\d+", value):
        return float(value)
    if value == "[]":
        return []
    return value


def parse_frontmatter(text: str) -> tuple[dict, str]:
    match = re.match(r"^---\s*\n(.*?)\n---\s*\n?(.*)$", text, re.S)
    if not match:
        return {}, text

    props: dict[str, object] = {}
    lines = match.group(1).splitlines()
    i = 0
    while i < len(lines):
        line = lines[i]
        if not line.strip() or line.startswith(" "):
            i += 1
            continue
        if ":" not in line:
            i += 1
            continue
        key, raw_value = line.split(":", 1)
        key = key.strip()
        raw_value = raw_value.strip()
        if raw_value == "":
            items = []
            j = i + 1
            while j < len(lines) and lines[j].startswith("  - "):
                items.append(parse_scalar(lines[j][4:]))
                j += 1
            props[key] = items if items else None
            i = j
            continue
        props[key] = parse_scalar(raw_value)
        i += 1

    return props, match.group(2)


def clean_wikilinks(text: str | None) -> str:
    if not text:
        return ""
    text = re.sub(r"\[\[([^\]|]+)(?:\|[^\]]+)?\]\]", r"\1", text)
    return text.strip()


def clean_list(values) -> list[str]:
    if not values:
        return []
    if not isinstance(values, list):
        values = [values]
    return [clean_wikilinks(str(v)) for v in values if v not in {None, ""}]


def parse_number(value):
    if value is None:
        return None
    text = str(value).strip()
    if text == "" or text.lower() == "null":
        return None
    try:
        return float(text)
    except ValueError:
        return None


def section_name(line: str) -> str | None:
    match = re.match(r"^(#{2,3})\s+(.+?)\s*$", line)
    if not match:
        return None
    return re.sub(r"^[一二三四五六七八九十]+、", "", match.group(2)).strip()


def split_table_row(line: str) -> list[str]:
    return [cell.strip() for cell in line.strip().strip("|").split("|")]


def is_separator(cells: list[str]) -> bool:
    return all(re.fullmatch(r":?-{3,}:?", cell.strip()) for cell in cells)


def parse_tables(body: str) -> list[dict]:
    tables = []
    current_section = ""
    lines = body.splitlines()
    i = 0
    while i < len(lines):
        heading = section_name(lines[i])
        if heading:
            current_section = heading
            i += 1
            continue
        if not lines[i].strip().startswith("|"):
            i += 1
            continue
        header = split_table_row(lines[i])
        if i + 1 >= len(lines):
            i += 1
            continue
        sep = split_table_row(lines[i + 1])
        if not is_separator(sep):
            i += 1
            continue
        rows = []
        i += 2
        while i < len(lines) and lines[i].strip().startswith("|"):
            cells = split_table_row(lines[i])
            if len(cells) < len(header):
                cells += [""] * (len(header) - len(cells))
            rows.append(dict(zip(header, cells)))
            i += 1
        tables.append({"section": current_section, "headers": header, "rows": rows})
    return tables


def rows_by_metric(tables: list[dict], metric_name: str) -> list[dict]:
    out = []
    for table in tables:
        for row in table["rows"]:
            if row.get("Metric_Name") == metric_name:
                out.append(row)
    return out


def first_metric_value(tables: list[dict], metric_name: str, segment: str = "Total"):
    for row in rows_by_metric(tables, metric_name):
        if row.get("Segment", "Total") == segment:
            return parse_number(row.get("Value (Million)") or row.get("Value"))
    return None


def metric_segments(tables: list[dict], metric_name: str, exclude_total: bool = True) -> list[dict]:
    segments = []
    for row in rows_by_metric(tables, metric_name):
        name = row.get("Segment") or "Total"
        if exclude_total and name == "Total":
            continue
        if metric_name == "Revenue_Company" and name == "Social Networks":
            # Social Networks is a VAS sub-item in Tencent disclosures, so
            # stacking it with VAS would double-count company revenue.
            continue
        value = parse_number(row.get("Value (Million)") or row.get("Value"))
        if value is None:
            continue
        segments.append({
            "name": name,
            "value": value,
            "color": COLOR_BY_SEGMENT.get(name, "var(--c5)"),
        })
    return segments


def parse_expense_table(tables: list[dict]) -> dict:
    out = {}
    for table in tables:
        if "Metric_Name" not in table["headers"] or "占Revenue_Company比例" not in table["headers"]:
            continue
        for row in table["rows"]:
            key = row.get("Metric_Name")
            if key == "Sales&Marketing":
                out["sm_abs"] = parse_number(row.get("Value (Million)"))
                out["sm"] = parse_number(row.get("占Revenue_Company比例"))
            elif key == "G&A":
                out["ga_abs"] = parse_number(row.get("Value (Million)"))
                out["ga"] = parse_number(row.get("占Revenue_Company比例"))
            elif key == "R&D":
                out["rd_abs"] = parse_number(row.get("Value (Million)"))
                out["rd"] = parse_number(row.get("占Revenue_Company比例"))
            elif key == "D&A":
                out["da_abs"] = parse_number(row.get("Value (Million)"))
    return out


def parse_operating_metrics(tables: list[dict]) -> list[dict]:
    metrics = []
    for table in tables:
        if table["section"] != "运营指标（如有披露）":
            continue
        for row in table["rows"]:
            metrics.append({
                "metric": row.get("Metric_Name"),
                "segment": row.get("Segment"),
                "value": parse_number(row.get("Value")),
                "unit": row.get("Unit"),
                "note": row.get("备注"),
            })
    return metrics


def parse_quarter_file(path: Path) -> dict:
    props, body = parse_frontmatter(read_text(path))
    tables = parse_tables(body)
    q = f"{props.get('fiscal_year')}{props.get('quarter')}"
    expense = parse_expense_table(tables)
    company_segments = metric_segments(tables, "Revenue_Company")
    game_region_segments = metric_segments(tables, "Revenue_Game")
    return {
        "q": q,
        "period_end": str(props.get("period_end") or ""),
        "report_date": str(props.get("report_date") or ""),
        "currency": props.get("currency") or "CNY",
        "revenue_game": props.get("revenue_game"),
        "revenue_company": props.get("revenue_company"),
        "yoy": props.get("revenue_game_yoy"),
        "qoq": props.get("revenue_game_qoq"),
        "revenue_company_yoy": props.get("revenue_company_yoy"),
        "revenue_company_qoq": props.get("revenue_company_qoq"),
        "gm": props.get("gross_margin"),
        "gm_yoy_pp": props.get("gross_margin_yoy_pp"),
        "gm_qoq_pp": props.get("gross_margin_qoq_pp"),
        "om": props.get("operating_margin"),
        "om_yoy_pp": props.get("operating_margin_yoy_pp"),
        "om_qoq_pp": props.get("operating_margin_qoq_pp"),
        "pcm": props.get("profit_calculated_margin"),
        "pcm_yoy_pp": props.get("profit_calculated_margin_yoy_pp"),
        "pcm_qoq_pp": props.get("profit_calculated_margin_qoq_pp"),
        "rd": props.get("rd_ratio") if props.get("rd_ratio") is not None else expense.get("rd"),
        "sm": props.get("sm_ratio") if props.get("sm_ratio") is not None else expense.get("sm"),
        "ga": props.get("ga_ratio") if props.get("ga_ratio") is not None else expense.get("ga"),
        "rd_yoy_pp": props.get("rd_ratio_yoy_pp"),
        "sm_yoy_pp": props.get("sm_ratio_yoy_pp"),
        "ga_yoy_pp": props.get("ga_ratio_yoy_pp"),
        "rd_qoq_pp": props.get("rd_ratio_qoq_pp"),
        "sm_qoq_pp": props.get("sm_ratio_qoq_pp"),
        "ga_qoq_pp": props.get("ga_ratio_qoq_pp"),
        "gross_profit": first_metric_value(tables, "Gross_Profit"),
        "operating_profit": first_metric_value(tables, "Operating_Profit"),
        "profit_calculated": first_metric_value(tables, "Profit_Calculated"),
        "sales_marketing": expense.get("sm_abs"),
        "general_admin": expense.get("ga_abs"),
        "research_development": expense.get("rd_abs"),
        "depreciation_amortization": expense.get("da_abs"),
        "drivers": clean_list(props.get("game_drivers")),
        "drags": clean_list(props.get("game_drags")),
        "strategy": clean_list(props.get("strategy_keywords")),
        "revenue_segments": company_segments,
        "game_revenue_segments": {"region": game_region_segments} if game_region_segments else {},
        "operating_metrics": parse_operating_metrics(tables),
    }


def extract_heading_block(body: str, heading_pattern: str) -> str:
    pattern = re.compile(rf"^##\s+{heading_pattern}\s*$", re.M)
    match = pattern.search(body)
    if not match:
        return ""
    start = match.end()
    next_match = re.search(r"^##\s+", body[start:], re.M)
    end = start + next_match.start() if next_match else len(body)
    return body[start:end].strip()


def extract_subheading_block(block: str, title: str) -> str:
    pattern = re.compile(rf"^##+\s+{re.escape(title)}\s*$", re.M)
    match = pattern.search(block)
    if not match:
        return ""
    start = match.end()
    next_match = re.search(r"^##+\s+", block[start:], re.M)
    end = start + next_match.start() if next_match else len(block)
    return block[start:end].strip()


def extract_heading_anywhere(body: str, title: str) -> str:
    pattern = re.compile(rf"^##+\s+{re.escape(title)}\s*$", re.M)
    match = pattern.search(body)
    if not match:
        return ""
    start = match.end()
    next_match = re.search(r"^##+\s+", body[start:], re.M)
    end = start + next_match.start() if next_match else len(body)
    return body[start:end].strip()


def extract_numbered_items(block: str) -> list[str]:
    items = []
    for line in block.splitlines():
        match = re.match(r"^\s*\d+\.\s+(.+)", line)
        if match:
            items.append(clean_wikilinks(match.group(1)))
    return items


def extract_keyword_line(body: str, label: str) -> list[str]:
    match = re.search(rf"\*\*{label}\*\*：(.+)", body)
    if not match:
        return []
    raw = match.group(1).replace("、", "，")
    return [clean_wikilinks(x.strip()) for x in raw.split("，") if x.strip() and x.strip() != "无明显拖累"]


def extract_data_reading(body: str, title: str) -> str:
    sub = extract_heading_anywhere(body, title)
    match = re.search(r"\*\*数据解读\*\*：\s*\n(.+?)(?:\n\n|$)", sub, re.S)
    if match:
        return clean_wikilinks(" ".join(x.strip() for x in match.group(1).splitlines() if x.strip()))
    return ""


def parse_briefing(path: Path, company_id: str) -> dict:
    props, body = parse_frontmatter(read_text(path))
    core = extract_numbered_items(extract_heading_block(body, r"一、核心判断"))
    insights = []
    for match in re.finditer(r"###\s+观察[一二三四五六七八九十]+｜(.+?)\n(.*?)(?=^###\s+观察|\Z)", extract_heading_block(body, r"四、洞察与启发"), re.S | re.M):
        title = clean_wikilinks(match.group(1).strip())
        content = match.group(2)
        if "待补充" in title or "待补充" in content:
            continue
        phenomenon = re.search(r"\*\*现象\*\*：(.+)", content)
        background = re.search(r"\*\*背后\*\*：(.+)", content)
        question = re.search(r"\*\*值得思考\*\*：(.+)", content)
        insights.append({
            "title": title,
            "phenomenon": clean_wikilinks(phenomenon.group(1)) if phenomenon else "",
            "background": clean_wikilinks(background.group(1)) if background else "",
            "question": clean_wikilinks(question.group(1)) if question else "",
        })
    fiscal_year = props.get("fiscal_year")
    quarter = props.get("quarter")
    q_key = f"{fiscal_year}{quarter}"
    return {
        "id": f"tencent-{str(q_key).lower()}",
        "company": company_id,
        "quarter": q_key,
        "publish_date": str(props.get("report_date") or ""),
        "tagline": core[0] if core else f"腾讯 {q_key} 财报 Briefing",
        "core_judgements": core,
        "keywords": {
            "drivers": extract_keyword_line(body, "驱动"),
            "drags": extract_keyword_line(body, "拖累"),
            "strategy": extract_keyword_line(body, "战略"),
        },
        "game_business": extract_data_reading(body, "游戏业务"),
        "company_business": extract_data_reading(body, "公司整体"),
        "profitability": extract_data_reading(body, "盈利能力"),
        "cost": extract_data_reading(body, "费用结构"),
        "insights": insights,
        "source_file": str(path),
    }


def make_products(names: list[str], company_id: str) -> tuple[list[str], dict]:
    product_ids = []
    products = {}
    for name in names:
        pid = re.sub(r"[^0-9a-zA-Z\u4e00-\u9fff]+", "-", name).strip("-").lower()
        if not pid:
            continue
        product_ids.append(pid)
        products[pid] = {
            "name": name,
            "name_en": name,
            "genre": "未分类",
            "platform": "未披露",
            "developer": company_id,
            "status": "mentioned",
            "launch": "",
        }
    return product_ids, products


def build_data() -> dict:
    vault = find_vault_root()
    company_dir = vault / "01 Areas" / "Work" / "GameIntel" / "Tencent_0700HK"
    quarter_files = sorted(
        [p for p in company_dir.glob("*.md") if QUARTER_RE.match(p.name)],
        key=lambda p: (int(QUARTER_RE.match(p.name).group(1)), QUARTER_RE.match(p.name).group(2)),
    )
    quarters = [parse_quarter_file(path) for path in quarter_files]
    latest = quarters[-1]
    briefing_path = company_dir / "2025Q4_Briefing_阶段一.md"
    briefing = parse_briefing(briefing_path, "tencent")
    product_names = sorted(set(latest.get("drivers", []) + briefing["keywords"].get("drivers", [])))
    product_ids, products = make_products(product_names, "tencent")
    summary = {
        "id": "2025q4",
        "period": "2025 Q4",
        "quarter_key": "2025Q4",
        "publish_date": latest.get("report_date"),
        "period_end": latest.get("period_end"),
        "headline": "腾讯 2025 Q4：游戏增长与 AI 投入并行",
        "companies_included": ["tencent"],
        "tiers": {
            "exceed": [],
            "inline": [{
                "company": "tencent",
                "yoy": latest.get("yoy"),
                "tier": 5,
                "note": briefing["core_judgements"][0] if briefing["core_judgements"] else "腾讯 2025Q4 已接入真实财报数据",
            }],
            "miss": [],
        },
        "trends": [
            {
                "title": item,
                "phenomenon": item,
                "reason": "来自腾讯 2025Q4 Briefing 核心判断；行业横向总结待更多公司接入后生成。",
            }
            for item in briefing["core_judgements"][:3]
        ],
        "actions": [],
        "macro": "当前真实数据版仅接入腾讯 2025Q4 及历史季度文件。行业横向结论需要接入更多公司后再生成，避免用 demo 假数据填充。",
        "insights": briefing["insights"],
        "oneliners": [{
            "company": "tencent",
            "tier": 5,
            "text": briefing["tagline"],
        }],
    }
    return {
        "meta": {
            "period": "2025 Q4",
            "latest_quarter": "2025Q4",
            "period_end": latest.get("period_end"),
            "publish_date": latest.get("report_date"),
            "currency": latest.get("currency") or "CNY",
            "currency_note": "腾讯真实数据版：金额单位为 Million CNY；比例字段使用小数，0.15 = 15%。",
            "generated_at": datetime.now().isoformat(timespec="seconds"),
            "source": "GameIntel Tencent_0700HK markdown files",
        },
        "companies": {
            "tencent": {
                "id": "tencent",
                "name_cn": "腾讯",
                "name_en": "Tencent",
                "ticker": "0700.HK",
                "tier": 5,
                "currency": latest.get("currency") or "CNY",
                "status": "listed",
                "aliases": ["Tencent", "腾讯控股"],
                "markets": ["中国", "全球"],
                "genres": ["MOBA", "射击", "长青运营", "海外发行"],
                "ir_url": "https://www.tencent.com/zh-cn/investors.html",
                "positioning": "中国游戏龙头，游戏、广告、云与 AI 投入共同决定本轮增长质量。",
                "products": product_ids,
                "quarters": quarters,
            }
        },
        "products": products,
        "briefings": [briefing],
        "summaries": [summary],
        "memos": [],
    }


def main() -> None:
    out_path = Path(__file__).resolve().parents[1] / "data.js"
    data = build_data()
    payload = json.dumps(data, ensure_ascii=False, indent=2)
    out_path.write_text("// Generated from GameIntel markdown files. Do not edit by hand.\nwindow.GI_DATA = " + payload + ";\n", encoding="utf-8")
    print(f"Wrote {out_path}")
    print(f"Companies: {len(data['companies'])}; quarters: {len(data['companies']['tencent']['quarters'])}; briefings: {len(data['briefings'])}")


if __name__ == "__main__":
    main()
