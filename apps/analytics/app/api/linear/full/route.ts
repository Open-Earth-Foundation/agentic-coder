import { NextResponse } from "next/server";

const LINEAR_API = "https://api.linear.app/graphql";

async function linearQuery(query: string) {
  const res = await fetch(LINEAR_API, {
    method: "POST",
    headers: { Authorization: process.env.LINEAR_API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ query }),
    next: { revalidate: 60 },
  });
  const json = await res.json();
  if (json.errors) throw new Error(JSON.stringify(json.errors));
  return json.data;
}

export async function GET() {
  const teamId = process.env.LINEAR_TEAM_ID!;

  const [issuesData, projectsData] = await Promise.all([
    linearQuery(`{
      issues(filter: { team: { id: { eq: "${teamId}" } } }, first: 250) {
        nodes {
          id identifier title priority estimate
          state { name type }
          project { name }
          labels { nodes { name } }
          createdAt completedAt startedAt
        }
      }
    }`),
    linearQuery(`{
      projects(first: 20) {
        nodes {
          id name status { name }
          issues { nodes { id estimate state { type } } }
        }
      }
    }`),
  ]);

  const issues = issuesData.issues.nodes.map((i: any) => ({
    identifier: i.identifier,
    title: i.title,
    state: i.state?.name || "Unknown",
    priority: i.priority || 0,
    estimate: i.estimate,
    project: i.project?.name,
    labels: (i.labels?.nodes || []).map((l: any) => l.name),
    createdAt: i.createdAt,
    completedAt: i.completedAt,
    startedAt: i.startedAt,
  }));

  const projects = projectsData.projects.nodes.map((p: any) => {
    const pIssues = p.issues?.nodes || [];
    const completed = pIssues.filter((i: any) => i.state?.type === "completed").length;
    const total = pIssues.length;
    return {
      name: p.name,
      status: p.status?.name,
      total,
      completed,
      completionRate: total > 0 ? Math.round((completed / total) * 100) : 0,
      totalPoints: pIssues.reduce((s: number, i: any) => s + (i.estimate || 0), 0),
    };
  });

  return NextResponse.json({ issues, projects });
}
