"""Typed models for Flowwright's evidence, workflow, and execution contracts."""

from datetime import datetime
from decimal import Decimal
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator

StepType = Literal[
    "input",
    "ai_extract",
    "lookup",
    "condition",
    "transform",
    "write",
    "draft",
    "approval",
    "human_review",
]
TestStatus = Literal["pending", "passed", "failed", "human_review"]
EvidenceSource = Literal["frame", "browser_event", "speech"]
ValuePolicy = Literal["omitted", "masked", "captured"]
WorkflowKind = Literal["invoice_approval", "unsupported"]
AnswerType = Literal["boolean", "single_select", "short_text"]
TranscriptionStatus = Literal[
    "available",
    "unavailable",
    "not_requested",
    "failed",
    "rate_limited",
    "timeout",
    "invalid_response",
    "missing_audio",
    "missing_api_key",
]
InvoiceFixture = Literal[
    "invoice-exact-match.json",
    "invoice-amount-mismatch.json",
    "invoice-missing-po.json",
    "invoice-unreadable-number.json",
    "invoice-currency-mismatch.json",
    "invoice-fifth-live-case.json",
]
INVOICE_FIXTURES: frozenset[str] = frozenset(
    {
        "invoice-exact-match.json",
        "invoice-amount-mismatch.json",
        "invoice-missing-po.json",
        "invoice-unreadable-number.json",
        "invoice-currency-mismatch.json",
        "invoice-fifth-live-case.json",
    }
)


class KeyValueEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str = Field(min_length=1)
    value: str


class MetadataEntry(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str = Field(min_length=1)
    value: str


class CapturedFrame(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    frame_index: int = Field(ge=0)
    timestamp_seconds: float = Field(ge=0)
    width: int = Field(gt=0)
    height: int = Field(gt=0)
    mime_type: Literal["image/jpeg"]
    image_base64: str = Field(min_length=1)


class TranscriptSegment(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    start_seconds: float = Field(ge=0)
    end_seconds: float = Field(ge=0)
    text: str = Field(min_length=1)


class BrowserEvent(BaseModel):
    """Safe browser event shape shared with the extension and evidence API."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    timestamp: datetime
    elapsed_ms: int = Field(default=0, ge=0)
    tab_id: int = Field(default=0, ge=0)
    url: str = ""
    type: Literal["click", "input", "navigation", "submit"]
    selector: str = Field(default="", max_length=500)
    element_role: str | None = None
    label: str | None = None
    value_policy: ValuePolicy = "omitted"
    value: str | None = None
    description: str | None = Field(default=None, max_length=500)


class EvidenceItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    timestamp_seconds: float = Field(ge=0)
    source: EvidenceSource
    content: str = Field(min_length=1)
    frame_id: str | None = None
    image_base64: str | None = None
    metadata: list[MetadataEntry] = Field(default_factory=list)
    observation_kind: Literal["direct", "inferred"] = "direct"
    confidence: float = Field(default=1.0, ge=0, le=1)

    @model_validator(mode="after")
    def _prefer_frame_reference(self) -> "EvidenceItem":
        if self.source == "frame" and self.frame_id is None and self.id:
            # Timeline entries for frames reference the frame by id; avoid dual storage.
            object.__setattr__(self, "frame_id", self.id)
        return self


class ProcessedDemonstration(BaseModel):
    model_config = ConfigDict(extra="forbid")

    demonstration_id: str = Field(default="", max_length=128)
    duration_seconds: float = Field(ge=0)
    frames: list[CapturedFrame] = Field(default_factory=list, max_length=8)
    transcript: str = ""
    transcript_segments: list[TranscriptSegment] = Field(default_factory=list)
    transcription_status: TranscriptionStatus = "not_requested"
    audio_status: Literal["available", "missing", "unavailable", "not_checked"] = "not_checked"
    browser_events: list[BrowserEvent] = Field(default_factory=list)
    evidence_timeline: list[EvidenceItem] = Field(default_factory=list)


class WorkflowInput(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    description: str
    data_type: str = Field(min_length=1)
    required: bool
    example: Any | None = None


class WorkflowVariable(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    description: str
    data_type: str = Field(min_length=1)
    source: str = Field(min_length=1)
    sensitive: bool
    constant: bool
    confidence: float = Field(default=0.0, ge=0, le=1)
    evidence_ids: list[str] = Field(default_factory=list)


class WorkflowStep(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    type: StepType
    description: str
    depends_on: list[str]
    input_refs: list[str]
    output_refs: list[str]
    configuration: dict[str, Any]
    requires_ai: bool
    requires_approval: bool
    confidence: float = Field(default=0.0, ge=0, le=1)
    evidence_ids: list[str] = Field(default_factory=list)
    accidental: bool = False


class WorkflowDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    description: str
    condition: str = Field(min_length=1)
    true_step_id: str = Field(min_length=1)
    false_step_id: str = Field(min_length=1)
    source_step_id: str | None = None
    confidence: float = Field(default=0.0, ge=0, le=1)
    evidence_ids: list[str] = Field(default_factory=list)


class WorkflowApproval(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    description: str
    trigger: str = Field(min_length=1)
    step_id: str = Field(min_length=1)
    evidence_ids: list[str] = Field(default_factory=list)


class WorkflowEdge(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    source_step_id: str = Field(min_length=1)
    target_step_id: str = Field(min_length=1)
    kind: Literal["success", "failure", "true", "false", "review", "approval"]
    condition: str | None = None
    label: str = Field(min_length=1)


class WorkflowUncertainty(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    question: str = Field(min_length=1)
    reason: str = Field(min_length=1)
    affected_step_ids: list[str]
    required: bool
    answer_type: AnswerType = "single_select"
    allowed_options: list[str] = Field(default_factory=list)
    resolution_target: str = ""


class WorkflowTest(BaseModel):
    """A static test case; runtime status is returned by TestRunResponse."""

    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    input_case: dict[str, Any]
    expected_outcome: str = Field(min_length=1)
    actual_outcome: str | None = None
    status: TestStatus = "pending"
    explanation: str = ""


class WorkflowIR(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    description: str
    version: str = Field(pattern=r"^\d+\.\d+\.\d+$")
    workflow_kind: WorkflowKind = "unsupported"
    demonstration_id: str | None = None
    inputs: list[WorkflowInput]
    variables: list[WorkflowVariable]
    steps: list[WorkflowStep] = Field(min_length=1)
    decisions: list[WorkflowDecision]
    approvals: list[WorkflowApproval]
    edges: list[WorkflowEdge] = Field(default_factory=list)
    uncertainties: list[WorkflowUncertainty] = Field(default_factory=list)
    tests: list[WorkflowTest]
    confidence: float = Field(ge=0, le=1)
    created_at: datetime


class WorkflowVariableDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    description: str
    data_type: Literal[
        "string", "number", "decimal", "boolean", "date", "file", "record"
    ]
    source: str = Field(min_length=1)
    sensitive: bool = False
    constant: bool = False
    confidence: float = Field(ge=0, le=1)
    evidence_ids: list[str]


class WorkflowStepDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    type: StepType
    description: str
    depends_on: list[str]
    input_refs: list[str]
    output_refs: list[str]
    configuration: list[KeyValueEntry]
    requires_ai: bool
    requires_approval: bool
    confidence: float = Field(ge=0, le=1)
    evidence_ids: list[str]
    observation_kind: Literal["observed", "inferred"] = "observed"
    accidental: bool = False


class WorkflowDecisionDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    description: str
    source_step_id: str
    condition: str = Field(min_length=1)
    true_target_step_id: str
    false_target_step_id: str
    confidence: float = Field(ge=0, le=1)
    evidence_ids: list[str]


class WorkflowApprovalDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    description: str
    protected_action: str
    required_before_step_id: str
    evidence_ids: list[str]


class WorkflowDraft(BaseModel):
    model_config = ConfigDict(extra="forbid")

    name: str = Field(min_length=1)
    description: str
    workflow_kind: WorkflowKind
    variables: list[WorkflowVariableDraft]
    steps: list[WorkflowStepDraft] = Field(min_length=1)
    decisions: list[WorkflowDecisionDraft]
    approvals: list[WorkflowApprovalDraft]
    uncertainties: list[WorkflowUncertainty]


class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task_description: str = Field(min_length=3, max_length=20_000)
    browser_event_log: list[dict[str, Any]] | None = None
    screenshots: list[str] | None = None
    transcript: str | None = Field(default=None, max_length=20_000)
    processed_demonstration: ProcessedDemonstration | None = None


class WorkflowTestRequest(BaseModel):
    workflow: WorkflowIR


class TestExecution(BaseModel):
    model_config = ConfigDict(extra="forbid")

    test_id: str
    name: str
    input_case: dict[str, str]
    expected_outcome: str
    actual_outcome: str
    status: Literal["passed", "failed", "human_review"]
    duration_ms: float = Field(ge=0)
    explanation: str
    logs: list[str] = Field(default_factory=list)


class ArtifactExecutionResult(BaseModel):
    model_config = ConfigDict(extra="forbid")

    exit_code: int
    duration_ms: float = Field(ge=0)
    stdout: str = ""
    stderr: str = ""
    timed_out: bool = False
    artifact_paths: list[str] = Field(default_factory=list)


class TestRunResponse(BaseModel):
    workflow_id: str
    started_at: datetime
    completed_at: datetime
    executions: list[TestExecution]
    mandatory_test_count: int = Field(default=0, ge=0)
    optional_test_count: int = Field(default=0, ge=0)
    passed: int = Field(ge=0)
    failed: int = Field(ge=0)
    human_review_count: int = Field(ge=0)
    unsafe_actions_executed: int = Field(default=0, ge=0)
    artifact_execution: ArtifactExecutionResult | None = None
    generator_version: str | None = None
    compiler_fingerprint: str | None = None


class ClarificationAnswer(BaseModel):
    question_id: str
    answer: str = Field(min_length=1, max_length=2_000)


class ResolveRequest(BaseModel):
    workflow: WorkflowIR
    answers: list[ClarificationAnswer]


class ResolveResponse(BaseModel):
    workflow: WorkflowIR
    remaining_uncertainties: list[WorkflowUncertainty]
    remaining_required: list[WorkflowUncertainty] = Field(default_factory=list)
    remaining_optional: list[WorkflowUncertainty] = Field(default_factory=list)
    generation_ready: bool = False


class GeneratedFile(BaseModel):
    path: str = Field(pattern=r"^[a-zA-Z0-9_./-]+$")
    language: str = Field(min_length=1)
    content: str


class ExecutableWorkflow(BaseModel):
    workflow_id: str
    runtime: Literal["python"]
    files: list[GeneratedFile]
    generated_at: datetime
    generator_version: str
    compiler_fingerprint: str | None = None
    workflow_kind: WorkflowKind = "invoice_approval"


class InvoiceProcessRequest(BaseModel):
    invoice_file: InvoiceFixture
    workflow: WorkflowIR | None = None

    @field_validator("invoice_file")
    @classmethod
    def _allowlisted(cls, value: str) -> str:
        if value not in INVOICE_FIXTURES:
            raise ValueError("Invoice fixture is not in the allowlist")
        return value


class InvoiceApprovalRequest(BaseModel):
    invoice_file: InvoiceFixture
    confirm: bool
    workflow: WorkflowIR
    compiled_workflow_id: str = Field(min_length=1)
    compiler_hash: str = Field(min_length=1)
    decision: Literal["approved"]
    timestamp: datetime


class InvoiceApprovalResponse(BaseModel):
    invoice_file: str
    status: Literal["approved"]
    message: str
    approval_record_id: str
    compiled_workflow_id: str
    compiler_hash: str
    decision: Literal["approved"]
    timestamp: datetime
    protected_action_executed: bool = False


class WorkflowCorrection(BaseModel):
    model_config = ConfigDict(extra="forbid")

    step_id: str = Field(min_length=1)
    accidental: bool | None = None
    rename: str | None = Field(default=None, max_length=200)
    variable_id: str | None = None
    mark_constant: bool | None = None
    require_human_approval: bool | None = None


class CorrectWorkflowRequest(BaseModel):
    workflow: WorkflowIR
    corrections: list[WorkflowCorrection] = Field(min_length=1)


# Re-export Decimal for callers that type against monetary fields.
Money = Decimal
