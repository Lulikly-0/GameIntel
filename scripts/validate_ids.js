const fs = require("fs");
const path = require("path");

const WEB_DIR = path.resolve(__dirname, "..");
const ROOT = path.resolve(WEB_DIR, "..", "..");
const REGISTRY_DIR = path.join(ROOT, "_registry");

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

function asArray(value) {
  if (Array.isArray(value)) return value;
  if (value === null || value === undefined || value === "") return [];
  return [value];
}

function addError(errors, file, message) {
  errors.push(`${rel(file)}: ${message}`);
}

function loadRegistries() {
  const companyRegistry = readJson(path.join(REGISTRY_DIR, "company_registry.json"), { companies: {} });
  const productRegistry = readJson(path.join(REGISTRY_DIR, "product_registry.json"), { products: {} });
  const studioRegistry = readJson(path.join(REGISTRY_DIR, "studio_registry.json"), { studios: {} });
  return {
    companies: companyRegistry.companies || {},
    products: productRegistry.products || {},
    studios: studioRegistry.studios || {},
  };
}

function validateRegistryInternals(registries, errors) {
  const companyIds = new Set(Object.keys(registries.companies));
  const productIds = new Set(Object.keys(registries.products));
  const studioIds = new Set(Object.keys(registries.studios));
  const productRegistryFile = path.join(REGISTRY_DIR, "product_registry.json");
  const studioRegistryFile = path.join(REGISTRY_DIR, "studio_registry.json");

  for (const [productId, product] of Object.entries(registries.products)) {
    if (product.product_id !== productId) {
      addError(errors, productRegistryFile, `${productId}: product_id field is ${JSON.stringify(product.product_id)}`);
    }
    for (const companyId of [...asArray(product.developer_company_ids), ...asArray(product.publisher_company_ids)]) {
      if (!companyIds.has(companyId)) addError(errors, productRegistryFile, `${productId}: unknown company_id ${companyId}`);
    }
    for (const studioId of asArray(product.studio_ids)) {
      if (!studioIds.has(studioId)) addError(errors, productRegistryFile, `${productId}: unknown studio_id ${studioId}`);
    }
  }

  for (const [studioId, studio] of Object.entries(registries.studios)) {
    if (studio.studio_id && studio.studio_id !== studioId) {
      addError(errors, studioRegistryFile, `${studioId}: studio_id field is ${JSON.stringify(studio.studio_id)}`);
    }
    for (const companyId of asArray(studio.parent_company_ids)) {
      if (!companyIds.has(companyId)) addError(errors, studioRegistryFile, `${studioId}: unknown parent_company_id ${companyId}`);
    }
  }

  return { companyIds, productIds, studioIds };
}

function validateFinancialData(companyIds, errors) {
  const base = path.join(ROOT, "_financial_data");
  for (const file of listFiles(base, (full) => /\.json$/i.test(full) && !full.includes(`${path.sep}_templates${path.sep}`))) {
    const data = readJson(file, {});
    if (data.company_id && !companyIds.has(data.company_id)) {
      addError(errors, file, `unknown company_id ${data.company_id}`);
    }
  }
}

function validateMarkdownRefs(companyIds, productIds, errors) {
  const targets = ["_briefings", "_events", "_research_library"];
  for (const dirName of targets) {
    const dir = path.join(ROOT, dirName);
    for (const file of listFiles(dir, (full) => /\.md$/i.test(full))) {
      const meta = parseFrontMatter(readText(file));
      for (const companyId of asArray(meta.company_ids)) {
        if (!companyIds.has(companyId)) addError(errors, file, `unknown company_id in company_ids: ${companyId}`);
      }
      if (meta.company_id && !companyIds.has(meta.company_id)) {
        addError(errors, file, `unknown company_id: ${meta.company_id}`);
      }
      for (const productId of asArray(meta.product_ids)) {
        if (!productIds.has(productId)) addError(errors, file, `unknown product_id in product_ids: ${productId}`);
      }
      if (meta.product_id && !productIds.has(meta.product_id)) {
        addError(errors, file, `unknown product_id: ${meta.product_id}`);
      }
    }
  }
}

function main() {
  const errors = [];
  const registries = loadRegistries();
  const { companyIds, productIds } = validateRegistryInternals(registries, errors);
  validateFinancialData(companyIds, errors);
  validateMarkdownRefs(companyIds, productIds, errors);

  if (errors.length) {
    console.error(`ID validation failed with ${errors.length} error(s):`);
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log(`ID validation passed (${companyIds.size} companies, ${productIds.size} products)`);
}

main();
