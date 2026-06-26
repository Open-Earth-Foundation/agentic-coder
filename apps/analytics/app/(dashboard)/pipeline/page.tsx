"use client";

import { useState } from "react";
import { PageHeader, Section, Card, CardHeader, Badge } from "@/components/PageHeader";

const STAGES = [
  { step: 1, owner: "Product", domain: "product", title: "Initiative Refinement",
    desc: "Defines the sustained area of work. Assigns Slack channel, Notion page, named owner.",
    input: "Engagement, grant, or product need",
    output: "Refined Initiative (Notion)",
    detail: ["Validates: multi-epic, multi-quarter, named owner, recognized in conversation", "Creates Notion page + Slack channel", "Links to engagement/grant if applicable", 'Examples: "Brazil Phase 3", "URBIND", "CC Agentic Flow"'] },
  { step: 2, owner: "Product", domain: "product", title: "Epic Proposal + Estimation",
    desc: "Proposes epics (1-6 sprints). Scores importance. PERT estimates per role (O/M/P).",
    input: "Initiative + user stories + roles",
    output: "Estimated epic (FTE-sprints + calendar)",
    detail: ["Importance score: Alignment (x0.4) + Revenue (x0.3) + External demand (x0.3) → 0-100", "PERT per role in FTE-sprints (O/M/P)", "Roles: AI, DataEng, FullStack, PD, PM, AcctMgr", "Scope confidence: 1-5 (below 3 = low confidence flag)", "Duration estimate (calendar-sprints, distinct from effort)"] },
  { step: 3, owner: "AI", domain: "ai", title: "Budget Gate + Ticket Creation",
    desc: "AI validates estimation vs budget. Flags over-committed. Confirms epic, auto-creates tickets in Linear.",
    input: "Estimated epic + quarterly capacity",
    output: "Confirmed tickets in Linear",
    detail: ["AI validates estimation vs budget on both axes (effort + duration)", "If estimation > budget: flags 'Over-committed', triggers rescoping", "Capacity check: role-level bottlenecks per quarter", "When confirmed: auto-creates Linear epic with metadata", "Weekly digest monitors drift in #estimations channel"] },
  { step: 4, owner: "AI", domain: "ai", title: "AI Estimate + Triage",
    desc: "AI reads each ticket. Gives T-shirt estimate, impact score, ROI rank. Flags AI Intern candidates.",
    input: "Ticket + labels + history + codebase",
    output: "ai_size, roi_rank, intern_candidate flag",
    detail: ["Reads title, description, labels, parent epic", "T-shirt suggestion based on 46 historical samples (avg 9.9d)", "Scores impact (5 weighted dimensions)", "Calibrated for AI-empowered team (~50% lower than traditional)", "Posts as Linear comment within 60s"] },
  { step: 5, owner: "Engineering", domain: "engineering", title: "Dev Estimate",
    desc: "Dev sees AI suggestion. Agrees, overrides, or delegates to AI Intern.",
    input: "Ticket + AI estimate + intern flag",
    output: "dev_size OR 'delegate to intern'",
    detail: ["30-second decision via Shift+E in Linear", "Options: agree, override, delegate to agent", "If delegated: ticket gets 'agent-ready' label", "T-shirt: XS (<1h), S (2-4h), M (1d), L (2-3d), XL (4-5d)"] },
  { step: 6, owner: "AI", domain: "ai", title: "Calibration",
    desc: "Compares AI vs Dev estimate vs historical data. Flags divergence. Produces final points.",
    input: "AI size + dev size + history",
    output: "calibrated_points + flag",
    detail: ["Compares AI estimate vs Dev estimate vs historical data", "If divergent: flags for 2-min discussion", "Calibration DB improves each sprint automatically", "Produces calibrated_points for capacity planning"] },
  { step: 7, owner: "Engineering", domain: "engineering", title: "Sprint Delivery",
    desc: "Dev or AI Intern executes. Time tracked automatically from status transitions.",
    input: "Calibrated sprint plan",
    output: "actual_days (auto-measured)",
    detail: ["Human devs work normally; AI Intern opens PRs autonomously", "Time auto-tracked from Linear status transitions", "AI Intern PRs reviewed by dev before merge", "actual_days = time from 'In Progress' to 'Done' (working days)"] },
  { step: 8, owner: "C-level", domain: "leadership", title: "ROI Dashboard",
    desc: "Cost per feature. Estimate accuracy tracked. Model improves each sprint.",
    input: "actual_days × $300/day",
    output: "$ per feature, KR alignment",
    detail: ["Cost per feature: actual_days × daily_rate ($300/day avg)", "Estimation accuracy: estimate vs actual trend over sprints", "KR alignment: % of sprint effort going to top OKRs", "AI Intern ROI: cost of agent tickets vs human equivalent", "All auto-generated, CEO reads only — no process work"] },
];

const DOMAIN_STYLES = {
  product: { bg: "bg-blue-100", text: "text-blue-800", border: "border-blue-200", solidBg: "#DBEAFE", solidFg: "#1E40AF" },
  ai: { bg: "bg-amber-100", text: "text-amber-800", border: "border-amber-200", solidBg: "#FEF3C7", solidFg: "#92400E" },
  engineering: { bg: "bg-green-100", text: "text-green-800", border: "border-green-200", solidBg: "#DCFCE7", solidFg: "#166534" },
  leadership: { bg: "bg-purple-100", text: "text-purple-800", border: "border-purple-200", solidBg: "#F3E8FF", solidFg: "#6B21A8" },
};

export default function PipelinePage() {
  const [expanded, setExpanded] = useState<number | null>(null);

  return (
    <>
      <PageHeader
        title="End-to-End Pipeline"
        subtitle="From initiative to measurable ROI. Three domains, one continuous flow. Click any stage to expand details."
      />

      {/* Domain bands */}
      <Section>
        <div className="flex gap-1.5 mb-3">
          <div className="flex-1 py-2.5 px-4 rounded-lg text-center bg-blue-100 text-blue-800 text-xs font-bold uppercase tracking-wider" style={{ flex: 2 }}>Product Domain</div>
          <div className="flex-1 py-2.5 px-4 rounded-lg text-center bg-green-100 text-green-800 text-xs font-bold uppercase tracking-wider" style={{ flex: 5 }}>Engineering + AI</div>
          <div className="flex-1 py-2.5 px-4 rounded-lg text-center bg-purple-100 text-purple-800 text-xs font-bold uppercase tracking-wider">Leadership</div>
        </div>

        {/* Pipeline */}
        <div className="flex gap-2">
          {STAGES.map((stage, idx) => {
            const style = DOMAIN_STYLES[stage.domain as keyof typeof DOMAIN_STYLES];
            const isExpanded = expanded === stage.step;
            return (
              <div
                key={stage.step}
                onClick={() => setExpanded(isExpanded ? null : stage.step)}
                className={`relative flex-1 min-w-[110px] cursor-pointer transition-all ${idx < STAGES.length - 1 ? "" : ""}`}
              >
                <div className={`h-full bg-white border rounded-xl p-3 flex flex-col gap-1.5 transition-all hover:shadow-md ${isExpanded ? "ring-2 ring-[#2351DC] border-[#2351DC]" : ""}`} style={{ borderColor: isExpanded ? undefined : "#E5E7EB" }}>
                  <span className="text-[0.62rem] font-bold text-[#7A7B9A] uppercase tracking-wider">Step {stage.step}</span>
                  <span className={`inline-block px-1.5 py-0.5 rounded text-[0.6rem] font-bold uppercase tracking-wide w-fit ${style.bg} ${style.text}`}>
                    {stage.owner}
                  </span>
                  <h3 className="text-[0.78rem] font-bold leading-snug text-[#00001F]">{stage.title}</h3>
                  <p className="text-[0.68rem] text-[#7A7B9A] leading-relaxed">{stage.desc}</p>
                  <div className="pt-2 mt-auto border-t" style={{ borderColor: "#F3F4F6" }}>
                    <div className="text-[0.55rem] font-bold uppercase tracking-wider text-[#7A7B9A]">Input</div>
                    <div className="text-[0.66rem] text-[#232640] leading-tight">{stage.input}</div>
                    <div className="text-[0.55rem] font-bold uppercase tracking-wider text-[#7A7B9A] mt-1.5">Output</div>
                    <div className="text-[0.66rem] text-[#232640] leading-tight">{stage.output}</div>
                  </div>
                </div>
                {idx < STAGES.length - 1 && (
                  <span className="absolute -right-2 top-1/2 -translate-y-1/2 text-[#9CA3AF] text-lg z-10">→</span>
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
              const style = DOMAIN_STYLES[stage.domain as keyof typeof DOMAIN_STYLES];
              return (
                <>
                  <div className="flex items-center gap-3 mb-3">
                    <span className={`px-2 py-1 rounded text-[0.68rem] font-bold uppercase ${style.bg} ${style.text}`}>{stage.owner}</span>
                    <h3 className="text-base font-bold text-[#00001F]">Step {stage.step}: {stage.title}</h3>
                  </div>
                  <ul className="space-y-1.5 text-sm text-[#232640]">
                    {stage.detail.map((d, i) => (
                      <li key={i} className="flex gap-2">
                        <span className="text-[#2351DC] flex-shrink-0">•</span>
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

      {/* ROI Formula */}
      <Section title="ROI Formula" description="Every ticket is scored. This is how we rank work and measure impact.">
        <Card className="p-6">
          <div className="bg-[#F9FAFB] border border-dashed rounded-lg px-5 py-4 font-mono text-base text-[#001EA7] font-semibold" style={{ borderColor: "#D1D5DB" }}>
            Priority Score = (Impact × Confidence) / Adjusted Effort
          </div>
          <div className="grid grid-cols-3 gap-4 mt-5">
            <div className="border rounded-lg p-4" style={{ borderColor: "#E5E7EB" }}>
              <p className="text-sm font-bold text-[#00001F]">Impact</p>
              <p className="text-xs text-[#7A7B9A] mt-1">Weighted score: User Impact (30%), Mission (25%), Revenue (20%), Tech Health (15%), Velocity (10%). 0-100 scale.</p>
            </div>
            <div className="border rounded-lg p-4" style={{ borderColor: "#E5E7EB" }}>
              <p className="text-sm font-bold text-[#00001F]">Confidence</p>
              <p className="text-xs text-[#7A7B9A] mt-1">Multiplier 0.1-1.0. Validated (1.0), High (0.8), Medium (0.5), Low (0.3), Experimental (0.1).</p>
            </div>
            <div className="border rounded-lg p-4" style={{ borderColor: "#E5E7EB" }}>
              <p className="text-sm font-bold text-[#00001F]">Adjusted Effort</p>
              <p className="text-xs text-[#7A7B9A] mt-1">AI-calibrated points from historical data. T-shirt sizes mapped to days at $300/engineer-day.</p>
            </div>
          </div>
        </Card>
      </Section>

      {/* T-Shirt sizing */}
      <Section title="T-Shirt Sizing (AI-Empowered)" description="With AI tools, our estimates are ~50% lower than traditional teams. Exception: infra/deploy where AI hallucinates.">
        <Card>
          <table className="w-full text-sm">
            <thead className="bg-[#F9FAFB]">
              <tr className="text-left text-[#7A7B9A]">
                <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide">Size</th>
                <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide">Time</th>
                <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide">Points</th>
                <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide">Examples</th>
              </tr>
            </thead>
            <tbody className="text-[#232640]">
              {[
                ["XS", "< 1 hour", "1", "Typo fix, config change, add translation key"],
                ["S", "2-4 hours", "2", "Simple bugfix, small UI change, straightforward endpoint"],
                ["M", "1 day", "3", "New feature (2-3 files), moderate refactor"],
                ["L", "2-3 days", "5", "Multi-file feature, new integration, complex bug"],
                ["XL", "4-5 days", "8", "Large cross-cutting feature. Should be broken down."],
              ].map(([size, time, pts, ex]) => (
                <tr key={size} className="border-t" style={{ borderColor: "#E5E7EB" }}>
                  <td className="px-5 py-2.5"><Badge tone="brand">{size}</Badge></td>
                  <td className="px-5 py-2.5 font-medium">{time}</td>
                  <td className="px-5 py-2.5">{pts}</td>
                  <td className="px-5 py-2.5 text-[#7A7B9A]">{ex}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </Section>
    </>
  );
}
