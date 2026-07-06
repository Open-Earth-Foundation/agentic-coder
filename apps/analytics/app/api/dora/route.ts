import { NextResponse } from "next/server";

// DORA metrics computed from GitHub PR history for Open-Earth-Foundation/CityCatalyst.
// - Deployment Frequency: PRs merged into `develop` per week (proxy for deploys — CC auto-deploys develop to staging).
// - Lead Time for Changes: median wall time from PR opened → merged.
// - Change Failure Rate: % of merged PRs whose title or labels indicate a fix/hotfix/revert.
// - MTTR: median lead time of fix/hotfix PRs (approximation — real MTTR needs deployment events).
//
// We fetch last ~150 merged PRs via the REST API `pulls?state=closed` and filter to merged.

const OWNER = "Open-Earth-Foundation";
const REPO = "CityCatalyst";
const BASE_BRANCH = "develop";

// Regex to detect fixes / hotfixes / reverts in PR title.
const FIX_TITLE = /\b(fix|hotfix|revert|bugfix|bug-fix)\b/i;

interface PR {
  number: number;
  title: string;
  html_url: string;
  created_at: string;
  merged_at: string | null;
  base: { ref: string };
  labels: { name: string }[];
  user: { login: string };
}

async function fetchPRs(): Promise<PR[]> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) throw new Error("GITHUB_TOKEN not set");

  // 3 pages × 100 = 300 recent closed PRs
  const all: PR[] = [];
  for (let page = 1; page <= 3; page++) {
    const url = `https://api.github.com/repos/${OWNER}/${REPO}/pulls?state=closed&base=${BASE_BRANCH}&per_page=100&page=${page}&sort=updated&direction=desc`;
    const res = await fetch(url, {
      headers: {
        Authorization: `token ${token}`,
        Accept: "application/vnd.github+json",
      },
      next: { revalidate: 300 },
    });
    if (!res.ok) throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
    const page_data = (await res.json()) as PR[];
    all.push(...page_data);
    if (page_data.length < 100) break;
  }
  return all.filter((pr) => pr.merged_at !== null);
}

function median(nums: number[]): number {
  if (!nums.length) return 0;
  const s = [...nums].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function isFixPR(pr: PR): boolean {
  if (FIX_TITLE.test(pr.title)) return true;
  return pr.labels.some((l) =>
    /^(bug|hotfix|regression|revert)$/i.test(l.name)
  );
}

function classifyDeploymentFrequency(perWeek: number): {
  tier: "elite" | "high" | "medium" | "low";
  label: string;
} {
  if (perWeek >= 20) return { tier: "elite", label: "On-demand (multiple/day)" };
  if (perWeek >= 5) return { tier: "high", label: "Daily → weekly" };
  if (perWeek >= 1) return { tier: "medium", label: "Weekly → monthly" };
  return { tier: "low", label: "Monthly+" };
}

function classifyLeadTime(hours: number): {
  tier: "elite" | "high" | "medium" | "low";
  label: string;
} {
  if (hours < 1) return { tier: "elite", label: "< 1 hour" };
  if (hours < 24 * 7) return { tier: "high", label: "1 day → 1 week" };
  if (hours < 24 * 30) return { tier: "medium", label: "1 week → 1 month" };
  return { tier: "low", label: "1 month+" };
}

function classifyCFR(rate: number): {
  tier: "elite" | "high" | "medium" | "low";
  label: string;
} {
  if (rate <= 0.15) return { tier: "elite", label: "0-15%" };
  if (rate <= 0.3) return { tier: "high", label: "16-30%" };
  if (rate <= 0.45) return { tier: "medium", label: "31-45%" };
  return { tier: "low", label: "46%+" };
}

function classifyMTTR(hours: number): {
  tier: "elite" | "high" | "medium" | "low";
  label: string;
} {
  if (hours < 1) return { tier: "elite", label: "< 1 hour" };
  if (hours < 24) return { tier: "high", label: "< 1 day" };
  if (hours < 24 * 7) return { tier: "medium", label: "< 1 week" };
  return { tier: "low", label: "> 1 week" };
}

function formatHours(h: number): string {
  if (h < 1) return `${Math.round(h * 60)}m`;
  if (h < 48) return `${h.toFixed(1)}h`;
  return `${(h / 24).toFixed(1)}d`;
}

export async function GET() {
  try {
    const prs = await fetchPRs();
    if (!prs.length) {
      return NextResponse.json({ error: "No merged PRs found" }, { status: 200 });
    }

    // Focus on last 90 days for rolling metrics
    const now = Date.now();
    const NINETY_DAYS = 90 * 24 * 3600 * 1000;
    const recent = prs.filter(
      (pr) => now - new Date(pr.merged_at!).getTime() <= NINETY_DAYS
    );

    // 1. Deployment Frequency (PRs / week over last 90 days)
    const weeks = 90 / 7;
    const deploysPerWeek = recent.length / weeks;
    const dfBand = classifyDeploymentFrequency(deploysPerWeek);

    // 2. Lead Time (opened → merged) in hours, median over recent
    const leadTimesHours = recent.map(
      (pr) =>
        (new Date(pr.merged_at!).getTime() - new Date(pr.created_at).getTime()) /
        3600_000
    );
    const medLeadTime = median(leadTimesHours);
    const ltBand = classifyLeadTime(medLeadTime);

    // 3. Change Failure Rate
    const fixCount = recent.filter(isFixPR).length;
    const cfr = recent.length ? fixCount / recent.length : 0;
    const cfrBand = classifyCFR(cfr);

    // 4. MTTR (median lead time of fix/hotfix PRs)
    const fixLeadTimes = recent
      .filter(isFixPR)
      .map(
        (pr) =>
          (new Date(pr.merged_at!).getTime() -
            new Date(pr.created_at).getTime()) /
          3600_000
      );
    const medMTTR = median(fixLeadTimes);
    const mttrBand = classifyMTTR(medMTTR);

    // Time series: PRs merged per week (last 12 weeks)
    const buckets: Record<string, { total: number; fixes: number }> = {};
    const twelveWeeksAgo = now - 12 * 7 * 24 * 3600 * 1000;
    for (const pr of prs) {
      const t = new Date(pr.merged_at!).getTime();
      if (t < twelveWeeksAgo) continue;
      const d = new Date(pr.merged_at!);
      // Bucket by ISO week (year-week)
      const weekStart = new Date(d);
      weekStart.setUTCDate(d.getUTCDate() - d.getUTCDay());
      weekStart.setUTCHours(0, 0, 0, 0);
      const key = weekStart.toISOString().slice(0, 10);
      if (!buckets[key]) buckets[key] = { total: 0, fixes: 0 };
      buckets[key].total += 1;
      if (isFixPR(pr)) buckets[key].fixes += 1;
    }
    const weeklySeries = Object.entries(buckets)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([week, v]) => ({
        week,
        total: v.total,
        fixes: v.fixes,
        cfr: v.total ? +(v.fixes / v.total * 100).toFixed(1) : 0,
      }));

    // Top contributors (last 90d)
    const contribCounts: Record<string, number> = {};
    for (const pr of recent) {
      const login = pr.user?.login || "unknown";
      contribCounts[login] = (contribCounts[login] || 0) + 1;
    }
    const topContributors = Object.entries(contribCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10)
      .map(([login, count]) => ({ login, count }));

    // Recent fix PRs (for the "incidents" list on the dashboard)
    const recentFixes = recent
      .filter(isFixPR)
      .slice(0, 8)
      .map((pr) => ({
        number: pr.number,
        title: pr.title,
        url: pr.html_url,
        author: pr.user?.login,
        mergedAt: pr.merged_at,
        leadTimeHours: +(
          (new Date(pr.merged_at!).getTime() -
            new Date(pr.created_at).getTime()) /
          3600_000
        ).toFixed(1),
      }));

    return NextResponse.json({
      repo: `${OWNER}/${REPO}`,
      baseBranch: BASE_BRANCH,
      windowDays: 90,
      totalMergedInWindow: recent.length,
      metrics: {
        deploymentFrequency: {
          value: +deploysPerWeek.toFixed(1),
          unit: "PRs/week",
          display: `${deploysPerWeek.toFixed(1)}/week`,
          tier: dfBand.tier,
          band: dfBand.label,
        },
        leadTime: {
          valueHours: +medLeadTime.toFixed(1),
          display: formatHours(medLeadTime),
          tier: ltBand.tier,
          band: ltBand.label,
        },
        changeFailureRate: {
          value: +(cfr * 100).toFixed(1),
          unit: "%",
          display: `${(cfr * 100).toFixed(1)}%`,
          tier: cfrBand.tier,
          band: cfrBand.label,
          fixCount,
          totalPRs: recent.length,
        },
        mttr: {
          valueHours: +medMTTR.toFixed(1),
          display: formatHours(medMTTR),
          tier: mttrBand.tier,
          band: mttrBand.label,
        },
      },
      weeklySeries,
      topContributors,
      recentFixes,
      updatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || String(err) },
      { status: 500 }
    );
  }
}
