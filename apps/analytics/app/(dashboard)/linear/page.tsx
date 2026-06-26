"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader, Section, Card, CardHeader, Badge, StatCard } from "@/components/PageHeader";

interface Issue {
  identifier: string;
  title: string;
  state: string;
  priority: number;
  project?: string;
  estimate?: number;
  labels: string[];
  createdAt: string;
  completedAt?: string;
  startedAt?: string;
}

interface Project { name: string; total: number; completed: number; completionRate: number; totalPoints: number; status?: string }

const PRIORITY_LABEL: Record<number, string> = { 1: "Urgent", 2: "High", 3: "Medium", 4: "Low", 0: "None" };
const PRIORITY_TONE: Record<number, "danger" | "warning" | "info" | "neutral"> = { 1: "danger", 2: "warning", 3: "info", 4: "neutral", 0: "neutral" };

export default function LinearPageWrapper() {
  return (
    <Suspense fallback={<div className="text-[#7A7B9A]">Loading...</div>}>
      <LinearPage />
    </Suspense>
  );
}

function LinearPage() {
  const searchParams = useSearchParams();
  const [issues, setIssues] = useState<Issue[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<{ state?: string; project?: string; search: string }>({
    search: "",
    state: searchParams.get("state") || undefined,
    project: searchParams.get("project") || undefined,
  });

  useEffect(() => {
    fetch("/api/linear/full")
      .then(r => r.json())
      .then(d => { setIssues(d.issues || []); setProjects(d.projects || []); })
      .finally(() => setLoading(false));
  }, []);

  // Sync URL params when they change (back/forward nav)
  useEffect(() => {
    setFilter(prev => ({
      ...prev,
      state: searchParams.get("state") || undefined,
      project: searchParams.get("project") || undefined,
    }));
  }, [searchParams]);

  const filtered = useMemo(() => {
    return issues.filter(i => {
      if (filter.state && i.state !== filter.state) return false;
      if (filter.project && i.project !== filter.project) return false;
      if (filter.search && !i.title.toLowerCase().includes(filter.search.toLowerCase()) && !i.identifier.toLowerCase().includes(filter.search.toLowerCase())) return false;
      return true;
    });
  }, [issues, filter]);

  const uniqueStates = Array.from(new Set(issues.map(i => i.state)));
  const uniqueProjects = Array.from(new Set(issues.map(i => i.project).filter(Boolean)));

  return (
    <>
      <PageHeader title="Linear Data" subtitle="Full issue inventory with filters, projects, and labels." />

      {loading ? (
        <div className="text-[#7A7B9A]">Loading issues...</div>
      ) : (
        <>
          <Section>
            <div className="grid grid-cols-4 gap-4">
              <StatCard label="Total Issues" value={issues.length} />
              <StatCard label="Projects" value={projects.length} variant="brand" />
              <StatCard label="With Estimate" value={issues.filter(i => i.estimate).length} variant="success" />
              <StatCard label="Completed" value={issues.filter(i => i.state === "Done").length} variant="success" />
            </div>
          </Section>

          <Section title="Filters">
            <Card className="p-4">
              <div className="grid grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder="Search by title or ID..."
                  value={filter.search}
                  onChange={(e) => setFilter({ ...filter, search: e.target.value })}
                  className="px-3 py-2 border rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-[#2351DC]"
                  style={{ borderColor: "#E5E7EB" }}
                />
                <select value={filter.state || ""} onChange={(e) => setFilter({ ...filter, state: e.target.value || undefined })} className="px-3 py-2 border rounded-lg text-sm" style={{ borderColor: "#E5E7EB" }}>
                  <option value="">All states</option>
                  {uniqueStates.map(s => <option key={s} value={s}>{s}</option>)}
                </select>
                <select value={filter.project || ""} onChange={(e) => setFilter({ ...filter, project: e.target.value || undefined })} className="px-3 py-2 border rounded-lg text-sm" style={{ borderColor: "#E5E7EB" }}>
                  <option value="">All projects</option>
                  {uniqueProjects.map(p => <option key={p as string} value={p as string}>{p}</option>)}
                </select>
              </div>
              <div className="flex items-center justify-between mt-3">
                <p className="text-xs text-[#7A7B9A]">
                  <span className="font-semibold text-[#00001F]">{filtered.length}</span> of {issues.length} issues shown
                </p>
                {(filter.state || filter.project || filter.search) && (
                  <button
                    onClick={() => setFilter({ search: "", state: undefined, project: undefined })}
                    className="text-xs text-[#2351DC] hover:underline font-medium"
                  >
                    Clear filters
                  </button>
                )}
              </div>
              {(filter.state || filter.project) && (
                <div className="flex flex-wrap gap-2 mt-3 pt-3 border-t" style={{ borderColor: "#E5E7EB" }}>
                  {filter.state && (
                    <span className="inline-flex items-center gap-1.5 bg-[#E8EAFB] text-[#2351DC] text-xs font-semibold px-2.5 py-1 rounded">
                      State: {filter.state}
                      <button onClick={() => setFilter({ ...filter, state: undefined })} className="hover:bg-[#2351DC] hover:text-white rounded-full w-4 h-4 inline-flex items-center justify-center transition-colors">×</button>
                    </span>
                  )}
                  {filter.project && (
                    <span className="inline-flex items-center gap-1.5 bg-[#E8EAFB] text-[#2351DC] text-xs font-semibold px-2.5 py-1 rounded">
                      Project: {filter.project}
                      <button onClick={() => setFilter({ ...filter, project: undefined })} className="hover:bg-[#2351DC] hover:text-white rounded-full w-4 h-4 inline-flex items-center justify-center transition-colors">×</button>
                    </span>
                  )}
                </div>
              )}
            </Card>
          </Section>

          <Section title="Issues" description="Click any row to open in Linear. Filters above narrow the list.">
            <Card>
              <table className="w-full text-sm">
                <thead className="bg-[#F9FAFB]">
                  <tr className="text-left text-[#7A7B9A]">
                    <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide">ID</th>
                    <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide">Title</th>
                    <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide">State</th>
                    <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide">Priority</th>
                    <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide">Est.</th>
                    <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide">Project</th>
                    <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide"></th>
                  </tr>
                </thead>
                <tbody>
                  {filtered.slice(0, 100).map(i => {
                    const linearUrl = `https://linear.app/openearth/issue/${i.identifier.toLowerCase()}`;
                    return (
                      <tr
                        key={i.identifier}
                        className="border-t hover:bg-[#F9FAFB] cursor-pointer transition-colors group"
                        style={{ borderColor: "#E5E7EB" }}
                        onClick={() => window.open(linearUrl, "_blank")}
                      >
                        <td className="px-5 py-2.5 font-mono text-xs text-[#2351DC] font-semibold">{i.identifier}</td>
                        <td className="px-5 py-2.5 text-[#00001F] max-w-md truncate">{i.title}</td>
                        <td className="px-5 py-2.5">
                          <button
                            onClick={(e) => { e.stopPropagation(); setFilter({ ...filter, state: i.state }); }}
                            className="cursor-pointer"
                          >
                            <Badge tone={i.state === "Done" ? "success" : i.state === "In Progress" ? "warning" : i.state === "In Review" ? "info" : "neutral"}>{i.state}</Badge>
                          </button>
                        </td>
                        <td className="px-5 py-2.5">
                          <Badge tone={PRIORITY_TONE[i.priority] || "neutral"}>{PRIORITY_LABEL[i.priority]}</Badge>
                        </td>
                        <td className="px-5 py-2.5 text-[#232640] text-xs">{i.estimate || "—"}</td>
                        <td className="px-5 py-2.5 text-[#7A7B9A] text-xs">
                          {i.project ? (
                            <button
                              onClick={(e) => { e.stopPropagation(); setFilter({ ...filter, project: i.project }); }}
                              className="hover:text-[#2351DC] hover:underline cursor-pointer text-left"
                            >
                              {i.project}
                            </button>
                          ) : "—"}
                        </td>
                        <td className="px-5 py-2.5 text-[#7A7B9A] opacity-0 group-hover:opacity-100 transition-opacity">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                            <path d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14"/>
                          </svg>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {filtered.length > 100 && (
                <div className="px-5 py-3 text-xs text-[#7A7B9A] text-center border-t" style={{ borderColor: "#E5E7EB" }}>
                  Showing first 100 of {filtered.length}. Use filters to narrow down.
                </div>
              )}
            </Card>
          </Section>
        </>
      )}
    </>
  );
}
