"""Export the authoritative Pydantic WorkflowIR JSON Schema."""
import json
from pathlib import Path
import sys

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "apps" / "api"))
from app.models.workflow import WorkflowIR  # noqa: E402

output = ROOT / "packages" / "workflow-schema" / "workflow.schema.json"
output.write_text(json.dumps(WorkflowIR.model_json_schema(), indent=2) + "\n", encoding="utf-8")
print(output)
