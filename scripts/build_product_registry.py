import json
from datetime import date
from pathlib import Path


WEB_DIR = Path(__file__).resolve().parents[1]
ROOT = WEB_DIR.parents[1]
REGISTRY_DIR = ROOT / "_registry"
PRODUCTS_DIR = REGISTRY_DIR / "products"
OUT = REGISTRY_DIR / "product_registry.json"


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path, value):
    path.write_text(json.dumps(value, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")


def rel(path):
    return path.relative_to(ROOT).as_posix()


def as_list(value):
    return value if isinstance(value, list) else []


def load_company_ids():
    registry = read_json(REGISTRY_DIR / "company_registry.json")
    return set(registry.get("companies", {}).keys())


def load_studio_ids():
    path = REGISTRY_DIR / "studio_registry.json"
    if not path.exists():
        return set()
    registry = read_json(path)
    return set(registry.get("studios", {}).keys())


def validate_product(product_id, product, source_file, company_ids, studio_ids):
    required = [
        "product_id",
        "name_cn",
        "name_en",
        "aliases",
        "developer_company_ids",
        "publisher_company_ids",
        "studio_ids",
        "obsidian_link",
    ]
    errors = []

    for key in required:
        if key not in product:
            errors.append(f"{product_id}: missing {key}")
    if product.get("product_id") != product_id:
        errors.append(f"{product_id}: product_id field is {product.get('product_id')!r}")

    for key in ["aliases", "developer_company_ids", "publisher_company_ids", "studio_ids"]:
        if key in product and not isinstance(product[key], list):
            errors.append(f"{product_id}: {key} must be an array")

    for company_id in as_list(product.get("developer_company_ids")) + as_list(product.get("publisher_company_ids")):
        if company_id not in company_ids:
            errors.append(f"{product_id}: unknown company_id {company_id}")

    for studio_id in as_list(product.get("studio_ids")):
        if studio_id not in studio_ids:
            errors.append(f"{product_id}: unknown studio_id {studio_id}")

    if errors:
        prefix = rel(source_file)
        raise ValueError("\n".join(f"{prefix}: {error}" for error in errors))


def build_registry():
    company_ids = load_company_ids()
    studio_ids = load_studio_ids()
    products = {}
    source_files = []

    for source_file in sorted(PRODUCTS_DIR.glob("*.products.json")):
        source = read_json(source_file)
        source_products = source.get("products")
        if not isinstance(source_products, dict):
            raise ValueError(f"{rel(source_file)}: products must be an object")

        source_company_id = source.get("source_company_id") or source_file.name.removesuffix(".products.json")
        if source_company_id not in company_ids:
            raise ValueError(f"{rel(source_file)}: unknown source_company_id {source_company_id}")

        source_files.append(rel(source_file))
        for product_id, product in source_products.items():
            if product_id in products:
                raise ValueError(f"{rel(source_file)}: duplicate product_id {product_id}")
            validate_product(product_id, product, source_file, company_ids, studio_ids)
            products[product_id] = {
                "product_id": product_id,
                "source_company_id": source_company_id,
                **product,
                "product_id": product_id,
            }

    registry = {
        "schema_version": "1.0",
        "updated_at": date.today().isoformat(),
        "source_files": source_files,
        "products": products,
    }
    write_json(OUT, registry)
    print(f"Wrote {rel(OUT)} ({len(products)} products from {len(source_files)} files)")


if __name__ == "__main__":
    build_registry()
