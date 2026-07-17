"use client";

import { useEffect, useMemo, useRef } from "react";
import {
  Background,
  Controls,
  ReactFlow,
  useEdgesState,
  useNodesState,
  type Edge,
  type Node,
  type NodeMouseHandler,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { WorkflowIR } from "@flowwright/workflow-schema";
import { WorkflowNode } from "./WorkflowNode";

function buildNodes(
  workflow: WorkflowIR,
  selectedStepId?: string | null,
): Node[] {
  return workflow.steps.map((step, index) => ({
    id: step.id,
    data: {
      label: step.name,
      type: step.type,
      description: step.description,
      selected: step.id === selectedStepId,
      confidence: step.confidence,
      evidenceIds: step.evidence_ids,
    },
    position: { x: (index % 3) * 280, y: Math.floor(index / 3) * 200 },
    type: "workflow",
    draggable: true,
  }));
}

function buildEdges(workflow: WorkflowIR): Edge[] {
  if (workflow.edges.length) {
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
  }
  return workflow.steps.flatMap((step) =>
    step.depends_on.map((source) => ({
      id: `${source}-${step.id}`,
      source,
      target: step.id,
      animated: step.requires_ai,
    })),
  );
}

function workflowLayoutKey(workflow: WorkflowIR): string {
  return `${workflow.id}:${workflow.steps.map((step) => step.id).join(",")}`;
}

export function WorkflowCanvas({
  workflow,
  selectedStepId,
  onSelectStep,
}: {
  workflow: WorkflowIR | null;
  selectedStepId?: string | null;
  onSelectStep?: (id: string) => void;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const layoutKeyRef = useRef<string | null>(null);

  const layoutKey = useMemo(
    () => (workflow ? workflowLayoutKey(workflow) : null),
    [workflow],
  );

  useEffect(() => {
    if (!workflow || !layoutKey) {
      setNodes([]);
      setEdges([]);
      layoutKeyRef.current = null;
      return;
    }

    if (layoutKeyRef.current !== layoutKey) {
      layoutKeyRef.current = layoutKey;
      setNodes(buildNodes(workflow, selectedStepId));
      setEdges(buildEdges(workflow));
      return;
    }

    setNodes((current) =>
      current.map((node) => {
        const step = workflow.steps.find((item) => item.id === node.id);
        if (!step) return node;
        return {
          ...node,
          data: {
            ...node.data,
            label: step.name,
            type: step.type,
            description: step.description,
            selected: step.id === selectedStepId,
            confidence: step.confidence,
            evidenceIds: step.evidence_ids,
          },
        };
      }),
    );
  }, [workflow, layoutKey, selectedStepId, setNodes, setEdges]);

  const handleNodeClick: NodeMouseHandler = (_, node) =>
    onSelectStep?.(node.id);

  if (!workflow) {
    return (
      <div className="workflow-canvas-loading">
        <span className="loading-orbit" />
        Loading WorkflowIR...
      </div>
    );
  }

  return (
    <div className="workflow-canvas">
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        nodeTypes={{ workflow: WorkflowNode }}
        onNodeClick={handleNodeClick}
        fitView
        minZoom={0.35}
        maxZoom={1.6}
        panOnDrag={[1, 2]}
        panOnScroll
        zoomOnScroll
        zoomOnPinch
        zoomOnDoubleClick
        nodesDraggable
        nodesConnectable={false}
        elementsSelectable
        selectNodesOnDrag={false}
        preventScrolling
        proOptions={{ hideAttribution: true }}
        aria-label="Interactive invoice workflow graph. Drag each step to reposition it."
      >
        <Background color="#c4c0b7" gap={22} size={1} />
        <Controls showInteractive={false} />
      </ReactFlow>
    </div>
  );
}
