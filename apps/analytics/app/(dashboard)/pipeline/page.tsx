"use client";

import { useState } from "react";
import Link from "next/link";
import { PageHeader, Section, Card, CardHeader, Badge } from "@/components/PageHeader";

type Status = "live" | "ready" | "manual" | "planned";
type Domain = "external" | "product" | "ai" | "engineering" | "leadership";

interface Stage {
  step: number;
  owner: string;
  domain: Domain;
  title: string;
  desc: string;
  input: string;
  output: string;
  status: Status;
  detail: string[];
  persona?: string;
}

const STAGES: Stage[] = [
  {
    step: 0,
    owner: "Funga",
    domain: "external",
    title: "Meeting Intelligence",
    desc: "Funga listens to meetings via Fireflies. Extracts decisions, action items, ticket suggestions.",
    input: "Meeting transcript (Fireflies)",
    output: "Decisions, action items, suggested tickets",
    status: "live",
    persona: "Funga bot (JVP's system, runs on Replit)",
    detail: [
      "Fireflies records the meeting. Funga (funga@openearth.org) was invited.",
      "Claude extracts: summary, decisions, action items, KB findings, fungaCommands.",
      "Posts summary to Slack + Notion meeting DB.",
      "Voice commands like 'Funga, create a ticket for X' detected (creates in Jira today).",
      "We do NOT touch Funga. We consume its output as input for our pipeline.",
    ],
  },
  {
    step: 1,
    owner: "Product",
    domain: "product",
    title: "Initiative Refinement",
    desc: "Product team takes meeting outputs + grants + product needs. Refines a sustained area of work.",
    input: "Meeting actions, engagements, grants",
    output: "Refined Initiative (Notion + Linear Project)",
    status: "manual",
    persona: "JVP (Director of Product)",
    detail: [
      "Validates: multi-epic, multi-quarter, named owner, recognized in conversation",
      "Creates Notion page + Slack channel for the initiative",
      "Links to engagement/grant if applicable",
      'Examples: "Brazil Phase 3", "URBIND", "CC Agentic Flow"',
      "Becomes a Linear Project once confirmed",
    ],
  },
  {
    step: 2,
    owner: "Product",
    domain: "product",
    title: "Epic Proposal + PERT Estimation",
    desc: "Product proposes epics under the initiative. PERT-estimates effort per role (Funga DM interview).",
    input: "Initiative + user stories + roles",
    output: "Estimated epic (FTE-sprints + calendar)",
    status: "live",
    persona: "Product team via Funga (Slack DM interview)",
    detail: [
      "Per-role PERT in FTE-sprints (Optimistic / Most-likely / Pessimistic)",
      "Roles: AI, DataEng, FullStack, PD, PM, AcctMgr",
      "Importance score: Alignment (0.4) + Revenue (0.3) + External demand (0.3) -> 0-100",
      "Scope confidence: 1-5 (below 3 = low confidence flag)",
      "Duration estimate (calendar-sprints, distinct from effort)",
      "Approved epic gets Status='Confirmed' in Notion Estimations DB",
    ],
  },
  {
    step: 3,
    owner: "Funga + Product",
    domain: "product",
    title: "Funga Epic Slice",
    desc: "Funga slices an epic with a human preview before anything is created. Tickets land in Triage with pipeline labels so the Quality Gate can fill them in.",
    input: "Confirmed epic + linked Notion docs + human-approved slice preview",
    output: "Tickets in Triage with ai-proposed + ready-for-quality + type/area",
    status: "live",
    persona: "Funga (Slack/MCP) — replaces the old needs-decomposition poller",
    detail: [
      "Human reviews the slice preview before any ticket is written",
      "Creates tickets in Triage with labels ['ai-proposed', 'ready-for-quality'] + type + area",
      "Tickets of 1–3 days, verb + noun titles",
      "Thin tickets enter Step 5 (Quality Gate) via ready-for-quality",
      "Full-walk / refined tickets skip the gate with ready-for-estimation",
    ],
  },
  {
    step: 4,
    owner: "Product",
    domain: "product",
    title: "Product Review + Curation",
    desc: "Product accepts, modifies, removes, or adds tickets. Tags `AI SWE Intern` or `agent-ready` candidates.",
    input: "Suggested ticket list",
    output: "Curated ticket set",
    status: "manual",
    persona: "JVP + product team",
    detail: [
      "Reviews each AI-proposed ticket in Linear",
      "Marks tickets they want, removes the rest",
      "Adds new tickets if AI missed something",
      "Can flag `AI SWE Intern` or `agent-ready` (or leave blank for planning meeting)",
      "Sets priority (Urgent/High/Medium/Low)",
    ],
  },
  {
    step: 5,
    owner: "AI",
    domain: "ai",
    title: "AI Ticket Quality Pass",
    desc: "Each curated ticket is enriched: applies `create-ticket` or `refine-ticket` skill for codebase refs + AC.",
    input: "Curated ticket (draft)",
    output: "Sprint-ready ticket + gate decision (PASS or FAIL)",
    status: "live",
    persona: "AI Ticket Quality Gate (running 24/7 on AWS)",
    detail: [
      "Trigger: label `ready-for-quality`",
      "Scores description quality (1-10) + classifies (Story/Task/Bug/Spike/Incident)",
      "PASS (score >= 6): rewrites description with Summary + AC + DoR + Technical Notes; swaps label `ready-for-quality` → `ready-for-estimation`",
      "FAIL (score < 6): posts comment listing concrete gaps; swaps label → `quality-fail`",
      "Human fixes the FAIL cases and re-adds `ready-for-quality`; agent re-runs automatically",
      "Product can bypass the gate by manually adding `ready-for-estimation`",
      "Status: LIVE. Polls every 3 min on AWS.",
    ],
  },
  {
    step: 6,
    owner: "AI",
    domain: "ai",
    title: "AI Estimation",
    desc: "AI scores impact + suggests T-shirt size for every ticket within 60 seconds.",
    input: "Quality-passed ticket (labeled `ready-for-estimation`)",
    output: "Impact score + T-shirt suggestion + rationale (Linear comment)",
    status: "live",
    persona: "AI Estimation Engine (running 24/7 on AWS)",
    detail: [
      "Trigger: label `ready-for-estimation` (set by Quality Gate on PASS)",
      "Polls Linear every 2 min",
      "Context bundle: title + description + parent epic + initiative + top-5 similar past completed tickets + 46-sample historical baseline (avg 9.9d cycle time)",
      "Scores 5 impact dimensions: User Impact (30%), Mission (25%), Revenue (20%), Tech Health (15%), Velocity (10%)",
      "Calibrated for AI-empowered team (~50% lower than traditional estimates)",
      "Posts formatted comment with rationale; swaps label `ready-for-estimation` → `ai-estimated`",
      "Status: LIVE. Has processed 60+ issues on AWS.",
    ],
  },
  {
    step: 7,
    owner: "Engineering",
    domain: "engineering",
    title: "Sprint Planning + Dev Voting",
    desc: "Team gathers, sees AI estimate, votes own T-shirt. Discusses divergences.",
    input: "AI-estimated backlog",
    output: "Sprint commitments with dev estimates",
    status: "manual",
    persona: "Engineering team meeting",
    detail: [
      "30-second decision per ticket: agree with AI, override, or delegate to AI Intern",
      "Shift+E in Linear to set estimate",
      "If delegated -> ticket gets `agent-ready` label",
      "T-shirt: XS (<1h), S (2-4h), M (1d), L (2-3d), XL (4-5d)",
      "Status: LIVE. Engineers can do this today.",
    ],
  },
  {
    step: 8,
    owner: "AI",
    domain: "ai",
    title: "AI Calibration",
    desc: "Compares AI vs Dev estimate vs historical data. Flags severe divergences for 2-min discussion.",
    input: "AI estimate + Dev estimate + Dev rationale + historical actuals",
    output: "Final calibrated_size + divergence flag (Linear comment)",
    status: "live",
    persona: "AI Calibration Agent (running 24/7 on AWS)",
    detail: [
      "Trigger: issue has `ai-estimated` + numeric estimate set + no `ai-calibrated` yet",
      "Reads the AI Estimation comment (regex extraction)",
      "Reads the dev's numeric estimate + ALL dev comments posted after the AI estimation (rationale)",
      "Cross-references with similar past completed tickets by area labels",
      "Computes divergence severity: none / low / medium / high",
      "Recommends a final calibrated_size; grounds recommendation in specific dev comments where relevant",
      "Flags medium/high divergence for 2-min sprint planning discussion",
      "Posts calibration comment + adds `ai-calibrated` label",
      "Status: LIVE. Polls every 3 min on AWS.",
    ],
  },
  {
    step: 9,
    owner: "Engineering",
    domain: "engineering",
    title: "Sprint Delivery",
    desc: "Work happens via 3 execution modes: human dev, AI agent, or non-tech guided.",
    input: "Calibrated sprint plan",
    output: "PRs + actual_days (auto-measured)",
    status: "ready",
    persona: "Dev, Agent, or Non-Tech contributor",
    detail: [
      "Mode 1 (Human): Engineer picks ticket, codes, opens PR",
      "Mode 2 (Agent): `agent-ready` tickets picked by agentic-coder, auto-PR",
      "Mode 3 (Non-tech): Anyone uses `non-tech-contribute` skill in Cursor",
      "All paths produce PRs reviewed by engineering",
      "Time auto-tracked from Linear status transitions",
      "actual_days = time from 'In Progress' to 'Done' (working days)",
      "Run: ./run.sh watch linear (autonomous agent loop)",
      "Status: READY TO DEPLOY. All 3 modes working locally.",
    ],
  },
  {
    step: 10,
    owner: "Leadership",
    domain: "leadership",
    title: "ROI Measurement + Feedback Loop",
    desc: "Cost per feature calculated. Accuracy tracked. Calibration DB updated. CEO dashboard refreshed.",
    input: "Completed Linear issue (startedAt, completedAt, estimate, comments)",
    output: "ROI Measurement comment + record appended to calibration_data.json (closed loop)",
    status: "live",
    persona: "ROI Measurement Agent (running 24/7 on AWS)",
    detail: [
      "Trigger: issue state=completed + estimate set + no `roi-measured` label yet",
      "Computes actual business days (Mon-Fri approximation)",
      "Cost per feature: actual_days × $300/engineer-day",
      "Delta vs estimate + accuracy verdict: 🚀 faster / ✅ on track / ⚠️ overrun",
      "Extracts AI + Calibrated sizes from prior comments for the ROI table",
      "Appends the completed-task record to calibration_data.json for future estimations",
      "Adds `roi-measured` label so we don't re-process",
      "**Closes the loop**: each measurement makes the next estimation more accurate",
      "Status: LIVE. Polls every 5 min on AWS. Successfully measured CC-426 (Delivered faster than estimated).",
    ],
  },
];

const DOMAIN_STYLES: Record<Domain, { bg: string; text: string; label: string }> = {
  external: { bg: "bg-pink-100", text: "text-pink-800", label: "Funga (external)" },
  product: { bg: "bg-blue-100", text: "text-blue-800", label: "Product" },
  ai: { bg: "bg-amber-100", text: "text-amber-800", label: "AI Agent" },
  engineering: { bg: "bg-green-100", text: "text-green-800", label: "Engineering" },
  leadership: { bg: "bg-purple-100", text: "text-purple-800", label: "Leadership" },
};

const STATUS_BADGE: Record<Status, { tone: "success" | "warning" | "info" | "brand"; label: string }> = {
  live: { tone: "success", label: "Live" },
  ready: { tone: "brand", label: "Ready to deploy" },
  manual: { tone: "info", label: "Manual" },
  planned: { tone: "warning", label: "Planned" },
};

const PERSONAS = [
  {
    role: "Product / CPO (JVP)",
    color: "blue",
    steps: [1, 2, 4],
    summary: "Refines initiatives, proposes epics with PERT, curates AI-suggested tickets, sets priorities. Does NOT write code or assign people.",
    daily: ["Check epic progress in Linear Projects view", "Review AI-suggested tickets when notified", "Approve/curate before sprint planning"],
  },
  {
    role: "Engineering (Dev team)",
    color: "green",
    steps: [7, 9],
    summary: "Votes T-shirt in 30 sec during sprint planning. Picks tickets from cycle. Codes. Opens PR. Reviews agent + non-tech PRs.",
    daily: ["Open Linear -> My Issues (G then I)", "Move ticket to 'In Progress' (press S)", "Branch as `yourname/cc-XXX-...`", "Open PR linking issue", "Review agent PRs as gatekeeper"],
  },
  {
    role: "Non-Tech Contributor (Design/Business/Anyone)",
    color: "purple",
    steps: [9],
    summary: "Opens Cursor in CityCatalyst, calls `non-tech-contribute` skill, describes change in plain language. Skill handles git + PR.",
    daily: ["Cmd+L in Cursor: 'Use non-tech-contribute, I want to...'", "Review the AI diff", "Skill auto-commits + pushes + opens PR", "Engineer reviews within 24h"],
  },
  {
    role: "Business / BD (Anyone needing eng work)",
    color: "amber",
    steps: [4, 6],
    summary: "Creates issue in Linear with what+why+when. AI scores within 60s. Enters triage. Gets assigned to a sprint.",
    daily: ["Press C in Linear to create issue", "Write clear title (verb + noun)", "Add description with context", "Set priority", "Star to track"],
  },
  {
    role: "Leadership (Martin / CEO)",
    color: "purple",
    steps: [10],
    summary: "Reads OEF Analytics. Sees cost per initiative, velocity, ROI. Zero process work.",
    daily: ["Open OEF Analytics dashboard", "Review Overview + Costs tabs", "Drill down per initiative", "Ask questions backed by data"],
  },
];

export default function PipelinePage() {
  const [expanded, setExpanded] = useState<number | null>(null);
  const [view, setView] = useState<"flow" | "persona">("flow");

  return (
    <>
      <PageHeader
        title="End-to-End Flow"
        subtitle="From meeting to shipped code to measured ROI. 11 stages across 5 domains. Click any stage to expand."
        actions={
          <div className="flex gap-1 bg-gray-100 p-1 rounded-lg">
            <button
              onClick={() => setView("flow")}
              className={`px-3 py-1 text-xs font-semibold rounded ${view === "flow" ? "bg-white text-[#2351DC] shadow" : "text-[#7A7B9A]"}`}
            >
              Flow View
            </button>
            <button
              onClick={() => setView("persona")}
              className={`px-3 py-1 text-xs font-semibold rounded ${view === "persona" ? "bg-white text-[#2351DC] shadow" : "text-[#7A7B9A]"}`}
            >
              By Persona
            </button>
          </div>
        }
      />

      {view === "flow" && (
        <>
          {/* Domain legend */}
          <Section>
            <div className="flex flex-wrap gap-2 mb-4">
              {(Object.keys(DOMAIN_STYLES) as Domain[]).map(d => (
                <span key={d} className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[0.68rem] font-semibold ${DOMAIN_STYLES[d].bg} ${DOMAIN_STYLES[d].text}`}>
                  <span className="w-1.5 h-1.5 rounded-full bg-current" />
                  {DOMAIN_STYLES[d].label}
                </span>
              ))}
            </div>

            {/* Pipeline grid */}
            <div className="grid grid-cols-11 gap-2">
              {STAGES.map((stage, idx) => {
                const style = DOMAIN_STYLES[stage.domain];
                const statusBadge = STATUS_BADGE[stage.status];
                const isExpanded = expanded === stage.step;
                return (
                  <div
                    key={stage.step}
                    onClick={() => setExpanded(isExpanded ? null : stage.step)}
                    className="relative cursor-pointer"
                  >
                    <div className={`h-full bg-white border rounded-xl p-3 flex flex-col gap-1.5 transition-all hover:shadow-md ${isExpanded ? "ring-2 ring-[#2351DC] border-[#2351DC]" : ""}`} style={{ borderColor: isExpanded ? undefined : "#E5E7EB" }}>
                      <span className="text-[0.6rem] font-bold text-[#7A7B9A] uppercase tracking-wider">Step {stage.step}</span>
                      <span className={`inline-block px-1.5 py-0.5 rounded text-[0.58rem] font-bold uppercase tracking-wide w-fit ${style.bg} ${style.text}`}>
                        {stage.owner}
                      </span>
                      <h3 className="text-[0.74rem] font-bold leading-snug text-[#00001F]">{stage.title}</h3>
                      <p className="text-[0.62rem] text-[#7A7B9A] leading-snug">{stage.desc.slice(0, 65)}...</p>
                      <div className="mt-auto pt-2">
                        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[0.55rem] font-bold uppercase ${
                          stage.status === "live" ? "bg-green-100 text-green-800" :
                          stage.status === "ready" ? "bg-[#E8EAFB] text-[#2351DC]" :
                          stage.status === "manual" ? "bg-blue-50 text-blue-700" :
                          "bg-amber-100 text-amber-800"
                        }`}>
                          {statusBadge.label}
                        </span>
                      </div>
                    </div>
                    {idx < STAGES.length - 1 && (
                      <span className="absolute -right-1.5 top-1/2 -translate-y-1/2 text-[#9CA3AF] text-base z-10">→</span>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Expanded detail */}
            {expanded !== null && (
              <Card className="mt-4 p-5 animate-fade-in">
                {(() => {
                  const stage = STAGES.find(s => s.step === expanded)!;
                  const style = DOMAIN_STYLES[stage.domain];
                  return (
                    <>
                      <div className="flex items-start justify-between mb-3">
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <span className={`px-2 py-1 rounded text-[0.66rem] font-bold uppercase ${style.bg} ${style.text}`}>{stage.owner}</span>
                            <h3 className="text-base font-bold text-[#00001F]">Step {stage.step}: {stage.title}</h3>
                            <Badge tone={STATUS_BADGE[stage.status].tone}>{STATUS_BADGE[stage.status].label}</Badge>
                          </div>
                          {stage.persona && <p className="text-xs text-[#7A7B9A]">Owned by: <span className="font-semibold text-[#232640]">{stage.persona}</span></p>}
                        </div>
                      </div>
                      <p className="text-sm text-[#232640] mb-4">{stage.desc}</p>
                      <div className="grid grid-cols-2 gap-3 mb-4 pb-4 border-b" style={{ borderColor: "#E5E7EB" }}>
                        <div>
                          <p className="text-[0.6rem] font-bold uppercase tracking-wide text-[#7A7B9A]">Input</p>
                          <p className="text-sm text-[#00001F] font-medium mt-0.5">{stage.input}</p>
                        </div>
                        <div>
                          <p className="text-[0.6rem] font-bold uppercase tracking-wide text-[#7A7B9A]">Output</p>
                          <p className="text-sm text-[#00001F] font-medium mt-0.5">{stage.output}</p>
                        </div>
                      </div>
                      <ul className="space-y-1.5 text-sm text-[#232640]">
                        {stage.detail.map((d, i) => (
                          <li key={i} className="flex gap-2">
                            <span className="text-[#2351DC] flex-shrink-0 font-bold">·</span>
                            <span>{d}</span>
                          </li>
                        ))}
                      </ul>
                    </>
                  );
                })()}
              </Card>
            )}
          </Section>

          {/* Where Funga fits */}
          <Section title="Where Funga Fits" description="Funga (JVP's system) is at the top of the funnel. It captures meeting decisions and produces inputs for the engineering OS. We don't replace Funga — we consume its output and add the engineering execution layer.">
            <Card className="p-5 bg-gradient-to-r from-pink-50 to-blue-50">
              <div className="flex items-center gap-4">
                <div className="flex-shrink-0 w-14 h-14 rounded-xl bg-pink-100 flex items-center justify-center text-2xl">🍄</div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-[#00001F]">Funga handles Steps 0-2</p>
                  <p className="text-xs text-[#7A7B9A] mt-1">Meeting intelligence → action extraction → epic PERT estimation via Slack DM interviews. Stays on its own infra (Replit). We integrate via Notion Estimations DB and meeting outputs.</p>
                </div>
                <div className="text-[#7A7B9A] text-2xl">→</div>
                <div className="flex-1">
                  <p className="text-sm font-bold text-[#00001F]">Engineering OS handles Steps 3-10</p>
                  <p className="text-xs text-[#7A7B9A] mt-1">From AI epic decomposition through delivery to ROI measurement. Linear is source of truth. Sequential, not competing.</p>
                </div>
              </div>
            </Card>
          </Section>

          {/* Current state */}
          <Section title="Current Implementation Status">
            <div className="grid grid-cols-4 gap-4">
              <Card className="p-5">
                <div className="text-3xl font-extrabold text-green-600">{STAGES.filter(s => s.status === "live").length}</div>
                <p className="text-sm text-[#232640] font-semibold mt-1">Live</p>
                <p className="text-xs text-[#7A7B9A] mt-1">Running in production today (Funga, PERT)</p>
              </Card>
              <Card className="p-5">
                <div className="text-3xl font-extrabold text-[#2351DC]">{STAGES.filter(s => s.status === "ready").length}</div>
                <p className="text-sm text-[#232640] font-semibold mt-1">Ready to deploy</p>
                <p className="text-xs text-[#7A7B9A] mt-1">Working locally, awaiting AWS deploy</p>
              </Card>
              <Card className="p-5">
                <div className="text-3xl font-extrabold text-blue-600">{STAGES.filter(s => s.status === "manual").length}</div>
                <p className="text-sm text-[#232640] font-semibold mt-1">Manual</p>
                <p className="text-xs text-[#7A7B9A] mt-1">Human work — no agent needed</p>
              </Card>
              <Card className="p-5">
                <div className="text-3xl font-extrabold text-amber-600">{STAGES.filter(s => s.status === "planned").length}</div>
                <p className="text-sm text-[#232640] font-semibold mt-1">Planned</p>
                <p className="text-xs text-[#7A7B9A] mt-1">Future work</p>
              </Card>
            </div>
          </Section>
        </>
      )}

      {view === "persona" && (
        <Section description="Each role has a clear set of steps they own. Click a step number to see what happens.">
          <div className="space-y-6">
            {PERSONAS.map(p => (
              <Card key={p.role} className="p-5">
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <h3 className="text-lg font-bold text-[#00001F]">{p.role}</h3>
                    <p className="text-sm text-[#7A7B9A] mt-1 max-w-2xl">{p.summary}</p>
                  </div>
                  <div className="flex gap-1.5">
                    {p.steps.map(s => {
                      const stage = STAGES.find(st => st.step === s);
                      if (!stage) return null;
                      return (
                        <button
                          key={s}
                          onClick={() => { setView("flow"); setExpanded(s); }}
                          className="px-2.5 py-1 rounded text-xs font-bold bg-[#E8EAFB] text-[#2351DC] hover:bg-[#2351DC] hover:text-white transition-colors"
                          title={stage.title}
                        >
                          Step {s}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="pt-3 border-t" style={{ borderColor: "#E5E7EB" }}>
                  <p className="text-[0.65rem] font-bold uppercase tracking-wider text-[#7A7B9A] mb-2">Daily Actions</p>
                  <ul className="space-y-1">
                    {p.daily.map((d, i) => (
                      <li key={i} className="flex gap-2 text-sm text-[#232640]">
                        <span className="text-[#2351DC]">→</span>
                        <span>{d}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </Card>
            ))}
          </div>
        </Section>
      )}
    </>
  );
}
