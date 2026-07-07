"use client";

import { useEffect, useState } from "react";
import { PageHeader, Section, Card, CardHeader, Badge, StatCard } from "@/components/PageHeader";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Legend } from "recharts";

type Tier = "elite" | "high" | "medium" | "low";

interface DoraMetric {
  display: string;
  tier: Tier;
  band: string;
}

interface DoraPayload {
  repo: string;
  baseBranch: string;
  windowDays: number;
  totalMergedInWindow: number;
  metrics: {
    deploymentFrequency: DoraMetric & { value: number; unit: string };
    leadTime: DoraMetric & { valueHours: number };
    changeFailureRate: DoraMetric & { value: number; unit: string; fixCount: number; totalPRs: number };
    mttr: DoraMetric & { valueHours: number };
  };
  weeklySeries: { week: string; total: number; fixes: number; cfr: number }[];
  topContributors: { login: string; count: number }[];
  recentFixes: { number: number; title: string; url: string; author: string; mergedAt: string; leadTimeHours: number }[];
  updatedAt: string;
}

const TIER_TONE: Record<Tier, "success" | "info" | "warning" | "danger"> = {
  elite: "success",
  high: "info",
  medium: "warning",
  low: "danger",
};

const TIER_LABEL: Record<Tier, string> = {
  elite: "Elite",
  high: "High",
  medium: "Medium",
  low: "Low",
};

const METRIC_INFO: Record<
  string,
  {
    title: string;
    description: string;
    benchmark: Record<Tier, string>;
  }
> = {
  deploymentFrequency: {
    title: "Deployment Frequency",
    description: "How often merged PRs land on develop (proxy for deploys — CityCatalyst auto-deploys develop to staging).",
    benchmark: {
      elite: "On-demand (20+/wk)",
      high: "Daily → weekly (5-20/wk)",
      medium: "Weekly → monthly (1-5/wk)",
      low: "Monthly+ (<1/wk)",
    },
  },
  leadTime: {
    title: "Lead Time for Changes",
    description: "Median wall-clock time from PR opened → merged. Measures review + iteration cycle.",
    benchmark: {
      elite: "< 1 hour",
      high: "1 day → 1 week",
      medium: "1 week → 1 month",
      low: "1 month+",
    },
  },
  changeFailureRate: {
    title: "Change Failure Rate",
    description: "Fraction of merged PRs whose title/labels indicate fix / hotfix / revert.",
    benchmark: {
      elite: "0-15%",
      high: "16-30%",
      medium: "31-45%",
      low: "46%+",
    },
  },
  mttr: {
    title: "Mean Time to Recovery",
    description: "Median lead time of fix / hotfix PRs. Approximation of time to resolve production issues.",
    benchmark: {
      elite: "< 1 hour",
      high: "< 1 day",
      medium: "< 1 week",
      low: "> 1 week",
    },
  },
};

const FLOW_METRICS = [
  { name: "Cycle Time (Linear)", value: "9.9d", target: "< 5d", description: "Average time from 'In Progress' to 'Done' across migrated calibration sample (46 issues).", trend: "baseline" },
  { name: "WIP Discipline", value: "—", target: "< 1.5x team size", description: "Items simultaneously in progress. Tracked in Overview.", trend: "monitoring" },
  { name: "Throughput", value: "~25-30", target: "Stable", description: "Tasks completed per 2-week sprint across ~10 people (historical baseline).", trend: "baseline" },
  { name: "AI-Empowered Delta", value: "TBD", target: "-50% effort", description: "Delta between original Fibonacci vs. AI-calibrated size. Populates after 1 cycle of ROI data.", trend: "instrumenting" },
];

export default function DoraPage() {
  const [data, setData] = useState<DoraPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/dora")
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

  const metricEntries = data
    ? [
        { key: "deploymentFrequency", ...data.metrics.deploymentFrequency },
        { key: "leadTime", display: data.metrics.leadTime.display, tier: data.metrics.leadTime.tier, band: data.metrics.leadTime.band },
        { key: "changeFailureRate", display: data.metrics.changeFailureRate.display, tier: data.metrics.changeFailureRate.tier, band: data.metrics.changeFailureRate.band, extra: `${data.metrics.changeFailureRate.fixCount}/${data.metrics.changeFailureRate.totalPRs} fixes` },
        { key: "mttr", display: data.metrics.mttr.display, tier: data.metrics.mttr.tier, band: data.metrics.mttr.band },
      ]
    : [];

  return (
    <>
      <PageHeader
        title="DORA & Flow Metrics"
        subtitle="Industry-standard engineering performance metrics from GitHub PR data + Linear cycle data."
        actions={
          data ? (
            <Badge tone="success">Live · {data.repo}</Badge>
          ) : (
            <Badge tone="warning">Loading…</Badge>
          )
        }
      />

      {error && (
        <Card className="p-5 mb-8 border-red-200 bg-red-50">
          <p className="text-sm text-red-800">
            <span className="font-bold">Failed to load DORA data:</span> {error}
          </p>
          <p className="text-xs text-red-700 mt-1">
            Confirm <code>GITHUB_TOKEN</code> is set on the analytics server.
          </p>
        </Card>
      )}

      <Section
        title="DORA Metrics"
        description={
          data
            ? `Rolling ${data.windowDays}-day window · ${data.totalMergedInWindow} merged PRs on ${data.baseBranch}`
            : "Rolling 90-day window on Open-Earth-Foundation/CityCatalyst · develop branch"
        }
      >
        <div className="grid grid-cols-2 gap-4">
          {(loading ? [1, 2, 3, 4] : metricEntries).map((m: any, idx: number) => {
            if (loading) {
              return (
                <Card key={idx} className="p-5 animate-pulse">
                  <div className="h-4 bg-gray-100 rounded w-1/2 mb-3" />
                  <div className="h-8 bg-gray-100 rounded w-1/3 mb-4" />
                  <div className="h-16 bg-gray-50 rounded" />
                </Card>
              );
            }
            const info = METRIC_INFO[m.key];
            const tone = TIER_TONE[m.tier as Tier];
            return (
              <Card key={m.key} className="p-5">
                <div className="flex items-start justify-between mb-2">
                  <div>
                    <h3 className="text-sm font-bold text-[#00001F]">{info.title}</h3>
                    <p className="text-xs text-[#7A7B9A] mt-1 max-w-md leading-relaxed">{info.description}</p>
                  </div>
                  <Badge tone={tone}>{TIER_LABEL[m.tier as Tier]}</Badge>
                </div>
                <div className="flex items-baseline gap-3 mt-4 mb-1">
                  <span className="text-3xl font-extrabold" style={{ color: tone === "success" ? "#16A34A" : tone === "info" ? "#2351DC" : tone === "warning" ? "#D97706" : "#DC2626" }}>
                    {m.display}
                  </span>
                  <span className="text-xs text-[#7A7B9A]">band: <span className="font-semibold text-[#00001F]">{m.band}</span></span>
                </div>
                {m.extra && <p className="text-xs text-[#7A7B9A] mb-3">{m.extra}</p>}
                <div className="pt-3 border-t" style={{ borderColor: "#E5E7EB" }}>
                  <p className="text-[0.65rem] font-bold uppercase tracking-wider text-[#7A7B9A] mb-2">DORA Benchmark</p>
                  <div className="grid grid-cols-4 gap-1 text-[0.65rem]">
                    {(["elite", "high", "medium", "low"] as Tier[]).map((t) => (
                      <div
                        key={t}
                        className={`px-2 py-1 rounded text-center font-semibold ${
                          t === m.tier ? "ring-2 ring-offset-1" : "opacity-60"
                        } ${
                          t === "elite"
                            ? "bg-green-50 text-green-800"
                            : t === "high"
                            ? "bg-blue-50 text-blue-800"
                            : t === "medium"
                            ? "bg-amber-50 text-amber-800"
                            : "bg-red-50 text-red-700"
                        }`}
                        style={t === m.tier ? { boxShadow: "0 0 0 2px currentColor" } : {}}
                      >
                        {TIER_LABEL[t]}
                      </div>
                    ))}
                    {(["elite", "high", "medium", "low"] as Tier[]).map((t) => (
                      <div key={`${t}-label`} className="text-[#232640] px-1 text-center leading-tight pt-0.5">
                        {info.benchmark[t]}
                      </div>
                    ))}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      </Section>

      {data && data.weeklySeries.length > 0 && (
        <Section title="Weekly Delivery Trend" description="Merged PRs per week, with change-failure rate overlay.">
          <div className="grid grid-cols-2 gap-4">
            <Card className="p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-[#7A7B9A] mb-3">Deployment Volume (last 12 weeks)</p>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={data.weeklySeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#7A7B9A" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#7A7B9A" }} />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="total" fill="#2351DC" name="Merged PRs" radius={[3, 3, 0, 0]} />
                  <Bar dataKey="fixes" fill="#DC2626" name="Fix / Hotfix" radius={[3, 3, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Card>

            <Card className="p-5">
              <p className="text-xs font-bold uppercase tracking-wide text-[#7A7B9A] mb-3">Change Failure Rate (weekly %)</p>
              <ResponsiveContainer width="100%" height={220}>
                <LineChart data={data.weeklySeries}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E5E7EB" />
                  <XAxis dataKey="week" tick={{ fontSize: 10, fill: "#7A7B9A" }} />
                  <YAxis tick={{ fontSize: 10, fill: "#7A7B9A" }} unit="%" />
                  <Tooltip contentStyle={{ fontSize: 12 }} />
                  <Line type="monotone" dataKey="cfr" stroke="#DC2626" strokeWidth={2} dot={{ r: 3 }} name="CFR %" />
                </LineChart>
              </ResponsiveContainer>
            </Card>
          </div>
        </Section>
      )}

      {data && (data.topContributors.length > 0 || data.recentFixes.length > 0) && (
        <Section title="PR Activity">
          <div className="grid grid-cols-2 gap-4">
            {data.topContributors.length > 0 && (
              <Card>
                <CardHeader title="Top Contributors (last 90d)" />
                <ul className="divide-y" style={{ borderColor: "#E5E7EB" }}>
                  {data.topContributors.map((c) => (
                    <li key={c.login} className="flex items-center justify-between px-5 py-2.5 text-sm">
                      <span className="text-[#232640] font-medium">{c.login}</span>
                      <span className="text-[#7A7B9A]">{c.count} PRs</span>
                    </li>
                  ))}
                </ul>
              </Card>
            )}

            {data.recentFixes.length > 0 && (
              <Card>
                <CardHeader title="Recent Fix / Hotfix PRs" />
                <ul className="divide-y" style={{ borderColor: "#E5E7EB" }}>
                  {data.recentFixes.map((pr) => (
                    <li key={pr.number} className="px-5 py-2.5 text-sm">
                      <a
                        href={pr.url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-[#2351DC] hover:underline font-medium"
                      >
                        #{pr.number}
                      </a>{" "}
                      <span className="text-[#232640]">{pr.title.slice(0, 60)}{pr.title.length > 60 ? "…" : ""}</span>
                      <div className="text-[0.68rem] text-[#7A7B9A] mt-0.5">
                        {pr.author} · {new Date(pr.mergedAt).toLocaleDateString()} · lead-time {pr.leadTimeHours < 24 ? `${pr.leadTimeHours.toFixed(1)}h` : `${(pr.leadTimeHours / 24).toFixed(1)}d`}
                      </div>
                    </li>
                  ))}
                </ul>
              </Card>
            )}
          </div>
        </Section>
      )}

      <Section title="Flow Metrics (Linear Method)" description="Complementary to DORA: focus on cycle time and steady-state throughput.">
        <div className="grid grid-cols-4 gap-4">
          {FLOW_METRICS.map(m => (
            <Card key={m.name} className="p-5">
              <p className="text-xs uppercase tracking-wide text-[#7A7B9A] font-semibold">{m.name}</p>
              <p className="text-2xl font-extrabold text-[#00001F] mt-2">{m.value}</p>
              <p className="text-xs text-[#7A7B9A] mt-1">target: <span className="font-semibold">{m.target}</span></p>
              <p className="text-xs text-[#232640] mt-3 leading-relaxed">{m.description}</p>
            </Card>
          ))}
        </div>
      </Section>
    </>
  );
}
