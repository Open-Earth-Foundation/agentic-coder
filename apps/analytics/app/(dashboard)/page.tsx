"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  PieChart, Pie, Cell,
} from "recharts";
import { PageHeader, Section, StatCard, Card, CardHeader, Badge } from "@/components/PageHeader";

const PIE_COLORS = ["#2351DC", "#16A34A", "#D97706", "#7C3AED", "#DC2626", "#0891B2", "#EA580C"];

interface AnalyticsData {
  summary: { totalIssues: number; completed: number; inProgress: number; backlog: number };
  statusDistribution: Record<string, number>;
  projectStats: Array<{ name: string; total: number; completed: number; completionRate: number; totalPoints: number; status?: string }>;
  cycleStats: Array<{ cycle: string; total: number; completed: number; velocity: number; totalPoints: number; completedPoints: number }>;
  estimationAccuracy: Array<{ identifier: string; title: string; estimate: number; actualDays: number; accurate: boolean }>;
  updatedAt: string;
}

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || !payload.length) return null;
  return (
    <div className="bg-white border rounded-lg shadow-lg p-3" style={{ borderColor: "#E5E7EB" }}>
      <p className="text-xs font-bold text-[#00001F] mb-2">{label}</p>
      {payload.map((p: any) => (
        <div key={p.dataKey} className="flex items-center gap-2 text-xs">
          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: p.color }} />
          <span className="text-[#7A7B9A]">{p.name}:</span>
          <span className="font-semibold text-[#00001F]">{p.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function OverviewPage() {
  const router = useRouter();
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/linear")
      .then((r) => { if (!r.ok) throw new Error(`${r.status}`); return r.json(); })
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-[#7A7B9A]">Loading...</div>;
  if (error) return <div className="text-red-600">Error: {error}</div>;
  if (!data) return null;

  const pieData = Object.entries(data.statusDistribution).map(([name, value]) => ({ name, value }));

  const totalCost = data.projectStats.reduce((s, p) => s + (p.totalPoints * 2 * 300), 0);

  return (
    <>
      <PageHeader
        title="Engineering Overview"
        subtitle="Real-time view of work, velocity, and ROI across all initiatives."
        actions={
          <div className="flex items-center gap-2 text-xs text-[#7A7B9A]">
            <span className="w-2 h-2 rounded-full bg-green-500 animate-pulse-soft" />
            Live · Updated {new Date(data.updatedAt).toLocaleTimeString()}
          </div>
        }
      />

      {/* Top stats */}
      <Section>
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="Total Issues" value={data.summary.totalIssues} sub="In sprint + backlog" />
          <StatCard label="In Progress" value={data.summary.inProgress} variant="warning" sub="Active development" />
          <StatCard label="Completed" value={data.summary.completed} variant="success" sub="This cycle" />
          <StatCard label="Estimated Cost" value={`$${(totalCost / 1000).toFixed(1)}k`} variant="brand" sub="Across active initiatives" />
        </div>
      </Section>

      {/* Charts row */}
      <div className="grid grid-cols-2 gap-6 mb-10">
        <Card>
          <CardHeader title="Sprint Velocity" action={<Link href="/linear" className="text-xs text-[#2351DC] hover:underline font-medium">View cycles →</Link>} />
          <div className="p-4">
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={data.cycleStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                <XAxis dataKey="cycle" tick={{ fontSize: 11, fill: "#7A7B9A" }} />
                <YAxis tick={{ fontSize: 11, fill: "#7A7B9A" }} />
                <Tooltip content={<CustomTooltip />} />
                <Legend wrapperStyle={{ fontSize: 12 }} />
                <Bar dataKey="completedPoints" name="Completed" fill="#16A34A" radius={[4, 4, 0, 0]} style={{ cursor: "pointer" }} onClick={() => router.push("/linear")} />
                <Bar dataKey="totalPoints" name="Committed" fill="#2351DC" radius={[4, 4, 0, 0]} style={{ cursor: "pointer" }} onClick={() => router.push("/linear")} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </Card>

        <Card>
          <CardHeader title="Pipeline Status" action={<Link href="/linear" className="text-xs text-[#2351DC] hover:underline font-medium">View issues →</Link>} />
          <div className="p-4">
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={pieData}
                  dataKey="value"
                  nameKey="name"
                  cx="50%"
                  cy="50%"
                  outerRadius={90}
                  label={({ name, value }) => `${name}: ${value}`}
                  style={{ cursor: "pointer" }}
                  onClick={(e: any) => { if (e?.name) router.push(`/linear?state=${encodeURIComponent(e.name)}`); }}
                >
                  {pieData.map((_, i) => <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />)}
                </Pie>
                <Tooltip content={<CustomTooltip />} />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </Card>
      </div>

      {/* Top Initiatives */}
      <Section title="Top Initiatives by Cost" description="Implied cost based on points (XS=0.5d, S=1d, M=2d, L=4d, XL=8d) at $300/engineer-day.">
        <Card>
          <table className="w-full text-sm">
            <thead className="bg-[#F9FAFB]">
              <tr className="text-left text-[#7A7B9A]">
                <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide">Initiative</th>
                <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide text-center">Issues</th>
                <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide text-center">Done</th>
                <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide text-center">Points</th>
                <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide text-right">Est. Cost</th>
                <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide">Progress</th>
              </tr>
            </thead>
            <tbody>
              {data.projectStats.filter(p => p.total > 0).sort((a, b) => b.totalPoints - a.totalPoints).slice(0, 10).map((p) => (
                <tr
                  key={p.name}
                  className="border-t hover:bg-[#F9FAFB] cursor-pointer transition-colors"
                  style={{ borderColor: "#E5E7EB" }}
                  onClick={() => router.push(`/linear?project=${encodeURIComponent(p.name)}`)}
                  title={`View ${p.total} issues in ${p.name}`}
                >
                  <td className="px-5 py-3 font-semibold text-[#00001F]">{p.name}</td>
                  <td className="px-5 py-3 text-center text-[#232640]">{p.total}</td>
                  <td className="px-5 py-3 text-center text-[#232640]">{p.completed}</td>
                  <td className="px-5 py-3 text-center text-[#232640]">{p.totalPoints || "—"}</td>
                  <td className="px-5 py-3 text-right font-medium text-[#00001F]">${(p.totalPoints * 2 * 300).toLocaleString()}</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                        <div
                          className="h-full rounded-full"
                          style={{ width: `${p.completionRate}%`, backgroundColor: p.completionRate >= 75 ? "#16A34A" : p.completionRate >= 40 ? "#D97706" : "#2351DC" }}
                        />
                      </div>
                      <span className="text-xs font-medium text-[#7A7B9A] w-9 text-right">{p.completionRate}%</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </Section>

      {/* Quick links */}
      <Section title="Drill Down">
        <div className="grid grid-cols-4 gap-4">
          {[
            { href: "/pipeline", title: "End-to-End Pipeline", desc: "Visualize the 8-stage flow from initiative to ROI" },
            { href: "/linear", title: "Linear Data", desc: "Issues, cycles, projects — full detail with filters" },
            { href: "/agents", title: "AI Agents", desc: "Status of agentic-coder + estimation engine" },
            { href: "/dora", title: "DORA Metrics", desc: "Lead time, deploy frequency, MTTR, change failure" },
          ].map(item => (
            <Link key={item.href} href={item.href} className="group">
              <Card className="p-5 hover:border-[#2351DC] transition-colors h-full">
                <p className="text-sm font-bold text-[#00001F] group-hover:text-[#2351DC] transition-colors">{item.title}</p>
                <p className="text-xs text-[#7A7B9A] mt-1.5">{item.desc}</p>
                <p className="text-xs text-[#2351DC] mt-3 font-medium">View →</p>
              </Card>
            </Link>
          ))}
        </div>
      </Section>
    </>
  );
}
