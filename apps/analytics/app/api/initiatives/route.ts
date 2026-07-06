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
  try {
    // Query 1: initiatives + their projects (bounded pagination — Linear rejects unbounded connections)
    const initData = await linearQuery(`{
      initiatives(first: 25) {
        nodes {
          id name description status targetDate
          projects(first: 20) {
            nodes {
              id name description
              status { name type color }
              startDate targetDate health
            }
          }
        }
      }
    }`);

    const teamId = process.env.LINEAR_TEAM_ID!;

    // Query 2: baseline issue metadata (no labels — keeps complexity low)
    async function fetchIssuePage(after?: string): Promise<any[]> {
      const afterArg = after ? `, after: "${after}"` : "";
      const data = await linearQuery(`{
        issues(
          filter: { team: { id: { eq: "${teamId}" } } }
          first: 100${afterArg}
        ) {
          nodes {
            id
            state { type }
            estimate
            project { id }
          }
          pageInfo { hasNextPage endCursor }
        }
      }`);
      const nodes = data.issues.nodes as any[];
      if (data.issues.pageInfo?.hasNextPage) {
        const more = await fetchIssuePage(data.issues.pageInfo.endCursor);
        return [...nodes, ...more];
      }
      return nodes;
    }
    const allIssues = await fetchIssuePage();

    // Query 3: which issues have ai-estimated / agent-ready labels (much lighter — filter server-side)
    async function fetchIssuesWithLabel(labelName: string): Promise<Set<string>> {
      const data = await linearQuery(`{
        issues(
          filter: {
            team: { id: { eq: "${teamId}" } }
            labels: { some: { name: { eq: "${labelName}" } } }
          }
          first: 250
        ) {
          nodes { id }
        }
      }`);
      return new Set((data.issues.nodes as any[]).map((i) => i.id));
    }
    const [aiEstimatedIds, agentReadyIds] = await Promise.all([
      fetchIssuesWithLabel("ai-estimated"),
      fetchIssuesWithLabel("agent-ready"),
    ]);

    // Group issues by project
    const issuesByProject: Record<string, any[]> = {};
    for (const i of allIssues) {
      const pid = i.project?.id;
      if (!pid) continue;
      (issuesByProject[pid] ||= []).push(i);
    }

    const initiatives = (initData.initiatives.nodes as any[]).map((init) => {
      const projects = init.projects.nodes.map((p: any) => {
        const issues = issuesByProject[p.id] || [];
        const total = issues.length;
        const completed = issues.filter(
          (i: any) => i.state?.type === "completed"
        ).length;
        const inProgress = issues.filter(
          (i: any) => i.state?.type === "started"
        ).length;
        const backlog = issues.filter((i: any) =>
          ["backlog", "unstarted", "triage"].includes(i.state?.type)
        ).length;
        const totalPoints = issues.reduce(
          (s: number, i: any) => s + (i.estimate || 0),
          0
        );
        const completedPoints = issues
          .filter((i: any) => i.state?.type === "completed")
          .reduce((s: number, i: any) => s + (i.estimate || 0), 0);
        const aiEstimated = issues.filter((i: any) =>
          aiEstimatedIds.has(i.id)
        ).length;
        const agentReady = issues.filter((i: any) =>
          agentReadyIds.has(i.id)
        ).length;
        return {
          id: p.id,
          name: p.name,
          statusName: p.status?.name,
          statusType: p.status?.type,
          statusColor: p.status?.color,
          health: p.health,
          startDate: p.startDate,
          targetDate: p.targetDate,
          total,
          completed,
          inProgress,
          backlog,
          totalPoints,
          completedPoints,
          aiEstimated,
          agentReady,
          completionPct: total > 0 ? Math.round((completed / total) * 100) : 0,
        };
      });

      const totalIssues = projects.reduce(
        (s: number, p: any) => s + p.total,
        0
      );
      const completedIssues = projects.reduce(
        (s: number, p: any) => s + p.completed,
        0
      );

      return {
        id: init.id,
        name: init.name,
        description: init.description,
        status: init.status,
        targetDate: init.targetDate,
        projectCount: projects.length,
        totalIssues,
        completedIssues,
        completionPct:
          totalIssues > 0
            ? Math.round((completedIssues / totalIssues) * 100)
            : 0,
        projects,
      };
    });

    initiatives.sort((a: any, b: any) => b.totalIssues - a.totalIssues);

    return NextResponse.json({
      total: initiatives.length,
      totalIssues: initiatives.reduce(
        (s: number, i: any) => s + i.totalIssues,
        0
      ),
      initiatives,
      updatedAt: new Date().toISOString(),
    });
  } catch (err: any) {
    return NextResponse.json(
      { error: err.message || String(err) },
      { status: 500 }
    );
  }
}
