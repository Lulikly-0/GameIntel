const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const WEB_DIR = path.resolve(__dirname, "..");
const ROOT = path.resolve(WEB_DIR, "..", "..");
const WEB_INDEX_DIR = path.join(ROOT, "_web_index");
const FIELD_DATA_DIR = path.join(WEB_INDEX_DIR, "data");
const CHART_TEMPLATE_PATH = path.join(FIELD_DATA_DIR, "company_chart_templates.json");
const OUT = path.join(WEB_DIR, "data", "gi_web_data.js");

function readText(file) {
  return fs.readFileSync(file, "utf8");
}

function readJson(file, fallback = null) {
  if (!fs.existsSync(file)) return fallback;
  return JSON.parse(readText(file));
}

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, "/");
}

function listFiles(dir, predicate = () => true) {
  if (!fs.existsSync(dir)) return [];
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listFiles(full, predicate));
    if (entry.isFile() && predicate(full)) out.push(full);
  }
  return out;
}

function cleanScalar(value) {
  return String(value || "").trim().replace(/^["']|["']$/g, "");
}

function stripMd(value) {
  return String(value || "")
    .replace(/`/g, "")
    .replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, "$1")
    .trim();
}

function splitList(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (value === null || value === undefined || value === "") return [];
  return String(value)
    .split(/[,;；，]/)
    .map((item) => stripMd(item))
    .filter(Boolean);
}

function parseFrontMatter(text) {
  const match = text.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n?/);
  if (!match) return {};
  const meta = {};
  let current = null;
  for (const line of match[1].split(/\r?\n/)) {
    const listItem = line.match(/^\s*-\s+(.*)$/);
    if (listItem && current) {
      if (!Array.isArray(meta[current])) meta[current] = [];
      meta[current].push(cleanScalar(listItem[1]));
      continue;
    }
    const kv = line.match(/^([A-Za-z0-9_]+):\s*(.*)$/);
    if (!kv) continue;
    current = kv[1];
    meta[current] = kv[2] === "" ? [] : cleanScalar(kv[2]);
  }
  return meta;
}

function markdownTables(text) {
  const tables = [];
  let current = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^\|.*\|$/.test(trimmed)) {
      if (!/^\|\s*-/.test(trimmed)) {
        current.push(trimmed.slice(1, -1).split("|").map((cell) => cell.trim()));
      }
      continue;
    }
    if (current.length) {
      tables.push(current);
      current = [];
    }
  }
  if (current.length) tables.push(current);
  return tables;
}

function findTable(text, requiredHeaders) {
  return markdownTables(text).find((table) => {
    const headers = table[0] || [];
    return requiredHeaders.every((header) => headers.includes(header));
  }) || [];
}

function parseCoreJudgments(text) {
  const match = text.match(/^##\s+.*核心判断.*$/m);
  if (!match) return [];
  const body = text.slice(match.index + match[0].length).split(/\r?\n##\s+/)[0];
  return body
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*\d+\.\s+(.+)$/)?.[1]?.trim())
    .filter(Boolean);
}

function decodeXml(value) {
  return String(value || "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, "\"")
    .replace(/&apos;/g, "'");
}

function tags(xml, tagName) {
  const out = [];
  const re = new RegExp(`<${tagName}\\b[^>]*>([\\s\\S]*?)<\\/${tagName}>`, "g");
  let match;
  while ((match = re.exec(xml))) out.push(match[1]);
  return out;
}

function attrs(xml) {
  const out = {};
  const re = /([A-Za-z_:][\w:.-]*)="([^"]*)"/g;
  let match;
  while ((match = re.exec(xml))) out[match[1]] = decodeXml(match[2]);
  return out;
}

function colIndex(cellRef) {
  const letters = String(cellRef || "").match(/[A-Z]+/)?.[0] || "";
  let index = 0;
  for (const char of letters) index = index * 26 + (char.charCodeAt(0) - 64);
  return Math.max(0, index - 1);
}

function readZipEntries(file) {
  const buffer = fs.readFileSync(file);
  let eocd = -1;
  for (let i = buffer.length - 22; i >= 0; i -= 1) {
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error(`Invalid xlsx zip: ${file}`);
  const total = buffer.readUInt16LE(eocd + 10);
  const cdOffset = buffer.readUInt32LE(eocd + 16);
  const entries = {};
  let offset = cdOffset;
  for (let i = 0; i < total; i += 1) {
    if (buffer.readUInt32LE(offset) !== 0x02014b50) throw new Error(`Invalid central directory in ${file}`);
    const method = buffer.readUInt16LE(offset + 10);
    const compressedSize = buffer.readUInt32LE(offset + 20);
    const nameLength = buffer.readUInt16LE(offset + 28);
    const extraLength = buffer.readUInt16LE(offset + 30);
    const commentLength = buffer.readUInt16LE(offset + 32);
    const localOffset = buffer.readUInt32LE(offset + 42);
    const name = buffer.slice(offset + 46, offset + 46 + nameLength).toString("utf8");
    const localNameLength = buffer.readUInt16LE(localOffset + 26);
    const localExtraLength = buffer.readUInt16LE(localOffset + 28);
    const dataStart = localOffset + 30 + localNameLength + localExtraLength;
    const compressed = buffer.slice(dataStart, dataStart + compressedSize);
    entries[name] = method === 8 ? zlib.inflateRawSync(compressed) : compressed;
    offset += 46 + nameLength + extraLength + commentLength;
  }
  return entries;
}

function parseSharedStrings(xml) {
  return tags(xml, "si").map((si) => tags(si, "t").map((t) => decodeXml(t.replace(/<[^>]+>/g, ""))).join(""));
}

function parseSheetRows(xml, sharedStrings) {
  const rows = [];
  for (const rowXml of tags(xml, "row")) {
    const row = [];
    const cellRe = /<c\b([^>]*)>([\s\S]*?)<\/c>/g;
    let match;
    let nextCol = 0;
    while ((match = cellRe.exec(rowXml))) {
      const cellAttrs = attrs(match[1]);
      const type = cellAttrs.t || "";
      const index = cellAttrs.r ? colIndex(cellAttrs.r) : nextCol;
      const body = match[2];
      let value = "";
      if (type === "inlineStr") {
        value = tags(body, "t").map((t) => decodeXml(t.replace(/<[^>]+>/g, ""))).join("");
      } else {
        const raw = tags(body, "v")[0] || "";
        if (type === "s") value = sharedStrings[Number(raw)] || "";
        else if (raw !== "" && !Number.isNaN(Number(raw))) value = Number(raw);
        else value = decodeXml(raw);
      }
      row[index] = value;
      nextCol = index + 1;
    }
    rows.push(row);
  }
  return rows;
}

function parseXlsx(file) {
  const entries = readZipEntries(file);
  const workbook = entries["xl/workbook.xml"].toString("utf8");
  const rels = entries["xl/_rels/workbook.xml.rels"].toString("utf8");
  const sharedStrings = entries["xl/sharedStrings.xml"] ? parseSharedStrings(entries["xl/sharedStrings.xml"].toString("utf8")) : [];
  const relMap = {};
  const relRe = /<Relationship\b([^>]*)\/>/g;
  let relMatch;
  while ((relMatch = relRe.exec(rels))) {
    const a = attrs(relMatch[1]);
    relMap[a.Id] = a.Target;
  }
  const sheets = {};
  const sheetRe = /<sheet\b([^>]*)\/>/g;
  let sheetMatch;
  while ((sheetMatch = sheetRe.exec(workbook))) {
    const a = attrs(sheetMatch[1]);
    const target = relMap[a["r:id"]];
    if (!target) continue;
    const sheetPath = path.posix.normalize(`xl/${target}`);
    if (entries[sheetPath]) sheets[a.name] = parseSheetRows(entries[sheetPath].toString("utf8"), sharedStrings);
  }
  return sheets;
}

function rowsToObjects(rows) {
  const headers = (rows[0] || []).map((header) => String(header || "").trim());
  return rows.slice(1).map((row) => {
    const obj = {};
    headers.forEach((header, index) => {
      if (!header) return;
      const value = row[index];
      obj[header] = value === undefined || value === "" ? null : value;
    });
    return obj;
  });
}

function latestFieldInventoryFile() {
  const candidates = listFiles(FIELD_DATA_DIR, (file) => /field_inventory.*\.xlsx$/i.test(file));
  if (!candidates.length) return null;
  return candidates
    .sort((a, b) => {
      const aw = /with_aggregation/i.test(a) ? 1 : 0;
      const bw = /with_aggregation/i.test(b) ? 1 : 0;
      if (aw !== bw) return bw - aw;
      return fs.statSync(b).mtimeMs - fs.statSync(a).mtimeMs;
    })[0];
}

function normalizeFieldMeta(row) {
  const meta = {
    field_id: row.field_id,
    display_name: row.display_name,
    importance: row.importance,
    metric_type: row.metric_type,
    business_scope: row.business_scope,
    segment_scope: row.segment_scope,
    parent_field_id: row.parent_field_id,
    aggregation_group: row.aggregation_group,
    unit: row.unit,
    currency: row.currency,
    comparable_tags: splitList(row.comparable_tags),
    source_doc: row.source_doc,
    extraction_method: row.extraction_method,
    extraction_formula: row.extraction_formula,
    template_file: row.template_file,
  };
  Object.keys(meta).forEach((key) => {
    if (meta[key] === null || meta[key] === undefined || meta[key] === "") delete meta[key];
  });
  return meta;
}

function loadFieldInventory() {
  const file = latestFieldInventoryFile();
  const empty = {
    source_path: null,
    fields_by_company: {},
    fields_by_id: {},
    aggregation_index: {},
    unique_fields: {},
  };
  if (!file) return empty;
  const workbook = parseXlsx(file);
  const templateRows = rowsToObjects(workbook.financial_template_fields || []);
  const uniqueRows = rowsToObjects(workbook.financial_unique_fields || []);
  const aggregationRows = rowsToObjects(workbook.aggregation_audit || []);
  const inventory = { ...empty, source_path: rel(file) };

  templateRows.forEach((row) => {
    if (!row.company_id || !row.field_id) return;
    const meta = normalizeFieldMeta(row);
    inventory.fields_by_company[row.company_id] ||= {};
    inventory.fields_by_company[row.company_id][row.field_id] = meta;
    inventory.fields_by_id[row.field_id] ||= {
      field_id: row.field_id,
      display_names: splitList(row.display_name),
      metric_types: splitList(row.metric_type),
      business_scopes: splitList(row.business_scope),
      segment_scopes: splitList(row.segment_scope),
      parent_field_ids: splitList(row.parent_field_id),
      aggregation_groups: splitList(row.aggregation_group),
    };
  });

  uniqueRows.forEach((row) => {
    if (!row.field_id) return;
    inventory.unique_fields[row.field_id] = {
      field_id: row.field_id,
      company_count: row.company_count,
      companies: splitList(row.companies),
      display_names: splitList(row.display_names),
      metric_types: splitList(row.metric_types),
      business_scopes: splitList(row.business_scopes),
      segment_scopes: splitList(row.segment_scopes),
      parent_field_ids: splitList(row.parent_field_ids),
      aggregation_groups: splitList(row.aggregation_groups),
    };
  });

  aggregationRows.forEach((row) => {
    if (!row.company_id || !row.parent_field_id || !row.aggregation_group) return;
    inventory.aggregation_index[row.company_id] ||= {};
    inventory.aggregation_index[row.company_id][row.parent_field_id] ||= {};
    inventory.aggregation_index[row.company_id][row.parent_field_id][row.aggregation_group] = {
      parent_field_id: row.parent_field_id,
      aggregation_group: row.aggregation_group,
      component_count: Number(row.component_count || 0),
      component_field_ids: splitList(row.component_field_ids),
      web_behavior: row.web_behavior,
    };
  });

  return inventory;
}

function loadRegistries() {
  const companyRegistry = readJson(path.join(ROOT, "_registry", "company_registry.json"), { companies: {} });
  const productRegistry = readJson(path.join(ROOT, "_registry", "product_registry.json"), { products: {} });
  return {
    companies: companyRegistry.companies || {},
    products: productRegistry.products || {},
    source_paths: {
      company_registry: fs.existsSync(path.join(ROOT, "_registry", "company_registry.json")) ? rel(path.join(ROOT, "_registry", "company_registry.json")) : null,
      product_registry: fs.existsSync(path.join(ROOT, "_registry", "product_registry.json")) ? rel(path.join(ROOT, "_registry", "product_registry.json")) : null,
    },
  };
}

function loadChartTemplates() {
  const raw = readJson(CHART_TEMPLATE_PATH, {});
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out = {};
  Object.entries(raw).forEach(([companyId, items]) => {
    if (!Array.isArray(items)) return;
    out[companyId] = items
      .filter((item) => item && typeof item === "object" && item.field_id)
      .map((item) => ({
        field_id: item.field_id,
        section: item.section || "公司专属指标",
        title: item.title || item.field_id,
        chart_type: item.chart_type || "metric_pair",
        order: item.order || 999,
        note: item.note || "",
      }))
      .sort((a, b) => (a.order || 999) - (b.order || 999) || String(a.field_id).localeCompare(String(b.field_id)));
  });
  return out;
}

function mergeField(companyId, fieldId, field, inventory) {
  const meta = inventory.fields_by_company[companyId]?.[fieldId] || {};
  const out = { field_id: fieldId, ...meta, ...field };
  ["display_name", "importance", "metric_type", "business_scope", "segment_scope", "parent_field_id", "aggregation_group", "unit", "currency", "source_doc", "extraction_method", "extraction_formula"].forEach((key) => {
    if ((out[key] === null || out[key] === undefined || out[key] === "") && meta[key] !== undefined) out[key] = meta[key];
  });
  const rawTags = splitList(field?.comparable_tags);
  out.comparable_tags = rawTags.length ? rawTags : splitList(meta.comparable_tags);
  out.field_dictionary_source = meta.field_id ? inventory.source_path : null;
  return out;
}

function loadFinancialData(inventory, registries) {
  const base = path.join(ROOT, "_financial_data");
  const companies = {};
  for (const file of listFiles(base, (full) => /\.json$/i.test(full) && !full.includes(`${path.sep}_templates${path.sep}`))) {
    const raw = JSON.parse(readText(file));
    const companyId = raw.company_id || path.basename(path.dirname(file));
    const registry = registries.companies[companyId] || {};
    const fields = {};
    Object.entries(raw.fields || {}).forEach(([fieldId, field]) => {
      fields[fieldId] = mergeField(companyId, fieldId, field, inventory);
    });
    const row = {
      ...raw,
      fields,
      source_path: rel(file),
      updated_at: fs.statSync(file).mtime.toISOString(),
    };
    if (!companies[companyId]) {
      companies[companyId] = {
        id: companyId,
        company_id: companyId,
        name_cn: registry.name_cn || companyId.split("_")[0],
        name_en: registry.name_en || "",
        ticker: registry.ticker || "",
        exchange: registry.exchange || "",
        tier: registry.tier || null,
        aliases: registry.aliases || [],
        periods: [],
      };
    }
    companies[companyId].periods.push(row);
  }
  Object.values(companies).forEach((company) => {
    company.periods.sort((a, b) => periodRank(a.calendar_period) - periodRank(b.calendar_period));
  });
  return companies;
}

function periodRank(period) {
  const match = String(period || "").match(/^(\d{4})(Q[1-4]|FY)$/);
  if (!match) return 0;
  return Number(match[1]) * 10 + ({ Q1: 1, Q2: 2, Q3: 3, Q4: 4, FY: 5 }[match[2]] || 0);
}

function parseBriefing(file) {
  const text = readText(file);
  const meta = parseFrontMatter(text);
  if (meta.type !== "gameintel_briefing") return null;
  const table = findTable(text, ["field_id", "briefing"]);
  const headers = table[0] || [];
  const fieldIndex = headers.indexOf("field_id");
  const briefingIndex = headers.indexOf("briefing");
  const fieldBriefings = {};
  table.slice(1).forEach((row) => {
    const fieldId = stripMd(row[fieldIndex]);
    const note = stripMd(row[briefingIndex]);
    if (fieldId && note) {
      fieldBriefings[fieldId] = {
        briefing: note,
        source_path: rel(file),
      };
    }
  });
  return {
    source_path: rel(file),
    company_id: meta.company_id,
    calendar_period: meta.calendar_period,
    fiscal_period: meta.fiscal_period,
    core_judgments: parseCoreJudgments(text),
    field_briefings: fieldBriefings,
    strategy_keywords: Array.isArray(meta.strategy_keywords) ? meta.strategy_keywords : [],
    human_fill_status: meta.human_fill_status || "",
  };
}

function parseQuarterlySummary(file) {
  const text = readText(file);
  const meta = parseFrontMatter(text);
  const period = meta.calendar_period || path.basename(file, ".md");
  return {
    source_path: rel(file),
    calendar_period: period,
    core_judgments: parseCoreJudgments(text),
  };
}

function parseEvent(file) {
  const text = readText(file);
  const meta = parseFrontMatter(text);
  if (meta.type !== "gameintel_event") return null;
  const event = {
    source_path: rel(file),
    event_id: meta.event_id || path.basename(file, ".md"),
    event_type: meta.event_type || "",
    event_name: meta.event_name || path.basename(file, ".md"),
    event_date: meta.event_date || "",
    calendar_period: meta.calendar_period || "",
    related_periods: Array.isArray(meta.related_periods) ? meta.related_periods : [],
    company_ids: Array.isArray(meta.company_ids) ? meta.company_ids : [],
    topic_tags: Array.isArray(meta.topic_tags) ? meta.topic_tags : [],
    strategy_keywords: Array.isArray(meta.strategy_keywords) ? meta.strategy_keywords : [],
    field_explanations: {},
    product_signals: [],
  };

  const fields = findTable(text, ["field_id", "official_explanation"]);
  const fieldHeaders = fields[0] || [];
  const fieldIndex = fieldHeaders.indexOf("field_id");
  const nameIndex = fieldHeaders.indexOf("指标");
  const explanationIndex = fieldHeaders.indexOf("official_explanation");
  const sourceIndex = fieldHeaders.indexOf("source_doc");
  fields.slice(1).forEach((row) => {
    const fieldId = stripMd(row[fieldIndex]);
    if (!fieldId) return;
    event.field_explanations[fieldId] = {
      display_name: stripMd(row[nameIndex]),
      official_explanation: stripMd(row[explanationIndex]),
      source_doc: stripMd(row[sourceIndex]),
    };
  });

  const products = findTable(text, ["product_id", "signal"]);
  const productHeaders = products[0] || [];
  const productIndex = productHeaders.indexOf("product_id");
  const productNameIndex = productHeaders.indexOf("product");
  const signalIndex = productHeaders.indexOf("signal");
  const productSourceIndex = productHeaders.indexOf("source_doc");
  const linkedIndex = productHeaders.indexOf("linked_fields");
  products.slice(1).forEach((row) => {
    event.product_signals.push({
      product_id: stripMd(row[productIndex]),
      product: stripMd(row[productNameIndex]),
      signal: stripMd(row[signalIndex]),
      source_doc: stripMd(row[productSourceIndex]),
      linked_fields: stripMd(row[linkedIndex]),
    });
  });
  return event;
}

function parseComparableTags(file) {
  const text = fs.existsSync(file) ? readText(file) : "";
  const table = findTable(text, ["comparable_tags"]);
  const headers = table[0] || [];
  const tagIndex = headers.indexOf("comparable_tags");
  const labelIndex = headers.indexOf("网页比较项");
  const typeIndex = headers.indexOf("源字段类型");
  const outputIndex = headers.indexOf("输出");
  const tagsById = {};
  table.slice(1).forEach((row) => {
    const id = stripMd(row[tagIndex]);
    if (!id) return;
    tagsById[id] = {
      label: stripMd(row[labelIndex]),
      source_type: stripMd(row[typeIndex]),
      output: stripMd(row[outputIndex]),
    };
  });
  return tagsById;
}

function attachBriefingsAndExplanations(companies, briefings, events) {
  Object.values(companies).forEach((company) => {
    company.periods.forEach((period) => {
      const briefing = briefings[`${company.id}::${period.calendar_period}`];
      if (briefing) period.briefing = briefing;
      const relatedEvents = events.filter((event) =>
        (event.company_ids || []).includes(company.id)
        && ((event.related_periods || []).includes(period.calendar_period) || event.calendar_period === period.calendar_period)
      );
      period.events = relatedEvents.map((event) => event.event_id);
      Object.entries(period.fields || {}).forEach(([fieldId, field]) => {
        const note = briefing?.field_briefings?.[fieldId];
        if (note) field.field_briefing = note;
        const official = relatedEvents.find((event) => event.field_explanations?.[fieldId])?.field_explanations?.[fieldId];
        if (official) {
          field.official_explanation = official.official_explanation;
          field.explanation_source_doc = official.source_doc;
        }
      });
    });
  });
}

function main() {
  const fieldInventory = loadFieldInventory();
  const registries = loadRegistries();
  const chartTemplates = loadChartTemplates();
  const companies = loadFinancialData(fieldInventory, registries);

  const briefings = {};
  listFiles(path.join(ROOT, "_briefings"), (full) => /\.md$/i.test(full) && !full.includes(`${path.sep}_quarterly_summaries${path.sep}`))
    .map(parseBriefing)
    .filter((item) => item?.company_id && item?.calendar_period)
    .forEach((item) => { briefings[`${item.company_id}::${item.calendar_period}`] = item; });

  const quarterlySummaries = {};
  listFiles(path.join(ROOT, "_briefings", "_quarterly_summaries"), (full) => /\.md$/i.test(full))
    .map(parseQuarterlySummary)
    .forEach((item) => { quarterlySummaries[item.calendar_period] = item; });

  const events = listFiles(path.join(ROOT, "_events"), (full) => /\.md$/i.test(full))
    .map(parseEvent)
    .filter(Boolean)
    .sort((a, b) => String(b.event_date).localeCompare(String(a.event_date)));

  attachBriefingsAndExplanations(companies, briefings, events);

  const disclosureDateFor = (companyId, period) => {
    const event = events.find((item) =>
      item.event_type === "earnings_release"
      && (item.company_ids || []).includes(companyId)
      && (item.calendar_period === period || (item.related_periods || []).includes(period))
    );
    return event?.event_date || "";
  };

  const financialUpdates = Object.values(companies)
    .flatMap((company) => company.periods.map((row) => ({
      company_id: company.id,
      company_name: company.name_cn,
      calendar_period: row.calendar_period,
      source_path: row.source_path,
      updated_at: row.updated_at,
      disclosure_date: disclosureDateFor(company.id, row.calendar_period),
    })))
    .sort((a, b) => {
      if (a.disclosure_date && b.disclosure_date && a.disclosure_date !== b.disclosure_date) return String(b.disclosure_date).localeCompare(String(a.disclosure_date));
      if (a.disclosure_date && !b.disclosure_date) return -1;
      if (!a.disclosure_date && b.disclosure_date) return 1;
      return periodRank(b.calendar_period) - periodRank(a.calendar_period);
    })
    .slice(0, 12);

  const data = {
    meta: {
      generated_at: new Date().toISOString(),
      source_root: rel(ROOT),
      source_policy: "read_only_generated_from_gameintel_v3",
      field_inventory_source: fieldInventory.source_path,
      registry_sources: registries.source_paths,
      chart_template_source: fs.existsSync(CHART_TEMPLATE_PATH) ? rel(CHART_TEMPLATE_PATH) : null,
    },
    companies,
    chart_templates: chartTemplates,
    briefings,
    quarterly_summaries: quarterlySummaries,
    events,
    comparable_tags: parseComparableTags(path.join(ROOT, "_financial_data", "comparable_tags.md")),
    field_catalog: {
      source_path: fieldInventory.source_path,
      fields_by_company: fieldInventory.fields_by_company,
      unique_fields: fieldInventory.unique_fields,
      aggregation_index: fieldInventory.aggregation_index,
    },
    registries: {
      companies: registries.companies,
      products: registries.products,
    },
    latest_updates: {
      financial: financialUpdates,
      events: events.slice(0, 12),
    },
  };

  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, `// Auto-generated by scripts/build_data.js. Do not edit manually.\nwindow.GI_WEB_DATA = ${JSON.stringify(data, null, 2)};\n`, "utf8");
  console.log(`Wrote ${path.relative(process.cwd(), OUT)}`);
}

main();
