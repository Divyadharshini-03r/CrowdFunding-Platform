import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { ProjectCard } from "@/components/ProjectCard";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Plus, Coins, Vote as VoteIcon, Rocket, AlertTriangle, CheckCircle2 } from "lucide-react";
import { IpfsStatusBadge } from "@/components/IpfsStatusBadge";

export const Route = createFileRoute("/dashboard")({
  head: () => ({ meta: [{ title: "Dashboard — FundDAO" }] }),
  component: Dashboard,
});

interface Project {
  id: string;
  title: string;
  description: string;
  image_url: string | null;
  goal_amount: number;
  raised_amount: number;
  deadline: string;
  status: string;
  creator_id: string;
  refund_deadline: string | null;
  ipfs_image_status: string | null;
  ipfs_description_status: string | null;
}

interface RefundRow {
  project_id: string;
  approve: boolean;
  refunded: boolean;
}

function Dashboard() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [myProjects, setMyProjects] = useState<Project[]>([]);
  const [backed, setBacked] = useState<Project[]>([]);
  const [myRefunds, setMyRefunds] = useState<RefundRow[]>([]);
  const [stats, setStats] = useState({ contributed: 0, votes: 0, projectCount: 0 });

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [user, authLoading, navigate]);

  useEffect(() => {
    if (!user) return;
    (async () => {
      const [{ data: mine }, { data: contribs }, { data: votes }, { data: refunds }] = await Promise.all([
        supabase.from("projects").select("*").eq("creator_id", user.id).order("created_at", { ascending: false }),
        supabase.from("contributions").select("project_id, amount").eq("backer_id", user.id),
        supabase.from("milestone_votes").select("id").eq("voter_id", user.id),
        supabase.from("refund_requests").select("project_id, approve, refunded").eq("backer_id", user.id),
      ]);
      setMyProjects((mine as Project[]) ?? []);
      setMyRefunds((refunds as RefundRow[]) ?? []);

      const totalContrib = (contribs ?? []).reduce((s, c) => s + Number(c.amount), 0);
      const projectIds = Array.from(new Set((contribs ?? []).map((c) => c.project_id)));
      let backedProjects: Project[] = [];
      if (projectIds.length) {
        const { data } = await supabase.from("projects").select("*").in("id", projectIds);
        backedProjects = (data as Project[]) ?? [];
      }
      setBacked(backedProjects);
      setStats({
        contributed: totalContrib,
        votes: votes?.length ?? 0,
        projectCount: mine?.length ?? 0,
      });
    })();
  }, [user]);

  if (!user) return null;

  const refundFor = (pid: string) => myRefunds.find((r) => r.project_id === pid);
  const isFailed = (p: Project) =>
    p.status === "failed" ||
    p.status === "refunded" ||
    (new Date(p.deadline).getTime() < Date.now() && Number(p.raised_amount) < Number(p.goal_amount));

  return (
    <main className="container mx-auto px-4 py-12 space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl md:text-4xl font-bold tracking-tight">Your dashboard</h1>
          <p className="text-muted-foreground mt-1">Track your contributions, votes, and projects.</p>
        </div>
        <Button asChild className="bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow">
          <Link to="/projects/new"><Plus className="h-4 w-4 mr-1" /> New project</Link>
        </Button>
      </div>

      <div className="grid sm:grid-cols-3 gap-4">
        {[
          { icon: Coins, label: "Total contributed", value: `${stats.contributed.toLocaleString()} ETH` },
          { icon: VoteIcon, label: "Votes cast", value: stats.votes },
          { icon: Rocket, label: "Projects launched", value: stats.projectCount },
        ].map((s) => (
          <div key={s.label} className="card-surface p-6">
            <div className="h-10 w-10 rounded-lg bg-gradient-primary flex items-center justify-center shadow-glow mb-3">
              <s.icon className="h-5 w-5 text-primary-foreground" />
            </div>
            <div className="text-2xl font-bold">{s.value}</div>
            <div className="text-sm text-muted-foreground">{s.label}</div>
          </div>
        ))}
      </div>

      <section>
        <h2 className="text-2xl font-bold mb-4">Projects you've backed</h2>
        {backed.length === 0 ? (
          <div className="card-surface p-8 text-center text-muted-foreground text-sm">
            You haven't backed any projects yet. <Link to="/" className="text-primary underline">Explore projects →</Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {backed.map((p) => {
              const r = refundFor(p.id);
              const failed = isFailed(p);
              return (
                <div key={p.id} className="space-y-2">
                  <ProjectCard project={p} />
                  {failed && (
                    <div className="card-surface p-3 flex flex-wrap items-center gap-2 text-xs">
                      {p.status === "refunded" ? (
                        <Badge className="bg-success/20 text-success border-success/30">
                          <CheckCircle2 className="h-3 w-3 mr-1" /> {r?.refunded ? "Refunded" : "Refunds issued"}
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="border-destructive/40 text-destructive">
                          <AlertTriangle className="h-3 w-3 mr-1" /> Failed
                        </Badge>
                      )}
                      {r ? (
                        <span className="text-muted-foreground">
                          You voted <span className="text-foreground font-medium">{r.approve ? "Refund" : "Keep"}</span>
                        </span>
                      ) : p.status !== "refunded" ? (
                        <Link to="/projects/$projectId" params={{ projectId: p.id }} className="text-primary underline">
                          Cast refund vote →
                        </Link>
                      ) : null}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      <section>
        <h2 className="text-2xl font-bold mb-4">Your projects</h2>
        {myProjects.length === 0 ? (
          <div className="card-surface p-8 text-center text-muted-foreground text-sm">
            You haven't launched a project yet. <Link to="/projects/new" className="text-primary underline">Launch one →</Link>
          </div>
        ) : (
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
            {myProjects.map((p) => (
              <div key={p.id} className="space-y-2">
                <ProjectCard project={p} />
                {(p.ipfs_image_status || p.ipfs_description_status) && (
                  <div className="flex flex-wrap gap-1">
                    <IpfsStatusBadge label="Image" status={p.ipfs_image_status} />
                    <IpfsStatusBadge label="Description" status={p.ipfs_description_status} />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </main>
  );
}
