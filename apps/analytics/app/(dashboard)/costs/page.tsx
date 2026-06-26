"use client";

import { useEffect, useState } from "react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area } from "recharts";
import { PageHeader, Section, Card, CardHeader, Badge, StatCard } from "@/components/PageHeader";

interface ProjectStat { name: string; total: number; completed: number; completionRate: number; totalPoints: number }

const POINTS_TO_DAYS: Record<number, number> = { 1: 0.125, 2: 0.5, 3: 1, 5: 2.5, 8: 5 };
const DAILY_RATE = 300;

export default function CostsPage() {
  const [projects, setProjects] = useState<ProjectStat[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/linear")
      .then(r => r.json())
      .then(d => setProjects(d.projectStats || []))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div className="text-[#7A7B9A]">Loading...</div>;

  const activeProjects = projects.filter(p => p.total > 0);
  const totalEngineerDays = activeProjects.reduce((s, p) => s + (p.totalPoints * 2), 0);
  const completedDays = activeProjects.reduce((s, p) => s + ((p.completed / p.total) * p.totalPoints * 2), 0);
  const totalCost = totalEngineerDays * DAILY_RATE;
  const completedCost = completedDays * DAILY_RATE;

  // AI cost (Anthropic) - hardcoded estimate based on observed usage
  const aiCostMonthly = 0.04 * 30; // ~$1.20/month at current rate
  const cloudCostMonthly = 30; // estimate for AWS deploy

  return (
    <>
      <PageHeader
        title="Costs & ROI"
        subtitle="Financial view of engineering work. Implied costs from estimates, AI spend, cloud infrastructure."
      />

      <Section>
        <div className="grid grid-cols-4 gap-4">
          <StatCard label="Total Engineering Cost" value={`$${totalCost.toLocaleString()}`} variant="brand" sub="Based on point estimates × $300/day" />
          <StatCard label="Already Spent" value={`$${completedCost.toLocaleString()}`} variant="success" sub="On completed work" />
          <StatCard label="AI Cost / Month" value={`$${aiCostMonthly.toFixed(2)}`} variant="success" sub="Anthropic API (estimation + agent)" />
          <StatCard label="Cloud Infra / Month" value={`$${cloudCostMonthly}`} sub="Projected AWS spend" />
        </div>
      </Section>

      <Section title="Cost per Initiative" description={`Calculated as: total points × 2 days/point × $${DAILY_RATE}/day. Adjust the daily rate if engineer costs differ.`}>
        <Card>
          <table className="w-full text-sm">
            <thead className="bg-[#F9FAFB]">
              <tr className="text-left text-[#7A7B9A]">
                <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide">Initiative</th>
                <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide text-center">Issues</th>
                <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide text-center">Points</th>
                <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide text-right">Eng-Days</th>
                <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide text-right">Est. Total</th>
                <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide text-right">Spent</th>
                <th className="px-5 py-3 font-semibold text-xs uppercase tracking-wide text-right">Remaining</th>
              </tr>
            </thead>
            <tbody>
              {activeProjects.sort((a, b) => b.totalPoints - a.totalPoints).map(p => {
                const totalDays = p.totalPoints * 2;
                const spentDays = (p.completed / p.total) * totalDays;
                const remainDays = totalDays - spentDays;
                return (
                  <tr key={p.name} className="border-t" style={{ borderColor: "#E5E7EB" }}>
                    <td className="px-5 py-3 font-semibold text-[#00001F]">{p.name}</td>
                    <td className="px-5 py-3 text-center text-[#232640]">{p.total}</td>
                    <td className="px-5 py-3 text-center text-[#232640]">{p.totalPoints || "—"}</td>
                    <td className="px-5 py-3 text-right text-[#232640]">{totalDays.toFixed(1)}d</td>
                    <td className="px-5 py-3 text-right font-medium text-[#00001F]">${(totalDays * DAILY_RATE).toLocaleString()}</td>
                    <td className="px-5 py-3 text-right text-green-700 font-medium">${(spentDays * DAILY_RATE).toLocaleString()}</td>
                    <td className="px-5 py-3 text-right text-[#7A7B9A]">${(remainDays * DAILY_RATE).toLocaleString()}</td>
                  </tr>
                );
              })}
            </tbody>
            <tfoot className="bg-[#F9FAFB] border-t-2" style={{ borderColor: "#E5E7EB" }}>
              <tr>
                <td className="px-5 py-3 font-bold text-[#00001F]">Total</td>
                <td className="px-5 py-3 text-center font-semibold text-[#00001F]">{activeProjects.reduce((s, p) => s + p.total, 0)}</td>
                <td className="px-5 py-3 text-center font-semibold text-[#00001F]">{activeProjects.reduce((s, p) => s + (p.totalPoints || 0), 0)}</td>
                <td className="px-5 py-3 text-right font-semibold text-[#00001F]">{totalEngineerDays.toFixed(1)}d</td>
                <td className="px-5 py-3 text-right font-bold text-[#00001F]">${totalCost.toLocaleString()}</td>
                <td className="px-5 py-3 text-right font-bold text-green-700">${completedCost.toLocaleString()}</td>
                <td className="px-5 py-3 text-right font-semibold text-[#7A7B9A]">${(totalCost - completedCost).toLocaleString()}</td>
              </tr>
            </tfoot>
          </table>
        </Card>
      </Section>

      <Section title="AI Operational Costs" description="Per-month spend on AI APIs (Anthropic) and cloud infrastructure for running the agentic OS.">
        <div className="grid grid-cols-2 gap-4">
          <Card className="p-5">
            <CardHeader title="Anthropic API" action={<Badge tone="success">Active</Badge>} />
            <div className="mt-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-[#7A7B9A]">Estimation Engine</span>
                <span className="font-medium text-[#00001F]">~$0.01/issue (Haiku)</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#7A7B9A]">Agentic Coder</span>
                <span className="font-medium text-[#00001F]">~$0.30/task (Sonnet)</span>
              </div>
              <div className="flex justify-between text-sm border-t pt-3" style={{ borderColor: "#E5E7EB" }}>
                <span className="text-[#00001F] font-semibold">Projected Monthly</span>
                <span className="font-bold text-[#2351DC]">~$15-50</span>
              </div>
            </div>
          </Card>
          <Card className="p-5">
            <CardHeader title="AWS Infrastructure" action={<Badge tone="warning">Planned</Badge>} />
            <div className="mt-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-[#7A7B9A]">EC2 t3.small (analytics + agents)</span>
                <span className="font-medium text-[#00001F]">~$15/mo</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#7A7B9A]">CloudWatch logs + alerts</span>
                <span className="font-medium text-[#00001F]">~$5/mo</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-[#7A7B9A]">Data transfer + misc</span>
                <span className="font-medium text-[#00001F]">~$10/mo</span>
              </div>
              <div className="flex justify-between text-sm border-t pt-3" style={{ borderColor: "#E5E7EB" }}>
                <span className="text-[#00001F] font-semibold">Projected Monthly</span>
                <span className="font-bold text-[#2351DC]">~$30</span>
              </div>
            </div>
          </Card>
        </div>
      </Section>

      <Section title="ROI Insight">
        <Card className="p-5 bg-[#FFFBEB] border" style={{ borderColor: "#FCD34D" }}>
          <p className="text-sm font-bold text-[#92400E] mb-2">Why this matters</p>
          <p className="text-sm text-[#78350F] leading-relaxed">
            The AI Estimation Engine + Agentic Coder costs roughly <span className="font-bold">$80/month total</span> ($50 AI + $30 infra).
            If the estimation accuracy improvements save the team even <span className="font-bold">1 misestimated L-ticket (3 days)</span> per month,
            that's <span className="font-bold">$900 saved</span> at $300/day — a 10x ROI.
            The agent autonomously completing 5 small tickets per month at ~$0.30 each saves an engineer ~2 days of work = <span className="font-bold">$600 saved</span> for $1.50 spent.
          </p>
        </Card>
      </Section>
    </>
  );
}
