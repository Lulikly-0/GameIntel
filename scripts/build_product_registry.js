const fs = require("fs");
const path = require("path");

const WEB_DIR = path.resolve(__dirname, "..");
const ROOT = path.resolve(WEB_DIR, "..", "..");
const REGISTRY_DIR = path.join(ROOT, "_registry");
const PRODUCTS_DIR = path.join(REGISTRY_DIR, "products");
const OUT = path.join(REGISTRY_DIR, "product_registry.json");

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function writeJson(file, value) {
  fs.writeFileSync(file, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function rel(file) {
  return path.relative(ROOT, file).replace(/\\/g, "/");
}

function listJsonFiles(dir) {
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && /\.products\.json$/i.test(entry.name))
    .map((entry) => path.join(dir, entry.name))
    .sort((a, b) => a.localeCompare(b));
}

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function assertObject(value, message) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(message);
  }
}

function loadCompanyIds() {
  const file = path.join(REGISTRY_DIR, "company_registry.json");
  const registry = readJson(file);
  return new Set(Object.keys(registry.companies || {}));
}

function loadStudioIds() {
  const file = path.join(REGISTRY_DIR, "studio_registry.json");
  const registry = fs.existsSync(file) ? readJson(file) : { studios: {} };
  return new Set(Object.keys(registry.studios || {}));
}

function validateProduct(productId, product, sourceFile, companyIds, studioIds) {
  const errors = [];
  const required = [
    "product_id",
    "name_cn",
    "name_en",
    "aliases",
    "developer_company_ids",
    "publisher_company_ids",
    "studio_ids",
    "obsidian_link",
  ];

  for (const key of required) {
    if (!(key in product)) errors.push(`${productId}: missing ${key}`);
  }
  if (product.product_id !== productId) {
    errors.push(`${productId}: product_id field is ${JSON.stringify(product.product_id)}`);
  }

  for (const key of ["aliases", "developer_company_ids", "publisher_company_ids", "studio_ids"]) {
    if (!Array.isArray(product[key])) errors.push(`${productId}: ${key} must be an array`);
  }

  for (const companyId of [...asArray(product.developer_company_ids), ...asArray(product.publisher_company_ids)]) {
    if (!companyIds.has(companyId)) errors.push(`${productId}: unknown company_id ${companyId}`);
  }

  for (const studioId of asArray(product.studio_ids)) {
    if (!studioIds.has(studioId)) errors.push(`${productId}: unknown studio_id ${studioId}`);
  }

  if (errors.length) {
    const prefix = rel(sourceFile);
    throw new Error(errors.map((error) => `${prefix}: ${error}`).join("\n"));
  }
}

function buildRegistry() {
  const companyIds = loadCompanyIds();
  const studioIds = loadStudioIds();
  const files = listJsonFiles(PRODUCTS_DIR);
  const products = {};
  const sourceFiles = [];

  for (const file of files) {
    const source = readJson(file);
    assertObject(source.products, `${rel(file)}: products must be an object`);
    const sourceCompanyId = source.source_company_id || path.basename(file, ".products.json");
    if (!companyIds.has(sourceCompanyId)) {
      throw new Error(`${rel(file)}: unknown source_company_id ${sourceCompanyId}`);
    }
    sourceFiles.push(rel(file));

    for (const [productId, product] of Object.entries(source.products)) {
      if (products[productId]) {
        throw new Error(`${rel(file)}: duplicate product_id ${productId}`);
      }
      validateProduct(productId, product, file, companyIds, studioIds);
      products[productId] = {
        product_id: productId,
        source_company_id: sourceCompanyId,
        ...product,
        product_id: productId,
      };
    }
  }

  const registry = {
    schema_version: "1.0",
    updated_at: new Date().toISOString().slice(0, 10),
    source_files: sourceFiles,
    products,
  };
  writeJson(OUT, registry);
  console.log(`Wrote ${rel(OUT)} (${Object.keys(products).length} products from ${files.length} files)`);
}

buildRegistry();
