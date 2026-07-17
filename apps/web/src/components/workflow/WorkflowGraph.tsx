"use client";

import {
  Background,
  Controls,
  ReactFlow,
  type Edge,
  type Node,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { WorkflowIR } from "@flowwright/workflow-schema";

export function WorkflowGraph({ workflow }: { workflow: WorkflowIR }) {
  const nodes: Node[] = workflow.steps.map((step, index) => ({
    id: step.id,
    data: { label: step.name },
    position: { x: (index % 3) * 250, y: Math.floor(index / 3) * 140 },
    type: "default",
  }));
  const edges: Edge[] = workflow.steps.flatMap((step) =>
    step.depends_on.map((source) => ({
      id: `${source}-${step.id}`,
      source,
      target: step.id,
      animated: step.requires_ai,
    })),
  );
  return (
    <div
      style={{
        height: 560,
        border: "1px solid var(--line)",
        borderRadius: 14,
        overflow: "hidden",
        background: "#fbfcff",
      }}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        fitView
        panOnDrag
        zoomOnScroll
        zoomOnPinch
        nodesDraggable={false}
        nodesConnectable={false}
        selectNodesOnDrag={false}
        preventScrolling
      >
        <Background />
        <Controls />
      </ReactFlow>
    </div>
  );
}
