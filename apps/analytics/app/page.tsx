"use client";

import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  PieChart, Pie, Cell, ResponsiveContainer, LineChart, Line,
} from "recharts";

const COLORS = ["#7c7cff", "#5fa8ff", "#3ec27a", "#f4b740", "#e5484d", "#a78bfa", "#22d3ee", "#f97316"];

interface AnalyticsData {
  summary: { totalIssues: number; completed: number; inProgress: number; backlog: number };
  statusDistribution: Record<string, number>;
  projectStats: Array<{ name: string; total: number; completed: number; completionRate: number; totalPoints: number }>;
  cycleStats: Array<{ cycle: string; total: number; completed: number; velocity: number; totalPoints: number; completedPoints: number }>;
  estimationAccuracy: Array<{ identifier: string; title: string; estimate: number; actualDays: number; accurate: boolean }>;
  updatedAt: string;
}

function StatCard({ label, value, sub, tone }: { label: string; value: string | number; sub?: string; tone?: string }) {
  return (
    <div className={`rounded-xl border p-5 ${tone === "warning" ? "border-amber-500/30 bg-amber-500/5" : tone === "success" ? "border-emerald-500/30 bg-emerald-500/5" : "border-zinc-800 bg-zinc-900/50"}`}>
      <p className="text-sm text-zinc-400">{label}</p>
      <p className="text-3xl font-bold mt-1">{value}</p>
      {sub && <p className="text-xs text-zinc-500 mt-1">{sub}</p>}
    </div>
  );
}

export default function Dashboard() {
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

  if (loading) return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center"><p className="text-zinc-400">Loading analytics...</p></div>;
  if (error) return <div className="min-h-screen bg-zinc-950 text-white flex items-center justify-center"><p className="text-red-400">Error: {error}</p></div>;
  if (!data) return null;

  const pieData = Object.entries(data.statusDistribution).map(([name, value]) => ({ name, value }));

  return (
    <div className="min-h-screen bg-zinc-950 text-white">
      <div className="max-w-7xl mx-auto px-6 py-8">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-bold">OEF Analytics</h1>
            <p className="text-zinc-400 mt-1">Engineering Operating System — Live Data from Linear</p>
          </div>
          <div className="text-right">
            <p className="text-xs text-zinc-500">Last updated</p>
            <p className="text-sm text-zinc-300">{new Date(data.updatedAt).toLocaleString()}</p>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-4 gap-4 mb-8">
          <StatCard label="Total Issues" value={data.summary.totalIssues} />
          <StatCard label="In Progress" value={data.summary.inProgress} tone="warning" />
          <StatCard label="Completed" value={data.summary.completed} tone="success" />
          <StatCard label="Backlog" value={data.summary.backlog} />
        </div>

        {/* Charts Row 1 */}
        <div className="grid grid-cols-2 gap-6 mb-8">
          {/* Status Distribution Pie */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
            <h2 className="text-lg font-semibold mb-4">Pipeline Status</h2>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={pieData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={100} label={({ name, value }) => `${name}: ${value}`}>
                  {pieData.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46" }} />
              </PieChart>
            </ResponsiveContainer>
          </div>

          {/* Velocity per Cycle */}
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5">
            <h2 className="text-lg font-semibold mb-4">Sprint Velocity (points completed)</h2>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={data.cycleStats}>
                <CartesianGrid strokeDasharray="3 3" stroke="#3f3f46" />
                <XAxis dataKey="cycle" stroke="#a1a1aa" />
                <YAxis stroke="#a1a1aa" />
                <Tooltip contentStyle={{ background: "#18181b", border: "1px solid #3f3f46" }} />
                <Legend />
                <Bar dataKey="completedPoints" name="Points Done" fill="#3ec27a" radius={[4, 4, 0, 0]} />
                <Bar dataKey="totalPoints" name="Points Committed" fill="#7c7cff" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* Projects Table */}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 mb-8">
          <h2 className="text-lg font-semibold mb-4">Cost per Initiative (Projects)</h2>
          <p className="text-xs text-zinc-500 mb-3">Based on $300/day average engineer rate. Points map to: XS=0.5d, S=1d, M=2d, L=4d, XL=8d.</p>
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-zinc-800 text-zinc-400">
                <th className="text-left py-2">Initiative</th>
                <th className="text-center py-2">Issues</th>
                <th className="text-center py-2">Completed</th>
                <th className="text-center py-2">Points</th>
                <th className="text-center py-2">Est. Cost</th>
                <th className="text-center py-2">Progress</th>
              </tr>
            </thead>
            <tbody>
              {data.projectStats.filter(p => p.total > 0).sort((a, b) => b.totalPoints - a.totalPoints).map((p) => (
                <tr key={p.name} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                  <td className="py-2 font-medium">{p.name}</td>
                  <td className="text-center">{p.total}</td>
                  <td className="text-center">{p.completed}</td>
                  <td className="text-center">{p.totalPoints}</td>
                  <td className="text-center">${(p.totalPoints * 2 * 300).toLocaleString()}</td>
                  <td className="text-center">
                    <div className="w-24 h-2 bg-zinc-800 rounded-full inline-block">
                      <div className="h-2 bg-emerald-500 rounded-full" style={{ width: `${p.completionRate}%` }} />
                    </div>
                    <span className="ml-2 text-xs text-zinc-400">{p.completionRate}%</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Estimation Accuracy */}
        {data.estimationAccuracy.length > 0 && (
          <div className="rounded-xl border border-zinc-800 bg-zinc-900/50 p-5 mb-8">
            <h2 className="text-lg font-semibold mb-4">Estimation Accuracy (AI vs Actual)</h2>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-zinc-800 text-zinc-400">
                  <th className="text-left py-2">Issue</th>
                  <th className="text-center py-2">AI Estimate (pts)</th>
                  <th className="text-center py-2">Actual (days)</th>
                  <th className="text-center py-2">Accuracy</th>
                </tr>
              </thead>
              <tbody>
                {data.estimationAccuracy.slice(0, 20).map((ea) => (
                  <tr key={ea.identifier} className="border-b border-zinc-800/50">
                    <td className="py-2">{ea.identifier}: {ea.title.slice(0, 50)}</td>
                    <td className="text-center">{ea.estimate}</td>
                    <td className="text-center">{ea.actualDays}d</td>
                    <td className="text-center">
                      <span className={`px-2 py-0.5 rounded text-xs ${ea.accurate ? "bg-emerald-500/20 text-emerald-400" : "bg-red-500/20 text-red-400"}`}>
                        {ea.accurate ? "On track" : "Overrun"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* Footer */}
        <div className="text-center text-xs text-zinc-600 py-4">
          OEF Analytics v1.0 — Agentic OS · Open Earth Foundation · Read-only dashboard
        </div>
      </div>
    </div>
  );
}
