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
import type { WorkflowOrigin } from "../../lib/workflowSession";
import { WorkflowNode } from "./WorkflowNode";

const COLUMN_GAP = 280;
const ROW_GAP = 190;

function dependencyLevels(workflow: WorkflowIR): Map<string, number> {
  const levels = new Map<string, number>();
  const incoming = new Map<string, string[]>();
  for (const step of workflow.steps) {
    incoming.set(step.id, [...step.depends_on]);
  }
  for (const edge of workflow.edges) {
    const current = incoming.get(edge.target_step_id) ?? [];
    if (!current.includes(edge.source_step_id)) {
      current.push(edge.source_step_id);
      incoming.set(edge.target_step_id, current);
    }
  }

  const visiting = new Set<string>();
  const visit = (id: string): number => {
    if (levels.has(id)) return levels.get(id)!;
    if (visiting.has(id)) return 0;
    visiting.add(id);
    const parents = incoming.get(id) ?? [];
    const level =
      parents.length === 0
        ? 0
        : Math.max(...parents.map((parent) => visit(parent))) + 1;
    visiting.delete(id);
    levels.set(id, level);
    return level;
  };

  for (const step of workflow.steps) {
    visit(step.id);
  }
  return levels;
}

function laneForStep(type: string, id: string): number {
  const lower = id.toLowerCase();
  if (type === "human_review" || lower.includes("human")) return 0;
  if (type === "approval" || lower.includes("approv")) return 1;
  if (type === "draft" || lower.includes("exception")) return 2;
  if (type === "condition") return 1;
  if (type === "input") return 1;
  return 1;
}

function buildNodes(
  workflow: WorkflowIR,
  selectedStepId: string | null | undefined,
  origin: WorkflowOrigin,
): Node[] {
  const levels = dependencyLevels(workflow);
  const buckets = new Map<string, typeof workflow.steps>();
  for (const step of workflow.steps) {
    const level = levels.get(step.id) ?? 0;
    const lane = laneForStep(step.type, step.id);
    const key = `${level}:${lane}`;
    const bucket = buckets.get(key) ?? [];
    bucket.push(step);
    buckets.set(key, bucket);
  }

  return workflow.steps.map((step) => {
    const level = levels.get(step.id) ?? 0;
    const lane = laneForStep(step.type, step.id);
    const siblings = buckets.get(`${level}:${lane}`) ?? [step];
    const index = siblings.findIndex((item) => item.id === step.id);
    const offset = (index - (siblings.length - 1) / 2) * 36;
    return {
      id: step.id,
      data: {
        label: step.name,
        type: step.type,
        description: step.description,
        selected: step.id === selectedStepId,
        confidence: step.confidence,
        evidenceIds: step.evidence_ids,
        origin,
        observed:
          origin === "ai_inferred" &&
          step.evidence_ids.length > 0 &&
          !step.requires_ai,
      },
      position: {
        x: lane * COLUMN_GAP + offset,
        y: level * ROW_GAP,
      },
      type: "workflow",
      draggable: true,
    };
  });
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
      labelBgStyle: { fill: "#f1f0e9", fillOpacity: 0.92 },
      labelBgPadding: [4, 6] as [number, number],
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

function workflowLayoutKey(workflow: WorkflowIR, origin: WorkflowOrigin): string {
  return `${workflow.id}:${origin}:${workflow.steps.map((step) => step.id).join(",")}`;
}

export function WorkflowCanvas({
  workflow,
  selectedStepId,
  onSelectStep,
  origin = "sample",
}: {
  workflow: WorkflowIR | null;
  selectedStepId?: string | null;
  onSelectStep?: (id: string) => void;
  origin?: WorkflowOrigin;
}) {
  const [nodes, setNodes, onNodesChange] = useNodesState<Node>([]);
  const [edges, setEdges, onEdgesChange] = useEdgesState<Edge>([]);
  const layoutKeyRef = useRef<string | null>(null);

  const layoutKey = useMemo(
    () => (workflow ? workflowLayoutKey(workflow, origin) : null),
    [workflow, origin],
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
      setNodes(buildNodes(workflow, selectedStepId, origin));
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
            origin,
            observed:
              origin === "ai_inferred" &&
              step.evidence_ids.length > 0 &&
              !step.requires_ai,
          },
        };
      }),
    );
  }, [workflow, layoutKey, selectedStepId, origin, setNodes, setEdges]);

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
