"use client";

import { useEffect, useState } from "react";
import { PageHeader, Section, Card, Badge, StatCard } from "@/components/PageHeader";

interface Project {
  id: string;
  name: string;
  statusName?: string;
  statusType?: string;
  statusColor?: string;
  health?: string;
  startDate?: string;
  targetDate?: string;
  total: number;
  completed: number;
  inProgress: number;
  backlog: number;
  totalPoints: number;
  completedPoints: number;
  aiEstimated: number;
  agentReady: number;
  completionPct: number;
}

interface Initiative {
  id: string;
  name: string;
  description?: string;
  status?: string;
  targetDate?: string;
  projectCount: number;
  totalIssues: number;
  completedIssues: number;
  completionPct: number;
  projects: Project[];
}

interface Payload {
  total: number;
  totalIssues: number;
  initiatives: Initiative[];
  updatedAt: string;
}

const HEALTH_TONE: Record<string, "success" | "warning" | "danger" | "neutral"> = {
  onTrack: "success",
  atRisk: "warning",
  offTrack: "danger",
};

const HEALTH_LABEL: Record<string, string> = {
  onTrack: "On Track",
  atRisk: "At Risk",
  offTrack: "Off Track",
};

function StatusPill({ name, type }: { name?: string; type?: string }) {
  const tone: "success" | "info" | "warning" | "neutral" =
    type === "completed" ? "success" :
    type === "started" ? "info" :
    type === "canceled" ? "neutral" :
    "warning";
  return <Badge tone={tone}>{name || "—"}</Badge>;
}

export default function InitiativesPage() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});

  useEffect(() => {
    fetch("/api/initiatives")
      .then((r) => r.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
        setLoading(false);
      })
      .catch((e) => {
        setError(String(e));
        setLoading(false);
      });
  }, []);

  const toggle = (id: string) => setExpanded((s) => ({ ...s, [id]: !s[id] }));

  return (
    <>
      <PageHeader
        title="Initiatives"
        subtitle="OKR-level work groupings. Each Initiative contains Projects (Epics) which contain Issues. Matches Jira `init-*` label taxonomy."
        actions={data && <Badge tone="brand">{data.total} initiatives · {data.totalIssues} issues</Badge>}
      />

      {error && (
        <Card className="p-5 mb-8 border-red-200 bg-red-50">
          <p className="text-sm text-red-800"><span className="font-bold">Failed to load:</span> {error}</p>
        </Card>
      )}

      {data && (
        <Section title="Overview">
          <div className="grid grid-cols-4 gap-4">
            <StatCard label="Total Initiatives" value={data.total} variant="brand" />
            <StatCard label="Total Issues" value={data.totalIssues} />
            <StatCard
              label="Completed"
              value={data.initiatives.reduce((s, i) => s + i.completedIssues, 0)}
              variant="success"
            />
            <StatCard
              label="Active Initiatives"
              value={data.initiatives.filter((i) => i.totalIssues > 0).length}
            />
          </div>
        </Section>
      )}

      <Section
        title="Initiative → Project → Issue Hierarchy"
        description="Click an initiative to expand its projects (epics). Each project's issues roll up into the initiative's completion %."
      >
        {loading && (
          <Card className="p-6 text-center text-sm text-[#7A7B9A]">Loading initiatives…</Card>
        )}

        {data && (
          <div className="space-y-3">
            {data.initiatives.map((init) => {
              const isOpen = !!expanded[init.id];
              const hasWork = init.totalIssues > 0;
              return (
                <Card key={init.id}>
                  <button
                    onClick={() => toggle(init.id)}
                    className="w-full text-left p-5 flex items-start justify-between hover:bg-gray-50 transition-colors"
                  >
                    <div className="flex-1 pr-4">
                      <div className="flex items-center gap-3 mb-1.5">
                        <span className="text-[#7A7B9A] text-xs">{isOpen ? "▼" : "▶"}</span>
                        <h3 className="text-base font-bold text-[#00001F]">{init.name}</h3>
                        {init.status && <Badge tone="neutral">{init.status}</Badge>}
                        {!hasWork && <Badge tone="warning">No work yet</Badge>}
                      </div>
                      {init.description && (
                        <p className="text-xs text-[#7A7B9A] max-w-2xl leading-relaxed line-clamp-2 ml-6">
                          {init.description}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-6 text-right">
                      <div>
                        <p className="text-[0.65rem] uppercase tracking-wide text-[#7A7B9A] font-semibold">Projects</p>
                        <p className="text-lg font-bold text-[#00001F]">{init.projectCount}</p>
                      </div>
                      <div>
                        <p className="text-[0.65rem] uppercase tracking-wide text-[#7A7B9A] font-semibold">Issues</p>
                        <p className="text-lg font-bold text-[#00001F]">{init.totalIssues}</p>
                      </div>
                      <div className="min-w-[100px]">
                        <p className="text-[0.65rem] uppercase tracking-wide text-[#7A7B9A] font-semibold">Progress</p>
                        <div className="flex items-center gap-2 mt-1">
                          <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-[#2351DC] transition-all"
                              style={{ width: `${init.completionPct}%` }}
                            />
                          </div>
                          <span className="text-xs font-bold text-[#00001F]">{init.completionPct}%</span>
                        </div>
                      </div>
                    </div>
                  </button>

                  {isOpen && init.projects.length > 0 && (
                    <div className="border-t px-5 py-4 bg-gray-50/40" style={{ borderColor: "#E5E7EB" }}>
                      <p className="text-[0.62rem] font-bold uppercase tracking-wider text-[#7A7B9A] mb-3">
                        Projects (Epics) — {init.projects.length}
                      </p>
                      <div className="grid grid-cols-1 gap-2">
                        {init.projects.map((p) => (
                          <div key={p.id} className="bg-white border rounded-lg p-4" style={{ borderColor: "#E5E7EB" }}>
                            <div className="flex items-start justify-between mb-2">
                              <div className="flex-1 pr-4">
                                <div className="flex items-center gap-2 mb-1">
                                  <span className="text-sm font-semibold text-[#00001F]">{p.name}</span>
                                  <StatusPill name={p.statusName} type={p.statusType} />
                                  {p.health && HEALTH_LABEL[p.health] && (
                                    <Badge tone={HEALTH_TONE[p.health] || "neutral"}>{HEALTH_LABEL[p.health]}</Badge>
                                  )}
                                </div>
                                {(p.startDate || p.targetDate) && (
                                  <p className="text-[0.65rem] text-[#7A7B9A]">
                                    {p.startDate && `Start: ${new Date(p.startDate).toLocaleDateString()}`}
                                    {p.startDate && p.targetDate && " · "}
                                    {p.targetDate && `Target: ${new Date(p.targetDate).toLocaleDateString()}`}
                                  </p>
                                )}
                              </div>
                              <div className="text-right">
                                <p className="text-lg font-bold text-[#00001F]">{p.completionPct}%</p>
                                <p className="text-[0.62rem] text-[#7A7B9A]">completion</p>
                              </div>
                            </div>
                            <div className="grid grid-cols-6 gap-2 text-[0.7rem] mt-3 pt-3 border-t" style={{ borderColor: "#F3F4F6" }}>
                              <div>
                                <p className="text-[#7A7B9A]">Total</p>
                                <p className="font-bold text-[#00001F]">{p.total}</p>
                              </div>
                              <div>
                                <p className="text-[#7A7B9A]">Done</p>
                                <p className="font-bold text-green-600">{p.completed}</p>
                              </div>
                              <div>
                                <p className="text-[#7A7B9A]">In Progress</p>
                                <p className="font-bold text-blue-600">{p.inProgress}</p>
                              </div>
                              <div>
                                <p className="text-[#7A7B9A]">Backlog</p>
                                <p className="font-bold text-amber-600">{p.backlog}</p>
                              </div>
                              <div>
                                <p className="text-[#7A7B9A]">AI-Estimated</p>
                                <p className="font-bold text-[#2351DC]">{p.aiEstimated}</p>
                              </div>
                              <div>
                                <p className="text-[#7A7B9A]">Agent-Ready</p>
                                <p className="font-bold text-purple-600">{p.agentReady}</p>
                              </div>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {isOpen && init.projects.length === 0 && (
                    <div className="border-t px-5 py-4 text-xs text-[#7A7B9A]" style={{ borderColor: "#E5E7EB" }}>
                      No projects yet. This initiative is planned but has no active work.
                    </div>
                  )}
                </Card>
              );
            })}
          </div>
        )}
      </Section>

      <Section title="How it works">
        <Card className="p-5">
          <div className="text-sm text-[#232640] space-y-3 leading-relaxed">
            <div>
              <span className="font-bold text-[#00001F]">Initiative</span> — OKR / quarterly goal. Grouping of related Projects (~1-4 initiatives per team per quarter).
              Only leadership creates these. Mirrors Jira <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs">init-*</code> labels.
            </div>
            <div>
              <span className="font-bold text-[#00001F]">Project (= Epic)</span> — Feature or workstream of 1-4 weeks. Has its own status, target date, health.
              Product/Design creates these. Contains 3-15 Issues.
            </div>
            <div>
              <span className="font-bold text-[#00001F]">Issue (= Story/Task)</span> — Atomic 1-3 day unit. Product or Dev creates; Funga&apos;s epic slice proposes them with a human preview (labels
              <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs mx-1">ai-proposed</code> +
              <code className="bg-gray-100 px-1.5 py-0.5 rounded text-xs mx-1">ready-for-quality</code>).
            </div>
            <div>
              <span className="font-bold text-[#00001F]">Sub-Issue</span> — Optional finer breakdown created by developers when working through a Story.
            </div>
          </div>
        </Card>
      </Section>
    </>
  );
}
