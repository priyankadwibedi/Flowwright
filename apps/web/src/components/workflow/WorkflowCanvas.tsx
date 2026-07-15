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
        },
        position: { x: (index % 3) * 245, y: Math.floor(index / 3) * 155 },
        type: "workflow",
      })) ?? [],
    [workflow, selectedStepId],
  );
  const edges = useMemo<Edge[]>(
    () =>
      workflow?.steps.flatMap((step) =>
        step.depends_on.map((source) => ({
          id: `${source}-${step.id}`,
          source,
          target: step.id,
          animated: step.requires_ai,
          style: {
            stroke: step.requires_ai ? "#d49200" : "#77736b",
            strokeWidth: 1.5,
          },
        })),
      ) ?? [],
    [workflow],
  );
  const handleNodeClick: NodeMouseHandler = (_, node) =>
    onSelectStep?.(node.id);
  if (!workflow)
    return (
      <div className="workflow-canvas-loading">
        <span className="loading-orbit" />
        Loading WorkflowIR…
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
