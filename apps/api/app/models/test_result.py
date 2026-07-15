"""Structured results returned by deterministic workflow tests."""

from typing import Literal

from pydantic import BaseModel, Field


class TestResult(BaseModel):
    id: str = Field(min_length=1)
    name: str = Field(min_length=1)
    input_case: dict[str, str]
    expected_outcome: str
    actual_outcome: str
    status: Literal["passed", "failed", "human_review"]
    explanation: str


class TestRunResponse(BaseModel):
    workflow_id: str
    results: list[TestResult]
