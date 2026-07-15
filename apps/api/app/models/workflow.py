"""Pydantic models for Flowwright's Workflow Intermediate Representation."""

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


class WorkflowDecision(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    description: str
    condition: str = Field(min_length=1)
    true_step_id: str = Field(min_length=1)
    false_step_id: str = Field(min_length=1)


class WorkflowApproval(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    description: str
    trigger: str = Field(min_length=1)
    step_id: str = Field(min_length=1)


class WorkflowTest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    input_case: dict[str, Any]
    expected_outcome: str = Field(min_length=1)
    actual_outcome: str | None = None
    status: TestStatus
    explanation: str


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
    tests: list[WorkflowTest]
    confidence: float = Field(ge=0, le=1)
    created_at: datetime


class AnalyzeRequest(BaseModel):
    model_config = ConfigDict(extra="forbid")

    task_description: str = Field(min_length=3, max_length=20_000)
    browser_event_log: list[dict[str, Any]] | None = None
    screenshots: list[str] | None = None
    transcript: str | None = Field(default=None, max_length=20_000)


class WorkflowTestRequest(BaseModel):
    workflow: WorkflowIR
