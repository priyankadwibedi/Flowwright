"use client";

import { useMemo } from "react";
import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { WorkflowIR } from "@flowwright/workflow-schema";
import { WorkflowNode } from "./WorkflowNode";

export function WorkflowCanvas({
  workflow,
  selectedStepId,
  onSelectStep,
}: {
  workflow: WorkflowIR | null;
  selectedStepId?: string | null;
  onSelectStep?: (id: string) => void;
}) {
  const nodes = useMemo<Node[]>(
    () =>
      workflow?.steps.map((step, index) => ({
        id: step.id,
        data: {
          label: step.name,
          type: step.type,
          description: step.description,
          selected: step.id === selectedStepId,
          confidence: step.confidence,
          evidenceIds: step.evidence_ids,
        },
        position: { x: (index % 3) * 245, y: Math.floor(index / 3) * 155 },
        type: "workflow",
      })) ?? [],
    [workflow, selectedStepId],
  );
  const edges = useMemo<Edge[]>(() => {
    if (!workflow) return [];
    if (workflow.edges.length)
      return workflow.edges.map((edge) => ({
        id: edge.id,
        source: edge.source_step_id,
        target: edge.target_step_id,
        label: edge.label,
        animated: edge.kind === "review" || edge.kind === "approval",
        style: {
          stroke:
            edge.kind === "review"
              ? "#b5413c"
              : edge.kind === "approval"
                ? "#d49200"
                : edge.kind === "false"
                  ? "#9a6f55"
                  : "#77736b",
          strokeWidth: 1.8,
          strokeDasharray: edge.kind === "review" ? "5 4" : undefined,
        },
        labelStyle: {
          fill: "#68645d",
          fontSize: 10,
          fontFamily: "var(--font-geist-mono), monospace",
        },
        labelBgStyle: { fill: "#f1f0e9", fillOpacity: 0.9 },
      }));
    return workflow.steps.flatMap((step) =>
      step.depends_on.map((source) => ({
        id: `${source}-${step.id}`,
        source,
        target: step.id,
        animated: step.requires_ai,
      })),
    );
  }, [workflow]);
  const handleNodeClick: NodeMouseHandler = (_, node) =>
    onSelectStep?.(node.id);
  if (!workflow)
    return (
      <div className="workflow-canvas-loading">
        <span className="loading-orbit" />
        Loading WorkflowIR...
      </div>
    );
  return (
    <div className="workflow-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={{ workflow: WorkflowNode }}
        onNodeClick={handleNodeClick}
        fitView
        minZoom={0.45}
        maxZoom={1.2}
        aria-label="Interactive invoice workflow graph"
      >
        <Background color="#c4c0b7" gap={22} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
