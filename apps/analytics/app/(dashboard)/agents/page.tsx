"use client";

import { useEffect, useState } from "react";
import { PageHeader, Section, Card, CardHeader, Badge, StatCard } from "@/components/PageHeader";

interface AgentStatus {
  name: string;
  description: string;
  status: "online" | "offline" | "idle";
  lastRun?: string;
  tasksProcessed: number;
  cost: number;
  successRate: number;
  details: { label: string; value: string }[];
}

const AGENTS: AgentStatus[] = [
  {
    name: "AI Epic Decomposer",
    description: "Reads a confirmed Linear epic and proposes 3-15 draft tickets (with title, description, type, area) as sub-issues for product review.",
    status: "idle",
    lastRun: "Ready to deploy (./run.sh decompose CC-XXX)",
    tasksProcessed: 0,
    cost: 0,
    successRate: 0,
    details: [
      { label: "Source", value: "Linear (epic by ID or label='needs-decomposition')" },
      { label: "Trigger", value: "Manual (./run.sh decompose CC-XXX) or watch mode" },
      { label: "Model", value: "claude-haiku-4-5 (fast + cheap)" },
      { label: "Output", value: "Sub-issues with state='Triage' + label='ai-proposed' + summary comment" },
      { label: "Pipeline step", value: "Step 3 — between Epic Proposal and Product Review" },
      { label: "Status", value: "READY. Code in agent_factory/epic_decomposer.py" },
    ],
  },
  {
    name: "AI Ticket Quality",
    description: "Refines a Linear ticket draft into a sprint-ready issue with structured Summary, Acceptance Criteria, DoR, and Technical Notes.",
    status: "idle",
    lastRun: "Ready to deploy (./run.sh quality CC-XXX)",
    tasksProcessed: 0,
    cost: 0,
    successRate: 0,
    details: [
      { label: "Source", value: "Linear (issue by ID or label='needs-refinement')" },
      { label: "Trigger", value: "Manual or watch mode (every 180s)" },
      { label: "Model", value: "claude-haiku-4-5" },
      { label: "Logic", value: "Mirrors CityCatalyst create-ticket / refine-ticket skill" },
      { label: "Output", value: "Updates issue description; preserves original at the bottom" },
      { label: "Status", value: "READY. Code in agent_factory/ticket_quality.py" },
    ],
  },
  {
    name: "AI Estimation Engine",
    description: "Scores every new Linear issue automatically. Generates impact score, T-shirt suggestion, and rationale within 60 seconds of creation.",
    status: "idle",
    lastRun: "Ready to deploy (./run.sh estimate)",
    tasksProcessed: 4,
    cost: 0.04,
    successRate: 100,
    details: [
      { label: "Source", value: "Linear (filter: estimate is null)" },
      { label: "Poll interval", value: "Every 120 seconds" },
      { label: "Model", value: "claude-haiku-4-5 (fast + cheap)" },
      { label: "Calibration", value: "46 historical samples (avg 9.9d cycle time)" },
      { label: "Bias", value: "AI-empowered: ~50% lower than traditional estimates" },
      { label: "Output", value: "Posts formatted comment with impact score + T-shirt suggestion" },
      { label: "Tested", value: "CC-424, CC-425, CC-426, CC-427 all estimated successfully" },
      { label: "Status", value: "READY. Code in agent_factory/estimator.py" },
    ],
  },
  {
    name: "AI Calibration",
    description: "Compares the AI estimate vs the Dev estimate vs historical data. Flags significant divergences for a 2-min discussion in sprint planning.",
    status: "idle",
    lastRun: "Ready to deploy (./run.sh calibrate CC-XXX)",
    tasksProcessed: 0,
    cost: 0,
    successRate: 0,
    details: [
      { label: "Source", value: "Linear (issues with estimate but no calibration comment)" },
      { label: "Trigger", value: "After dev sets estimate via Shift+E" },
      { label: "Model", value: "claude-haiku-4-5" },
      { label: "Logic", value: "Extracts AI suggestion from comments, compares to dev estimate + historical baseline" },
      { label: "Output", value: "Calibration comment with severity, calibrated_size, rationale, optional discussion flag" },
      { label: "Status", value: "READY. Code in agent_factory/calibrator.py" },
    ],
  },
  {
    name: "Agentic Coder",
    description: "Autonomous coding agent that polls Linear for `agent-ready` issues, implements them, and opens PRs for review.",
    status: "idle",
    lastRun: "Ready to deploy (./run.sh watch linear)",
    tasksProcessed: 0,
    cost: 0,
    successRate: 0,
    details: [
      { label: "Source", value: "Linear (filter: label = agent-ready)" },
      { label: "Poll interval", value: "Every 2 minutes" },
      { label: "Model", value: "claude-sonnet-4 + evaluator pass" },
      { label: "Repo target", value: "CityCatalyst (base: develop)" },
      { label: "Branch pattern", value: "agentic-coder/<slug>" },
      { label: "Safety", value: "Never merges its own PRs. All PRs go through human review." },
      { label: "Status", value: "READY. Code in agent_factory/adapters/linear.py + agent.py" },
    ],
  },
];

const STATUS_COLOR = {
  online: { dot: "bg-green-500", text: "text-green-700", bg: "bg-green-50", label: "Live" },
  idle: { dot: "bg-[#2351DC]", text: "text-[#2351DC]", bg: "bg-[#E8EAFB]", label: "Ready to deploy" },
  offline: { dot: "bg-red-500", text: "text-red-700", bg: "bg-red-50", label: "Offline" },
};

export default function AgentsPage() {
  return (
    <>
      <PageHeader
        title="AI Agents"
        subtitle="Status, performance, and configuration of the autonomous agents in the system."
      />

      <Section>
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="Agents Built" value="5" variant="brand" sub="All ready to deploy" />
          <StatCard label="Tasks (24h)" value="4" sub="All estimation jobs" />
          <StatCard label="Cost (24h)" value="$0.04" variant="success" sub="Anthropic API spend" />
          <StatCard label="Success Rate" value="100%" variant="success" sub="No failures yet" />
        </div>
      </Section>

      <Section title="Agent Details">
        <div className="space-y-4">
          {AGENTS.map(agent => {
            const sc = STATUS_COLOR[agent.status];
            return (
              <Card key={agent.name}>
                <div className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div>
                      <div className="flex items-center gap-3">
                        <h3 className="text-lg font-bold text-[#00001F]">{agent.name}</h3>
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${sc.bg} ${sc.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${sc.dot} ${agent.status === "online" ? "animate-pulse-soft" : ""}`} />
                          {sc.label}
                        </span>
                      </div>
                      <p className="text-sm text-[#7A7B9A] mt-1.5 max-w-2xl">{agent.description}</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-4 gap-3 mb-4 pb-4 border-b" style={{ borderColor: "#E5E7EB" }}>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-[#7A7B9A] font-semibold">Last Run</p>
                      <p className="text-sm font-medium text-[#00001F] mt-1">{agent.lastRun || "Never"}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-[#7A7B9A] font-semibold">Tasks Processed</p>
                      <p className="text-sm font-medium text-[#00001F] mt-1">{agent.tasksProcessed}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-[#7A7B9A] font-semibold">Total Cost</p>
                      <p className="text-sm font-medium text-[#00001F] mt-1">${agent.cost.toFixed(2)}</p>
                    </div>
                    <div>
                      <p className="text-xs uppercase tracking-wide text-[#7A7B9A] font-semibold">Success Rate</p>
                      <p className="text-sm font-medium text-[#00001F] mt-1">{agent.successRate}%</p>
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-x-6 gap-y-2.5">
                    {agent.details.map(d => (
                      <div key={d.label} className="flex gap-3 text-sm">
                        <span className="text-[#7A7B9A] font-medium min-w-[120px]">{d.label}:</span>
                        <span className="text-[#232640]">{d.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </Section>

      <Section title="Three Execution Modes" description="Every Linear issue can be executed via one of three paths. All produce PRs reviewed by engineering.">
        <div className="grid grid-cols-3 gap-4">
          <Card className="p-5">
            <Badge tone="success">Mode 1</Badge>
            <h3 className="text-base font-bold text-[#00001F] mt-3">Engineering</h3>
            <p className="text-sm text-[#7A7B9A] mt-2">Engineer picks issue from sprint, codes, opens PR, gets review, merges. Traditional workflow.</p>
          </Card>
          <Card className="p-5">
            <Badge tone="brand">Mode 2</Badge>
            <h3 className="text-base font-bold text-[#00001F] mt-3">Autonomous Agent</h3>
            <p className="text-sm text-[#7A7B9A] mt-2">Issue labeled <code className="text-xs bg-gray-100 px-1 rounded">agent-ready</code>. Agentic-coder picks it up, implements, opens PR.</p>
          </Card>
          <Card className="p-5">
            <Badge tone="info">Mode 3</Badge>
            <h3 className="text-base font-bold text-[#00001F] mt-3">Non-Tech Guided</h3>
            <p className="text-sm text-[#7A7B9A] mt-2">Anyone calls <code className="text-xs bg-gray-100 px-1 rounded">non-tech-contribute</code> skill. AI handles git, code, PR.</p>
          </Card>
        </div>
      </Section>
    </>
  );
}
