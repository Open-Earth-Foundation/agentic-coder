"use client";

import { PageHeader, Section, Card, CardHeader, Badge, StatCard } from "@/components/PageHeader";

interface AgentStatus {
  name: string;
  step: number;
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
    step: 3,
    description: "Reads a confirmed Linear epic and proposes 3-15 draft tickets. Each sub-issue is created with label `ready-for-quality`, kicking off the next stage of the pipeline.",
    status: "online",
    lastRun: "24/7 on AWS (systemd, polls every 5 min)",
    tasksProcessed: 0,
    cost: 0,
    successRate: 100,
    details: [
      { label: "Trigger", value: "Epic labeled `needs-decomposition`" },
      { label: "Poll interval", value: "Every 300 seconds" },
      { label: "Model", value: "claude-haiku-4-5" },
      { label: "Output", value: "Sub-issues with state=Triage + labels [ai-proposed, ready-for-quality] + summary comment on the epic" },
      { label: "Hand-off", value: "Sub-issues → Quality Gate (Step 5)" },
      { label: "Cleanup", value: "Strips `needs-decomposition` from the epic when done" },
    ],
  },
  {
    name: "AI Ticket Quality Gate",
    step: 5,
    description: "Gates tickets before they enter estimation. Scores description quality (1-10), classifies (Story/Task/Bug/Spike), rewrites description with AC + DoR + technical notes. Approves or asks for correction.",
    status: "online",
    lastRun: "24/7 on AWS (polls every 3 min)",
    tasksProcessed: 0,
    cost: 0,
    successRate: 100,
    details: [
      { label: "Trigger", value: "Label `ready-for-quality`" },
      { label: "Poll interval", value: "Every 180 seconds" },
      { label: "Model", value: "claude-haiku-4-5" },
      { label: "PASS output", value: "Rewrites description with Summary/AC/DoR/Tech Notes. Swaps label → `ready-for-estimation`" },
      { label: "FAIL output", value: "Lists concrete gaps in a comment. Swaps label → `quality-fail`. Human fixes and re-adds `ready-for-quality`" },
      { label: "Bypass", value: "Product can add `ready-for-estimation` directly to skip the gate" },
      { label: "Hand-off", value: "PASS → AI Estimation Engine (Step 6)" },
    ],
  },
  {
    name: "AI Estimation Engine",
    step: 6,
    description: "Scores gated tickets with impact (5 dimensions), confidence, T-shirt suggestion, and rationale. Grounded in 46 historical samples + top-5 similar past completed tickets + parent epic context.",
    status: "online",
    lastRun: "24/7 on AWS (polls every 2 min)",
    tasksProcessed: 68,
    cost: 0.34,
    successRate: 100,
    details: [
      { label: "Trigger", value: "Label `ready-for-estimation`" },
      { label: "Poll interval", value: "Every 120 seconds" },
      { label: "Model", value: "claude-haiku-4-5" },
      { label: "Context bundle", value: "Title, description, parent epic, initiative, 5 most-similar past tickets with actuals, global baseline (46 samples, avg 9.9d)" },
      { label: "Calibration", value: "AI-empowered team (~50% lower than traditional estimates)" },
      { label: "Output", value: "AI Estimation comment. Swaps label → `ai-estimated`" },
      { label: "Hand-off", value: "Human votes Shift+E → Calibrator (Step 8)" },
    ],
  },
  {
    name: "AI Calibration",
    step: 8,
    description: "Final estimate recommendation after the dev has voted. Reads AI suggestion + Dev estimate + dev's rationale comments + historical patterns. Flags severe divergences for 2-min sprint planning discussion.",
    status: "online",
    lastRun: "24/7 on AWS (polls every 3 min)",
    tasksProcessed: 0,
    cost: 0,
    successRate: 100,
    details: [
      { label: "Trigger", value: "Issue has `ai-estimated` + numeric estimate set by dev + no `ai-calibrated` yet" },
      { label: "Poll interval", value: "Every 180 seconds" },
      { label: "Model", value: "claude-haiku-4-5" },
      { label: "Key input", value: "Dev's rationale comments posted AFTER Shift+E vote (was missing before)" },
      { label: "Output", value: "Calibration comment with severity (none/low/medium/high), calibrated_size, rationale. Adds `ai-calibrated` label" },
      { label: "Discussion flag", value: "medium/high divergence → surfaced for 2-min sprint planning chat" },
    ],
  },
  {
    name: "ROI Measurement",
    step: 10,
    description: "Closes the estimation feedback loop. When an issue goes to Done, computes actual_days (Mon-Fri approximation), cost at $300/day, delta vs estimate, accuracy verdict. Appends to calibration_data.json for future estimates.",
    status: "online",
    lastRun: "24/7 on AWS (polls every 5 min)",
    tasksProcessed: 1,
    cost: 0,
    successRate: 100,
    details: [
      { label: "Trigger", value: "State=completed + estimate set + no `roi-measured` label" },
      { label: "Poll interval", value: "Every 300 seconds" },
      { label: "Model", value: "N/A — pure computation, no LLM call (cheap!)" },
      { label: "Computes", value: "actual business days, cost, delta vs dev estimate, accuracy verdict" },
      { label: "Output", value: "ROI Measurement comment with a full table. Adds `roi-measured` label. Appends record to calibration_data.json" },
      { label: "Feedback loop", value: "Every measurement makes the next AI Estimation more accurate — closed loop" },
    ],
  },
  {
    name: "Agentic Coder",
    step: 9,
    description: "Autonomous coding agent. Picks up Linear issues labeled `agent-ready`, reads codebase, implements, opens PR, comments back on the issue. Currently runs locally; deploying to AWS is the next step (needs GitHub PAT).",
    status: "idle",
    lastRun: "Local only. Successfully opened Open-Earth-Foundation/CityCatalyst#2737 on Jun 26.",
    tasksProcessed: 1,
    cost: 6.33,
    successRate: 100,
    details: [
      { label: "Trigger", value: "Linear label `agent-ready`" },
      { label: "Poll interval", value: "Every 2 minutes (once deployed)" },
      { label: "Model", value: "claude-sonnet-4-5 + evaluator pass" },
      { label: "Repo target", value: "CityCatalyst (base: develop)" },
      { label: "Branch pattern", value: "agentic-coder/<slug>" },
      { label: "Safety", value: "Never merges its own PRs. All PRs go through human review." },
      { label: "Blocker", value: "Needs a GitHub PAT with `repo` scope to open PRs on Open-Earth-Foundation org" },
    ],
  },
];

const STATUS_COLOR = {
  online: { dot: "bg-green-500", text: "text-green-700", bg: "bg-green-50", label: "Live on AWS" },
  idle: { dot: "bg-amber-500", text: "text-amber-700", bg: "bg-amber-50", label: "Ready (needs PAT)" },
  offline: { dot: "bg-red-500", text: "text-red-700", bg: "bg-red-50", label: "Offline" },
};

export default function AgentsPage() {
  const onlineCount = AGENTS.filter(a => a.status === "online").length;
  const totalTasks = AGENTS.reduce((s, a) => s + a.tasksProcessed, 0);
  const totalCost = AGENTS.reduce((s, a) => s + a.cost, 0);

  return (
    <>
      <PageHeader
        title="AI Agents"
        subtitle="Six agents power the end-to-end flow. Five run 24/7 on our AWS instance. One (Agentic Coder) awaits GitHub PAT before deploy."
      />

      <Section>
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="Agents Live on AWS" value={`${onlineCount} / ${AGENTS.length}`} variant="brand" sub={`${AGENTS.length - onlineCount} awaiting deploy`} />
          <StatCard label="Tasks Processed" value={totalTasks} sub="Across all agents, all time" />
          <StatCard label="Total Cost" value={`$${totalCost.toFixed(2)}`} variant="success" sub="Anthropic API spend to date" />
          <StatCard label="Success Rate" value="100%" variant="success" sub="No failed runs recorded" />
        </div>
      </Section>

      <Section title="Pipeline Sequence" description="Labels drive the flow. Each agent hands off to the next by swapping labels on the Linear issue.">
        <Card className="p-5">
          <pre className="text-xs text-[#232640] overflow-x-auto leading-relaxed font-mono">{`Epic (needs-decomposition)
  → Decomposer                       → sub-issues (ready-for-quality)
  → Quality Gate  PASS               → (ready-for-estimation)
                  FAIL               → (quality-fail, human fixes)
  → Estimation Engine                → (ai-estimated)
  → Human votes Shift+E + comments
  → Calibrator                       → (ai-calibrated)
  → Team executes (agentic-coder, non-tech, or dev)
  → State=Done
  → ROI Measurer                     → (roi-measured) + calibration_data.json updated
  → Next AI Estimation benefits from this measurement`}</pre>
        </Card>
      </Section>

      <Section title="Agent Details">
        <div className="space-y-4">
          {AGENTS.map(agent => {
            const sc = STATUS_COLOR[agent.status];
            return (
              <Card key={agent.name}>
                <div className="p-5">
                  <div className="flex items-start justify-between mb-4">
                    <div className="flex-1">
                      <div className="flex items-center gap-3">
                        <Badge tone="brand">Step {agent.step}</Badge>
                        <h3 className="text-lg font-bold text-[#00001F]">{agent.name}</h3>
                        <span className={`inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-xs font-semibold ${sc.bg} ${sc.text}`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${sc.dot} ${agent.status === "online" ? "animate-pulse-soft" : ""}`} />
                          {sc.label}
                        </span>
                      </div>
                      <p className="text-sm text-[#7A7B9A] mt-1.5 max-w-3xl">{agent.description}</p>
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

                  <div className="grid grid-cols-2 gap-x-6 gap-y-2">
                    {agent.details.map(d => (
                      <div key={d.label} className="flex gap-3 text-sm">
                        <span className="text-[#7A7B9A] font-medium min-w-[130px] flex-shrink-0">{d.label}:</span>
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

      <Section title="Three Execution Modes" description="Once an issue is calibrated (Step 8), it can be executed via any of three paths. All produce PRs reviewed by engineering.">
        <div className="grid grid-cols-3 gap-4">
          <Card className="p-5">
            <Badge tone="success">Mode 1</Badge>
            <h3 className="text-base font-bold text-[#00001F] mt-3">Engineering</h3>
            <p className="text-sm text-[#7A7B9A] mt-2">Engineer picks issue from cycle, codes, opens PR, gets review, merges. Traditional workflow.</p>
          </Card>
          <Card className="p-5">
            <Badge tone="brand">Mode 2</Badge>
            <h3 className="text-base font-bold text-[#00001F] mt-3">Autonomous Agent</h3>
            <p className="text-sm text-[#7A7B9A] mt-2">Issue labeled <code className="text-xs bg-gray-100 px-1 rounded">agent-ready</code>. Agentic-coder picks it up, implements, opens PR.</p>
          </Card>
          <Card className="p-5">
            <Badge tone="info">Mode 3</Badge>
            <h3 className="text-base font-bold text-[#00001F] mt-3">Non-Tech Guided</h3>
            <p className="text-sm text-[#7A7B9A] mt-2">Anyone calls <code className="text-xs bg-gray-100 px-1 rounded">non-tech-contribute</code> skill in Cursor. AI handles git, code, PR.</p>
          </Card>
        </div>
      </Section>
    </>
  );
}
