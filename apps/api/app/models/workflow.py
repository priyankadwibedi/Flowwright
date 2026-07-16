"""Typed models for Flowwright's evidence, workflow, and execution contracts."""

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field

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
    image_base64: str | None = None
    metadata: list[MetadataEntry] = Field(default_factory=list)


class ProcessedDemonstration(BaseModel):
    model_config = ConfigDict(extra="forbid")

    duration_seconds: float = Field(ge=0)
    frames: list[CapturedFrame] = Field(default_factory=list, max_length=8)
    transcript: str = ""
    transcript_segments: list[TranscriptSegment] = Field(default_factory=list)
    transcription_status: Literal[
        "available", "unavailable", "not_requested", "failed"
    ] = "not_requested"
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


class TestRunResponse(BaseModel):
    workflow_id: str
    started_at: datetime
    completed_at: datetime
    executions: list[TestExecution]
    passed: int = Field(ge=0)
    failed: int = Field(ge=0)
    human_review_count: int = Field(ge=0)
    unsafe_actions_executed: int = Field(default=0, ge=0)


class ClarificationAnswer(BaseModel):
    question_id: str
    answer: str = Field(min_length=1, max_length=2_000)


class ResolveRequest(BaseModel):
    workflow: WorkflowIR
    answers: list[ClarificationAnswer]


class ResolveResponse(BaseModel):
    workflow: WorkflowIR
    remaining_uncertainties: list[WorkflowUncertainty]


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


class InvoiceProcessRequest(BaseModel):
    invoice_file: str = Field(min_length=1)


class InvoiceApprovalRequest(BaseModel):
    invoice_file: str = Field(min_length=1)
    confirm: bool


class InvoiceApprovalResponse(BaseModel):
    invoice_file: str
    status: Literal["approved"]
    message: str
    approval_record_id: str
    protected_action_executed: bool = False
