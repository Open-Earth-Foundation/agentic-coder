import { NextResponse } from "next/server";

const LINEAR_API = "https://api.linear.app/graphql";

async function linearQuery(query: string, variables?: Record<string, unknown>) {
  const res = await fetch(LINEAR_API, {
    method: "POST",
    headers: {
      Authorization: process.env.LINEAR_API_KEY!,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ query, variables }),
    next: { revalidate: 60 },
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

export async function GET() {
  const teamId = process.env.LINEAR_TEAM_ID!;

  const [issuesData, cyclesData, projectsData] = await Promise.all([
    linearQuery(`{
      issues(filter: { team: { id: { eq: "${teamId}" } } }, first: 250) {
        nodes {
          id identifier title priority state { name type }
          estimate createdAt completedAt startedAt
          labels { nodes { name } }
          project { name }
          assignee { name }
        }
      }
    }`),
    linearQuery(`{
      cycles(filter: { team: { id: { eq: "${teamId}" } } }, first: 10) {
        nodes {
          id number startsAt endsAt
          completedIssueCountHistory scopeHistory
          issues { nodes { id estimate state { type } completedAt } }
        }
      }
    }`),
    linearQuery(`{
      projects(filter: { teams: { id: { eq: "${teamId}" } } }, first: 20) {
        nodes {
          id name status { name }
          issues { nodes { id estimate state { type } } }
        }
      }
    }`),
  ]);

  const issues = issuesData.issues.nodes;
  const cycles = cyclesData.cycles.nodes;
  const projects = projectsData.projects.nodes;

  const statusDistribution = issues.reduce(
    (acc: Record<string, number>, issue: any) => {
      const state = issue.state?.name || "Unknown";
      acc[state] = (acc[state] || 0) + 1;
      return acc;
    },
    {}
  );

  const projectStats = projects.map((p: any) => {
    const pIssues = p.issues?.nodes || [];
    const completed = pIssues.filter((i: any) => i.state?.type === "completed").length;
    const total = pIssues.length;
    const totalPoints = pIssues.reduce((s: number, i: any) => s + (i.estimate || 0), 0);
    return {
      name: p.name,
      status: p.status?.name,
      total,
      completed,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      totalPoints,
    };
  });

  const cycleStats = cycles.map((c: any) => {
    const cIssues = c.issues?.nodes || [];
    const completed = cIssues.filter((i: any) => i.state?.type === "completed").length;
    const totalPoints = cIssues.reduce((s: number, i: any) => s + (i.estimate || 0), 0);
    const completedPoints = cIssues
      .filter((i: any) => i.state?.type === "completed")
      .reduce((s: number, i: any) => s + (i.estimate || 0), 0);
    return {
      cycle: `Cycle ${c.number}`,
      startsAt: c.startsAt,
      endsAt: c.endsAt,
      total: cIssues.length,
      completed,
      totalPoints,
      completedPoints,
      velocity: completedPoints,
    };
  });

  const estimationAccuracy = issues
    .filter((i: any) => i.estimate && i.completedAt && i.startedAt)
    .map((i: any) => {
      const actualDays = Math.ceil(
        (new Date(i.completedAt).getTime() - new Date(i.startedAt).getTime()) /
          (1000 * 60 * 60 * 24)
      );
      return {
        identifier: i.identifier,
        title: i.title,
        estimate: i.estimate,
        actualDays,
        accurate: actualDays <= i.estimate * 1.5,
      };
    });

  return NextResponse.json({
    summary: {
      totalIssues: issues.length,
      completed: issues.filter((i: any) => i.state?.type === "completed").length,
      inProgress: issues.filter((i: any) => i.state?.type === "started").length,
      backlog: issues.filter((i: any) => ["backlog", "unstarted"].includes(i.state?.type)).length,
    },
    statusDistribution,
    projectStats,
    cycleStats,
    estimationAccuracy,
    updatedAt: new Date().toISOString(),
  });
}
