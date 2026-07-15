"""Small, dependency-light repository smoke check."""
from pathlib import Path
import json

root = Path(__file__).resolve().parents[1]
required = ["apps/web/package.json", "apps/api/pyproject.toml", "packages/sample-workflows/invoice-approval.json", "docs/index.html"]
missing = [path for path in required if not (root / path).exists()]
if missing:
    raise SystemExit(f"Missing required files: {missing}")
json.loads((root / "packages/sample-workflows/invoice-approval.json").read_text(encoding="utf-8"))
print("Flowwright setup files are present and the sample workflow is valid JSON.")
