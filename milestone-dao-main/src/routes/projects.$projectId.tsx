import { createFileRoute, useRouter, Link } from "@tanstack/react-router";
import { useEffect, useRef, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Calendar, Target, Users, ThumbsUp, ThumbsDown, CheckCircle2, AlertTriangle, RotateCcw, Upload, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { resolveIpfs, FALLBACK_IMAGE } from "@/lib/ipfs";
import { IpfsStatusBadge } from "@/components/IpfsStatusBadge";
import { retryPinDescription, retryPinImage, verifyProjectIpfs, verifyProjectIpfsAsset } from "@/server/ipfs.functions";
import { generateAiCoverForProject } from "@/lib/ai-image.functions";
import { AiCoverEditor, defaultAiCoverOptions, type AiCoverOptions } from "@/components/AiCoverEditor";
import { ShieldCheck, ChevronDown, ChevronUp } from "lucide-react";

export const Route = createFileRoute("/projects/$projectId")({
  component: ProjectDetail,
});

interface Project {
  id: string;
  creator_id: string;
  title: string;
  description: string;
  image_url: string | null;
  goal_amount: number;
  raised_amount: number;
  deadline: string;
  status: string;
  refund_deadline: string | null;
  description_uri: string | null;
  ipfs_image_status: string | null;
  ipfs_description_status: string | null;
}

interface Milestone {
  id: string;
  title: string;
  description: string;
  amount: number;
  order_index: number;
  status: string;
}

interface Contribution {
  id: string;
  backer_id: string;
  amount: number;
  created_at: string;
}

interface Vote {
  id: string;
  milestone_id: string;
  voter_id: string;
  approve: boolean;
}

interface RefundRequest {
  id: string;
  project_id: string;
  backer_id: string;
  approve: boolean;
  refunded: boolean;
}

function ProjectDetail() {
  const { projectId } = Route.useParams();
  const { user } = useAuth();
  const router = useRouter();
  const [project, setProject] = useState<Project | null>(null);
  const [milestones, setMilestones] = useState<Milestone[]>([]);
  const [contributions, setContributions] = useState<Contribution[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [refunds, setRefunds] = useState<RefundRequest[]>([]);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    const [{ data: p }, { data: m }, { data: c }, { data: v }, { data: r }] = await Promise.all([
      supabase.from("projects").select("*").eq("id", projectId).maybeSingle(),
      supabase.from("milestones").select("*").eq("project_id", projectId).order("order_index"),
      supabase.from("contributions").select("*").eq("project_id", projectId).order("created_at", { ascending: false }),
      supabase.from("milestone_votes").select("*"),
      supabase.from("refund_requests").select("*").eq("project_id", projectId),
    ]);
    setProject(p as Project | null);
    setMilestones((m as Milestone[]) ?? []);
    setContributions((c as Contribution[]) ?? []);
    setVotes((v as Vote[]) ?? []);
    setRefunds((r as RefundRequest[]) ?? []);
    setLoading(false);
  }, [projectId]);

  useEffect(() => { load(); }, [load]);

  // Background auto-retry: if the user owns the project and description pinning
  // failed, silently retry once when the page loads. Image retries require a
  // new file upload, so they stay manual.
  const autoRetried = useRef(false);
  useEffect(() => {
    if (!user || !project || autoRetried.current) return;
    if (project.creator_id !== user.id) return;
    if (project.ipfs_description_status !== "failed") return;
    autoRetried.current = true;
    retryPinDescription({ data: { projectId: project.id } })
      .then(() => { toast.success("Description re-pinned to IPFS"); load(); })
      .catch(() => { /* leave status as failed; manual retry available */ });
  }, [user, project, load]);

  const retryImagePin = async (file: File) => {
    if (!project) return;
    const fd = new FormData();
    fd.append("projectId", project.id);
    fd.append("file", file);
    try {
      await retryPinImage({ data: fd });
      toast.success("Cover image re-pinned");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Retry failed");
    }
  };

  const retryDescPin = async () => {
    if (!project) return;
    try {
      await retryPinDescription({ data: { projectId: project.id } });
      toast.success("Description re-pinned");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Retry failed");
    }
  };

  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiOptions, setAiOptions] = useState<AiCoverOptions>(defaultAiCoverOptions);
  const [aiEditorOpen, setAiEditorOpen] = useState(false);
  const generateAiCover = async () => {
    if (!project) return;
    setAiGenerating(true);
    try {
      await generateAiCoverForProject({ data: { projectId: project.id, customPrompt: aiOptions.customPrompt, style: aiOptions.style, negativePrompt: aiOptions.negativePrompt } });
      toast.success("AI cover generated and pinned to IPFS");
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI cover generation failed");
    } finally {
      setAiGenerating(false);
    }
  };

  const [verifying, setVerifying] = useState<null | "image" | "description" | "all">(null);
  const verifyAsset = useCallback(async (kind: "image" | "description", silent = false) => {
    if (!project) return;
    setVerifying(kind);
    try {
      const r = await verifyProjectIpfsAsset({ data: { projectId: project.id, kind } });
      if (!silent) {
        if (r.status === "ok") toast.success(`${kind === "image" ? "Image" : "Description"} reachable on gateway`);
        else if (r.status === "unreachable") toast.error(`${kind} unreachable on gateway`);
        else toast.message(`No ${kind} pinned`);
      }
      load();
      return r.status;
    } catch (e) {
      if (!silent) toast.error(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setVerifying(null);
    }
  }, [project, load]);

  const verifyIpfs = async (autoRepin = false) => {
    if (!project) return;
    setVerifying("all");
    try {
      const r = await verifyProjectIpfs({ data: { projectId: project.id } });
      const issues: string[] = [];
      if (r.image === "unreachable") issues.push("image");
      if (r.description === "unreachable") issues.push("description");
      if (issues.length === 0) toast.success("IPFS content reachable via gateway");
      else toast.error(`Unreachable on gateway: ${issues.join(", ")}`);

      if (autoRepin && r.description === "unreachable" && project.creator_id === user?.id) {
        await retryDescPin();
      }
      load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Verification failed");
    } finally {
      setVerifying(null);
    }
  };

  // Periodic background verifier: every 60s, silently re-check any asset whose
  // status is "failed" so it can self-heal once the gateway is reachable again.
  useEffect(() => {
    if (!project) return;
    const tick = () => {
      if (project.ipfs_image_status === "failed" && project.image_url) {
        verifyAsset("image", true);
      }
      if (project.ipfs_description_status === "failed" && project.description_uri) {
        verifyAsset("description", true);
      }
    };
    const id = setInterval(tick, 60_000);
    return () => clearInterval(id);
  }, [project, verifyAsset]);

  const isBacker = !!user && contributions.some((c) => c.backer_id === user.id);
  const backerCount = new Set(contributions.map((c) => c.backer_id)).size;

  const contribute = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return router.navigate({ to: "/auth" });
    const amt = Number(amount);
    if (!amt || amt <= 0) return;
    const { error } = await supabase.from("contributions").insert({
      project_id: projectId,
      backer_id: user.id,
      amount: amt,
    });
    if (error) toast.error(error.message);
    else {
      toast.success(`Contributed ${amt} ETH`);
      setAmount("");
      load();
    }
  };

  const vote = async (milestoneId: string, approve: boolean) => {
    if (!user) return router.navigate({ to: "/auth" });
    if (!isBacker) return toast.error("Only backers can vote");
    const existing = votes.find((v) => v.milestone_id === milestoneId && v.voter_id === user.id);
    const op = existing
      ? supabase.from("milestone_votes").update({ approve }).eq("id", existing.id)
      : supabase.from("milestone_votes").insert({ milestone_id: milestoneId, voter_id: user.id, approve });
    const { error } = await op;
    if (error) toast.error(error.message);
    else {
      toast.success("Vote recorded");
      load();
    }
  };

  const releaseFunds = async (milestoneId: string) => {
    const ms = milestones.find((m) => m.id === milestoneId);
    if (!ms) return;
    const ms_votes = votes.filter((v) => v.milestone_id === milestoneId);
    const yes = ms_votes.filter((v) => v.approve).length;
    const total = ms_votes.length;
    if (total === 0 || yes / total < 0.5) {
      return toast.error("Needs majority approval");
    }
    const { error } = await supabase.from("milestones").update({ status: "released" }).eq("id", milestoneId);
    if (error) toast.error(error.message);
    else { toast.success("Funds released"); load(); }
  };

  const castRefundVote = async (approve: boolean) => {
    if (!user) return router.navigate({ to: "/auth" });
    if (!isBacker) return toast.error("Only backers can vote for refunds");
    if (project?.refund_deadline && new Date(project.refund_deadline).getTime() < Date.now()) {
      return toast.error("Refund voting window has closed");
    }
    const existing = refunds.find((r) => r.backer_id === user.id);
    const op = existing
      ? supabase.from("refund_requests").update({ approve }).eq("id", existing.id)
      : supabase.from("refund_requests").insert({ project_id: projectId, backer_id: user.id, approve });
    const { error } = await op;
    if (error) toast.error(error.message);
    else { toast.success("Refund vote recorded"); load(); }
  };

  const executeRefund = async () => {
    if (!project) return;
    const yes = refunds.filter((r) => r.approve).length;
    const total = refunds.length;
    if (total === 0 || yes / total < 0.5) return toast.error("Needs majority approval");
    const { error } = await supabase.from("projects").update({ status: "refunded" }).eq("id", project.id);
    if (error) return toast.error(error.message);
    await supabase.from("refund_requests").update({ refunded: true }).eq("project_id", project.id);
    toast.success("Refunds issued to backers");
    load();
  };

  if (loading) {
    return <main className="container mx-auto px-4 py-12"><div className="card-surface h-96 animate-pulse" /></main>;
  }

  if (!project) {
    return (
      <main className="container mx-auto px-4 py-20 text-center">
        <p className="text-muted-foreground">Project not found.</p>
        <Button asChild className="mt-4"><Link to="/">Back to home</Link></Button>
      </main>
    );
  }

  const pct = Math.min(100, Math.round((Number(project.raised_amount) / Number(project.goal_amount)) * 100));
  const daysLeft = Math.max(0, Math.ceil((new Date(project.deadline).getTime() - Date.now()) / 86400000));
  const isCreator = user?.id === project.creator_id;

  return (
    <main className="container mx-auto px-4 py-12 grid lg:grid-cols-3 gap-8">
      <div className="lg:col-span-2 space-y-6">
        <div className="card-surface overflow-hidden">
          {project.image_url ? (
            <img
              src={resolveIpfs(project.image_url) ?? FALLBACK_IMAGE}
              alt={project.title}
              className="w-full aspect-video object-cover"
              onError={(e) => { (e.currentTarget as HTMLImageElement).src = FALLBACK_IMAGE; }}
            />
          ) : (
            <div className="w-full aspect-video bg-gradient-primary opacity-30" />
          )}
        </div>

        <div className="space-y-3">
          <Badge variant="outline" className="capitalize">{project.status}</Badge>
          <h1 className="text-4xl font-bold tracking-tight">{project.title}</h1>
          <p className="text-muted-foreground whitespace-pre-line leading-relaxed">{project.description}</p>
          <div className="flex flex-wrap gap-2 pt-1 items-center">
            <IpfsStatusBadge label="Image" status={project.ipfs_image_status} />
            <IpfsStatusBadge label="Description" status={project.ipfs_description_status} />
            {project.image_url && (
              <Button size="sm" variant="outline" onClick={() => verifyAsset("image")} disabled={verifying !== null}>
                <ShieldCheck className="h-3 w-3 mr-1" />
                {verifying === "image" ? "Checking image…" : "Verify image"}
              </Button>
            )}
            {project.description_uri && (
              <Button size="sm" variant="outline" onClick={() => verifyAsset("description")} disabled={verifying !== null}>
                <ShieldCheck className="h-3 w-3 mr-1" />
                {verifying === "description" ? "Checking description…" : "Verify description"}
              </Button>
            )}
            {(project.image_url || project.description_uri) && (
              <Button size="sm" variant="ghost" onClick={() => verifyIpfs(isCreator)} disabled={verifying !== null}>
                {verifying === "all" ? "Verifying…" : isCreator ? "Verify all & re-pin" : "Verify all"}
              </Button>
            )}
            {isCreator && (
              <>
                <Button size="sm" variant="outline" onClick={generateAiCover} disabled={aiGenerating}>
                  <Sparkles className="h-3 w-3 mr-1" />
                  {aiGenerating ? "Generating…" : project.image_url ? "Regenerate AI cover" : "Generate AI cover"}
                </Button>
                <Button size="sm" variant="ghost" onClick={() => setAiEditorOpen((v) => !v)}>
                  {aiEditorOpen ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                  {aiEditorOpen ? "Hide prompt editor" : "Customize prompt & style"}
                </Button>
              </>
            )}
          </div>
          {isCreator && aiEditorOpen && (
            <AiCoverEditor
              value={aiOptions}
              onChange={setAiOptions}
              subjectHint={`${project.title}. ${project.description ?? ""}`.trim()}
              disabled={aiGenerating}
            />
          )}
          {isCreator && (project.ipfs_image_status === "failed" || project.ipfs_description_status === "failed") && (
            <div className="card-surface p-4 space-y-2 border-destructive/30">
              <p className="text-sm font-medium flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" /> Some IPFS pins failed</p>
              <div className="flex flex-wrap gap-2">
                {project.ipfs_description_status === "failed" && (
                  <Button size="sm" variant="outline" onClick={retryDescPin}>
                    <RotateCcw className="h-3 w-3 mr-1" /> Retry description
                  </Button>
                )}
                {project.ipfs_image_status === "failed" && (
                  <label className="inline-flex items-center gap-2 text-xs cursor-pointer rounded-md border border-border px-3 py-1.5 hover:bg-accent">
                    <Upload className="h-3 w-3" /> Re-upload cover image
                    <input
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => { const f = e.target.files?.[0]; if (f) retryImagePin(f); }}
                    />
                  </label>
                )}
              </div>
              <p className="text-xs text-muted-foreground">Description pins auto-retry once when the page loads.</p>
            </div>
          )}
        </div>

        <section className="space-y-4">
          <h2 className="text-2xl font-bold">Milestones</h2>
          {milestones.length === 0 && <p className="text-muted-foreground text-sm">No milestones defined.</p>}
          {milestones.map((m, i) => {
            const ms_votes = votes.filter((v) => v.milestone_id === m.id);
            const yes = ms_votes.filter((v) => v.approve).length;
            const no = ms_votes.length - yes;
            const userVote = user ? ms_votes.find((v) => v.voter_id === user.id) : undefined;
            const released = m.status === "released";

            return (
              <div key={m.id} className="card-surface p-5 space-y-3">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Milestone {i + 1}</div>
                    <h3 className="font-semibold text-lg">{m.title}</h3>
                    <p className="text-sm text-muted-foreground mt-1">{m.description}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <div className="font-bold text-primary">{Number(m.amount)} ETH</div>
                    {released && (
                      <Badge className="mt-1 bg-success/20 text-success border-success/30">
                        <CheckCircle2 className="h-3 w-3 mr-1" /> Released
                      </Badge>
                    )}
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 pt-2 border-t border-border">
                  <Button
                    size="sm"
                    variant={userVote?.approve === true ? "default" : "outline"}
                    onClick={() => vote(m.id, true)}
                    disabled={released || !isBacker}
                    className={userVote?.approve === true ? "bg-success text-success-foreground hover:bg-success/90" : ""}
                  >
                    <ThumbsUp className="h-4 w-4 mr-1" /> Approve ({yes})
                  </Button>
                  <Button
                    size="sm"
                    variant={userVote?.approve === false ? "default" : "outline"}
                    onClick={() => vote(m.id, false)}
                    disabled={released || !isBacker}
                    className={userVote?.approve === false ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
                  >
                    <ThumbsDown className="h-4 w-4 mr-1" /> Reject ({no})
                  </Button>
                  {isCreator && !released && (
                    <Button size="sm" variant="outline" className="ml-auto" onClick={() => releaseFunds(m.id)}>
                      Release funds
                    </Button>
                  )}
                </div>
                {!isBacker && !released && (
                  <p className="text-xs text-muted-foreground">Contribute to vote on this milestone.</p>
                )}
              </div>
            );
          })}
        </section>
      </div>

      <aside className="space-y-6 lg:sticky lg:top-24 self-start">
        <div className="card-surface p-6 space-y-4">
          <div>
            <div className="text-3xl font-bold">{Number(project.raised_amount).toLocaleString()} ETH</div>
            <div className="text-sm text-muted-foreground">raised of {Number(project.goal_amount).toLocaleString()} ETH</div>
          </div>
          <Progress value={pct} className="h-2" />
          <div className="grid grid-cols-3 gap-2 text-center text-sm">
            <div className="card-surface p-3">
              <div className="font-bold text-primary">{pct}%</div>
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1"><Target className="h-3 w-3" /> Funded</div>
            </div>
            <div className="card-surface p-3">
              <div className="font-bold">{backerCount}</div>
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1"><Users className="h-3 w-3" /> Backers</div>
            </div>
            <div className="card-surface p-3">
              <div className="font-bold">{daysLeft}d</div>
              <div className="text-xs text-muted-foreground flex items-center justify-center gap-1"><Calendar className="h-3 w-3" /> Left</div>
            </div>
          </div>

          <form onSubmit={contribute} className="space-y-2 pt-2 border-t border-border">
            <Input
              type="number"
              min="0.01"
              step="0.01"
              placeholder="Amount in ETH"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
            />
            <Button type="submit" className="w-full bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow">
              {user ? "Contribute" : "Sign in to contribute"}
            </Button>
          </form>
        </div>

        {(() => {
          const deadlinePassed = new Date(project.deadline).getTime() < Date.now();
          const goalMet = Number(project.raised_amount) >= Number(project.goal_amount);
          const failed = project.status === "failed" || (deadlinePassed && !goalMet);
          const isRefunded = project.status === "refunded";
          if (!failed && !isRefunded) return null;
          const yes = refunds.filter((r) => r.approve).length;
          const no = refunds.length - yes;
          const myRefund = user ? refunds.find((r) => r.backer_id === user.id) : undefined;
          const refundDeadlineMs = project.refund_deadline
            ? new Date(project.refund_deadline).getTime()
            : new Date(project.deadline).getTime() + 14 * 86400000;
          const windowOpen = Date.now() < refundDeadlineMs;
          const daysToVote = Math.max(0, Math.ceil((refundDeadlineMs - Date.now()) / 86400000));
          const canExecute = windowOpen === false && refunds.length > 0 && yes / refunds.length >= 0.5;
          return (
            <div className="card-surface p-6 space-y-3 border-destructive/30">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-4 w-4 text-destructive" />
                <h3 className="font-semibold">{isRefunded ? "Refunds issued" : "Project failed"}</h3>
              </div>
              {isRefunded ? (
                <p className="text-sm text-muted-foreground">
                  {myRefund?.refunded ? "Your contribution has been marked refunded." : "Backers have been refunded."}
                </p>
              ) : (
                <>
                  <p className="text-xs text-muted-foreground">
                    {windowOpen
                      ? `Refund voting open — ${daysToVote} day${daysToVote === 1 ? "" : "s"} left to vote.`
                      : "Refund voting window has closed."}
                  </p>
                  <div className="flex gap-2">
                    <Button
                      size="sm"
                      variant={myRefund?.approve === true ? "default" : "outline"}
                      onClick={() => castRefundVote(true)}
                      disabled={!isBacker || !windowOpen}
                      className={myRefund?.approve === true ? "bg-success text-success-foreground hover:bg-success/90" : ""}
                    >
                      <ThumbsUp className="h-4 w-4 mr-1" /> Refund ({yes})
                    </Button>
                    <Button
                      size="sm"
                      variant={myRefund?.approve === false ? "default" : "outline"}
                      onClick={() => castRefundVote(false)}
                      disabled={!isBacker || !windowOpen}
                      className={myRefund?.approve === false ? "bg-destructive text-destructive-foreground hover:bg-destructive/90" : ""}
                    >
                      <ThumbsDown className="h-4 w-4 mr-1" /> Keep ({no})
                    </Button>
                  </div>
                  {!windowOpen && (
                    <Button size="sm" variant="outline" className="w-full" onClick={executeRefund} disabled={!canExecute}>
                      <RotateCcw className="h-4 w-4 mr-1" /> Execute refunds
                    </Button>
                  )}
                  {!isBacker && windowOpen && <p className="text-xs text-muted-foreground">Only backers can vote.</p>}
                </>
              )}
            </div>
          );
        })()}

        {contributions.length > 0 && (
          <div className="card-surface p-6 space-y-3">
            <h3 className="font-semibold">Recent backers</h3>
            <ul className="space-y-2 text-sm">
              {contributions.slice(0, 6).map((c) => (
                <li key={c.id} className="flex justify-between text-muted-foreground">
                  <span className="font-mono text-xs">{c.backer_id.slice(0, 8)}…</span>
                  <span className="text-foreground font-semibold">{Number(c.amount)} ETH</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </aside>
    </main>
  );
}
