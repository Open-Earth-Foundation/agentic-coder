"use client";

import { PageHeader, Section, Card, CardHeader, Badge, StatCard } from "@/components/PageHeader";

const DORA_METRICS = [
  {
    name: "Deployment Frequency",
    value: "—",
    target: "Daily",
    description: "How often code is deployed to production. Elite teams deploy multiple times per day.",
    status: "pending",
    benchmark: { elite: "On-demand", high: "Daily-weekly", medium: "Weekly-monthly", low: "Monthly+" },
  },
  {
    name: "Lead Time for Changes",
    value: "—",
    target: "< 1 day",
    description: "Time from code commit to code running in production.",
    status: "pending",
    benchmark: { elite: "< 1 hour", high: "1 day-1 week", medium: "1 week-1 month", low: "1 month+" },
  },
  {
    name: "Change Failure Rate",
    value: "—",
    target: "< 15%",
    description: "Percentage of deployments causing a failure in production requiring remediation.",
    status: "pending",
    benchmark: { elite: "0-15%", high: "16-30%", medium: "16-30%", low: "16-30%+" },
  },
  {
    name: "Mean Time to Recovery",
    value: "—",
    target: "< 1 hour",
    description: "Time to restore service after a production incident.",
    status: "pending",
    benchmark: { elite: "< 1 hour", high: "< 1 day", medium: "< 1 week", low: "> 1 week" },
  },
];

const FLOW_METRICS = [
  { name: "Cycle Time", value: "9.9d", target: "< 5d", description: "Average time from 'In Progress' to 'Done' across migrated calibration sample (46 issues).", trend: "baseline" },
  { name: "Velocity", value: "—", target: "Predictable ±15%", description: "Points completed per cycle. Tracked in Sprint Velocity chart on Overview.", trend: "tracking" },
  { name: "WIP Limit", value: "—", target: "< 1.5x team size", description: "Items in progress simultaneously. Discipline metric.", trend: "monitoring" },
  { name: "Throughput", value: "~25-30", target: "Stable", description: "Tasks completed per 2-week sprint across ~10 people (historical baseline).", trend: "baseline" },
];

export default function DoraPage() {
  return (
    <>
      <PageHeader
        title="DORA & Flow Metrics"
        subtitle="Industry-standard engineering performance metrics, plus Linear Flow framework metrics for steady-state delivery."
        actions={<Badge tone="warning">Instrumenting</Badge>}
      />

      <Section title="DORA Metrics (DevOps Research and Assessment)" description="Four key metrics for engineering performance, originally from Google's State of DevOps reports.">
        <div className="grid grid-cols-2 gap-4">
          {DORA_METRICS.map(m => (
            <Card key={m.name} className="p-5">
              <div className="flex items-start justify-between mb-2">
                <div>
                  <h3 className="text-sm font-bold text-[#00001F]">{m.name}</h3>
                  <p className="text-xs text-[#7A7B9A] mt-1 max-w-md">{m.description}</p>
                </div>
                <Badge tone="warning">Pending</Badge>
              </div>
              <div className="flex items-baseline gap-3 mt-4 mb-4">
                <span className="text-3xl font-extrabold text-[#7A7B9A]">{m.value}</span>
                <span className="text-xs text-[#7A7B9A]">target: <span className="font-semibold text-[#00001F]">{m.target}</span></span>
              </div>
              <div className="pt-3 border-t" style={{ borderColor: "#E5E7EB" }}>
                <p className="text-[0.65rem] font-bold uppercase tracking-wider text-[#7A7B9A] mb-2">Benchmark</p>
                <div className="grid grid-cols-4 gap-1 text-[0.65rem]">
                  <div className="bg-green-50 text-green-800 px-2 py-1 rounded text-center font-semibold">Elite</div>
                  <div className="bg-blue-50 text-blue-800 px-2 py-1 rounded text-center font-semibold">High</div>
                  <div className="bg-amber-50 text-amber-800 px-2 py-1 rounded text-center font-semibold">Medium</div>
                  <div className="bg-red-50 text-red-700 px-2 py-1 rounded text-center font-semibold">Low</div>
                  <div className="text-[#232640] px-2 text-center">{m.benchmark.elite}</div>
                  <div className="text-[#232640] px-2 text-center">{m.benchmark.high}</div>
                  <div className="text-[#232640] px-2 text-center">{m.benchmark.medium}</div>
                  <div className="text-[#232640] px-2 text-center">{m.benchmark.low}</div>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </Section>

      <Section title="Flow Metrics (Linear Method)" description="Linear's framework: prioritize flow and cycle time over velocity points.">
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

      <Section title="Instrumentation Plan">
        <Card className="p-5">
          <p className="text-sm text-[#232640] mb-3">DORA metrics require GitHub integration (deployments + incidents). Currently instrumenting:</p>
          <ul className="space-y-2 text-sm text-[#232640]">
            <li className="flex gap-2"><span className="text-[#2351DC]">→</span> GitHub Actions webhook to capture deployments (next sprint)</li>
            <li className="flex gap-2"><span className="text-[#2351DC]">→</span> Sentry / PagerDuty integration for incident tracking</li>
            <li className="flex gap-2"><span className="text-[#2351DC]">→</span> Linear cycle data already feeds Cycle Time + Throughput</li>
            <li className="flex gap-2"><span className="text-[#2351DC]">→</span> Cross-reference PR merge time vs Linear 'Done' transition for Lead Time</li>
          </ul>
        </Card>
      </Section>
    </>
  );
}
