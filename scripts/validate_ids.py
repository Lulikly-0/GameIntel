import json
import re
from pathlib import Path


WEB_DIR = Path(__file__).resolve().parents[1]
ROOT = WEB_DIR.parents[1]
REGISTRY_DIR = ROOT / "_registry"


def read_json(path, fallback=None):
    if not path.exists():
        return fallback
    return json.loads(path.read_text(encoding="utf-8"))


def rel(path):
    return path.relative_to(ROOT).as_posix()


def as_list(value):
    if isinstance(value, list):
        return value
    if value in (None, ""):
        return []
    return [value]


def clean_scalar(value):
    return str(value or "").strip().strip("\"'")


def parse_frontmatter(text):
    match = re.match(r"^---\r?\n([\s\S]*?)\r?\n---\r?\n?", text)
    if not match:
        return {}
    meta = {}
    current = None
    for line in match.group(1).splitlines():
        item = re.match(r"^\s*-\s+(.*)$", line)
        if item and current:
            if not isinstance(meta.get(current), list):
                meta[current] = []
            meta[current].append(clean_scalar(item.group(1)))
            continue
        kv = re.match(r"^([A-Za-z0-9_]+):\s*(.*)$", line)
        if not kv:
            continue
        current = kv.group(1)
        meta[current] = [] if kv.group(2) == "" else clean_scalar(kv.group(2))
    return meta


def add_error(errors, path, message):
    errors.append(f"{rel(path)}: {message}")


def load_registries():
    company_registry = read_json(REGISTRY_DIR / "company_registry.json", {"companies": {}})
    product_registry = read_json(REGISTRY_DIR / "product_registry.json", {"products": {}})
    studio_registry = read_json(REGISTRY_DIR / "studio_registry.json", {"studios": {}})
    return {
        "companies": company_registry.get("companies", {}),
        "products": product_registry.get("products", {}),
        "studios": studio_registry.get("studios", {}),
    }


def validate_registry_internals(registries, errors):
    company_ids = set(registries["companies"].keys())
    product_ids = set(registries["products"].keys())
    studio_ids = set(registries["studios"].keys())
    product_registry_file = REGISTRY_DIR / "product_registry.json"
    studio_registry_file = REGISTRY_DIR / "studio_registry.json"

    for product_id, product in registries["products"].items():
        if product.get("product_id") != product_id:
            add_error(errors, product_registry_file, f"{product_id}: product_id field is {product.get('product_id')!r}")
        for company_id in as_list(product.get("developer_company_ids")) + as_list(product.get("publisher_company_ids")):
            if company_id not in company_ids:
                add_error(errors, product_registry_file, f"{product_id}: unknown company_id {company_id}")
        for studio_id in as_list(product.get("studio_ids")):
            if studio_id not in studio_ids:
                add_error(errors, product_registry_file, f"{product_id}: unknown studio_id {studio_id}")

    for studio_id, studio in registries["studios"].items():
        if studio.get("studio_id") and studio.get("studio_id") != studio_id:
            add_error(errors, studio_registry_file, f"{studio_id}: studio_id field is {studio.get('studio_id')!r}")
        for company_id in as_list(studio.get("parent_company_ids")):
            if company_id not in company_ids:
                add_error(errors, studio_registry_file, f"{studio_id}: unknown parent_company_id {company_id}")

    return company_ids, product_ids


def validate_financial_data(company_ids, errors):
    base = ROOT / "_financial_data"
    for path in base.rglob("*.json"):
        if "_templates" in path.parts:
            continue
        data = read_json(path, {})
        company_id = data.get("company_id")
        if company_id and company_id not in company_ids:
            add_error(errors, path, f"unknown company_id {company_id}")


def validate_markdown_refs(company_ids, product_ids, errors):
    for dir_name in ["_briefings", "_events", "_research_library"]:
        base = ROOT / dir_name
        if not base.exists():
            continue
        for path in base.rglob("*.md"):
            meta = parse_frontmatter(path.read_text(encoding="utf-8"))
            for company_id in as_list(meta.get("company_ids")):
                if company_id not in company_ids:
                    add_error(errors, path, f"unknown company_id in company_ids: {company_id}")
            if meta.get("company_id") and meta["company_id"] not in company_ids:
                add_error(errors, path, f"unknown company_id: {meta['company_id']}")
            for product_id in as_list(meta.get("product_ids")):
                if product_id not in product_ids:
                    add_error(errors, path, f"unknown product_id in product_ids: {product_id}")
            if meta.get("product_id") and meta["product_id"] not in product_ids:
                add_error(errors, path, f"unknown product_id: {meta['product_id']}")


def main():
    errors = []
    registries = load_registries()
    company_ids, product_ids = validate_registry_internals(registries, errors)
    validate_financial_data(company_ids, errors)
    validate_markdown_refs(company_ids, product_ids, errors)

    if errors:
        print(f"ID validation failed with {len(errors)} error(s):")
        for error in errors:
            print(f"- {error}")
        raise SystemExit(1)

    print(f"ID validation passed ({len(company_ids)} companies, {len(product_ids)} products)")


if __name__ == "__main__":
    main()
