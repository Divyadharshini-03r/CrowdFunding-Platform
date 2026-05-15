import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/lib/auth-context";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Progress } from "@/components/ui/progress";
import { Plus, Trash2, Upload, CheckCircle2, XCircle, Loader2, RotateCcw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { uploadToIpfs } from "@/server/ipfs.functions";
import { generateAiCoverPreview } from "@/lib/ai-image.functions";
import { AiCoverEditor, defaultAiCoverOptions, type AiCoverOptions } from "@/components/AiCoverEditor";
import { ChevronDown, ChevronUp } from "lucide-react";

export const Route = createFileRoute("/projects/new")({
  head: () => ({ meta: [{ title: "Create Project — FundDAO" }] }),
  component: NewProject,
});

interface MilestoneInput {
  title: string;
  description: string;
  amount: string;
}

type StepStatus = "idle" | "pending" | "done" | "failed" | "skipped";

interface PinState {
  image: StepStatus;
  description: StepStatus;
  imageUri?: string;
  descriptionUri?: string;
  imageError?: string;
  descriptionError?: string;
}

const initialPin: PinState = { image: "idle", description: "idle" };

function NewProject() {
  const { user, loading: authLoading } = useAuth();
  const navigate = useNavigate();
  const [submitting, setSubmitting] = useState(false);
  const [pin, setPin] = useState<PinState>(initialPin);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [aiPreview, setAiPreview] = useState<string | null>(null);
  const [aiGenerating, setAiGenerating] = useState(false);
  const [aiOptions, setAiOptions] = useState<AiCoverOptions>(defaultAiCoverOptions);
  const [aiEditorOpen, setAiEditorOpen] = useState(false);
  const [goal, setGoal] = useState("");
  const [deadline, setDeadline] = useState("");
  const [milestones, setMilestones] = useState<MilestoneInput[]>([
    { title: "", description: "", amount: "" },
  ]);

  useEffect(() => {
    if (!authLoading && !user) navigate({ to: "/auth" });
  }, [user, authLoading, navigate]);

  const updateMilestone = (i: number, k: keyof MilestoneInput, v: string) => {
    setMilestones((m) => m.map((x, idx) => (idx === i ? { ...x, [k]: v } : x)));
  };

  const generateAi = async () => {
    const subject = `${title}. ${description}`.trim();
    if (!aiOptions.customPrompt.trim() && subject.length < 4) {
      toast.error("Add a title/description or write a custom prompt");
      return;
    }
    setAiGenerating(true);
    try {
      const { dataUrl } = await generateAiCoverPreview({ data: { subject, customPrompt: aiOptions.customPrompt, style: aiOptions.style, negativePrompt: aiOptions.negativePrompt } });
      const blob = await (await fetch(dataUrl)).blob();
      const file = new File([blob], `ai-cover.${blob.type.split("/")[1] || "png"}`, { type: blob.type });
      setImageFile(file);
      setAiPreview(dataUrl);
      setImageUrl("");
      toast.success("AI cover generated — it will be pinned to IPFS on launch");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "AI generation failed");
    } finally {
      setAiGenerating(false);
    }
  };

  const pinImage = async (current: PinState): Promise<PinState> => {
    if (!imageFile) return { ...current, image: "skipped" };
    setPin({ ...current, image: "pending" });
    try {
      const fd = new FormData();
      fd.append("file", imageFile);
      const res = await uploadToIpfs({ data: fd });
      const next: PinState = { ...current, image: "done", imageUri: res.imageUri, imageError: undefined };
      setPin(next);
      return next;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Image pin failed";
      const next: PinState = { ...current, image: "failed", imageError: message };
      setPin(next);
      throw new Error(message);
    }
  };

  const pinDescription = async (current: PinState): Promise<PinState> => {
    if (!description.trim()) return { ...current, description: "skipped" };
    setPin({ ...current, description: "pending" });
    try {
      const fd = new FormData();
      fd.append("description", description);
      const res = await uploadToIpfs({ data: fd });
      const next: PinState = { ...current, description: "done", descriptionUri: res.descriptionUri, descriptionError: undefined };
      setPin(next);
      return next;
    } catch (err) {
      const message = err instanceof Error ? err.message : "Description pin failed";
      const next: PinState = { ...current, description: "failed", descriptionError: message };
      setPin(next);
      throw new Error(message);
    }
  };

  const retryImage = async () => {
    try { await pinImage(pin); toast.success("Cover image pinned"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Retry failed"); }
  };
  const retryDescription = async () => {
    try { await pinDescription(pin); toast.success("Description pinned"); }
    catch (e) { toast.error(e instanceof Error ? e.message : "Retry failed"); }
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);

    let state: PinState = { ...initialPin };
    setPin(state);

    let finalImage = imageUrl || null;
    let descriptionUri: string | null = null;

    // Try each pin independently — failure does NOT block project creation.
    try {
      state = await pinImage(state);
      if (state.imageUri) finalImage = state.imageUri;
    } catch (err) {
      toast.warning(`Image pin failed — you can retry later. ${err instanceof Error ? err.message : ""}`);
    }
    try {
      state = await pinDescription(state);
      if (state.descriptionUri) descriptionUri = state.descriptionUri;
    } catch (err) {
      toast.warning(`Description pin failed — you can retry later. ${err instanceof Error ? err.message : ""}`);
    }

    const { data: project, error } = await supabase
      .from("projects")
      .insert({
        creator_id: user.id,
        title,
        description,
        image_url: finalImage,
        description_uri: descriptionUri,
        ipfs_image_status: state.image,
        ipfs_description_status: state.description,
        goal_amount: Number(goal),
        deadline: new Date(deadline).toISOString(),
      })
      .select()
      .single();

    if (error || !project) {
      toast.error(error?.message ?? "Failed to create project");
      setSubmitting(false);
      return;
    }

    const validMilestones = milestones.filter((m) => m.title && m.amount);
    if (validMilestones.length) {
      await supabase.from("milestones").insert(
        validMilestones.map((m, i) => ({
          project_id: project.id,
          title: m.title,
          description: m.description,
          amount: Number(m.amount),
          order_index: i,
        })),
      );
    }

    toast.success("Project created");
    navigate({ to: "/projects/$projectId", params: { projectId: project.id } });
  };

  const stepCount = (imageFile ? 1 : 0) + (description.trim() ? 1 : 0);
  const doneCount = (pin.image === "done" || pin.image === "skipped" ? 1 : 0) + (pin.description === "done" || pin.description === "skipped" ? 1 : 0);
  const progressPct = stepCount === 0 ? 0 : Math.round((Math.min(doneCount, stepCount) / stepCount) * 100);
  const showStepper = pin.image !== "idle" || pin.description !== "idle";

  const StepRow = ({ label, status, uri, error, onRetry }: { label: string; status: StepStatus; uri?: string; error?: string; onRetry?: () => void }) => (
    <div className="flex items-start gap-3 text-xs">
      <div className="mt-0.5">
        {status === "pending" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
        {status === "done" && <CheckCircle2 className="h-4 w-4 text-success" />}
        {status === "failed" && <XCircle className="h-4 w-4 text-destructive" />}
        {(status === "idle" || status === "skipped") && <span className="inline-block h-4 w-4 rounded-full border border-border" />}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-medium text-foreground">{label}</div>
        {status === "pending" && <div className="text-muted-foreground">Pinning to IPFS…</div>}
        {status === "done" && uri && <div className="font-mono break-all text-muted-foreground">{uri}</div>}
        {status === "failed" && <div className="text-destructive">{error}</div>}
        {status === "skipped" && <div className="text-muted-foreground">Skipped</div>}
      </div>
      {status === "failed" && onRetry && (
        <Button type="button" size="sm" variant="outline" onClick={onRetry}>
          <RotateCcw className="h-3 w-3 mr-1" /> Retry
        </Button>
      )}
    </div>
  );

  return (
    <main className="container mx-auto px-4 py-12 max-w-3xl">
      <h1 className="text-3xl md:text-4xl font-bold tracking-tight mb-2">Launch a project</h1>
      <p className="text-muted-foreground mb-8">Backers will vote on each milestone before funds are released.</p>

      <form onSubmit={submit} className="space-y-8">
        <section className="card-surface p-6 space-y-4">
          <h2 className="font-semibold text-lg">Project details</h2>
          <div className="space-y-2">
            <Label htmlFor="title">Title</Label>
            <Input id="title" required value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="desc">Description</Label>
            <Textarea id="desc" rows={5} required value={description} onChange={(e) => setDescription(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label htmlFor="imgFile" className="flex items-center gap-2"><Upload className="h-4 w-4" /> Cover image (uploaded to IPFS)</Label>
            <Input id="imgFile" type="file" accept="image/*" onChange={(e) => { setImageFile(e.target.files?.[0] ?? null); setAiPreview(null); }} />
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" variant="outline" size="sm" onClick={generateAi} disabled={aiGenerating}>
                {aiGenerating ? <Loader2 className="h-3 w-3 mr-1 animate-spin" /> : <Sparkles className="h-3 w-3 mr-1" />}
                {aiGenerating ? "Generating…" : "Generate cover with AI"}
              </Button>
              <Button type="button" variant="ghost" size="sm" onClick={() => setAiEditorOpen((v) => !v)}>
                {aiEditorOpen ? <ChevronUp className="h-3 w-3 mr-1" /> : <ChevronDown className="h-3 w-3 mr-1" />}
                {aiEditorOpen ? "Hide prompt editor" : "Customize prompt & style"}
              </Button>
            </div>
            {aiEditorOpen && (
              <AiCoverEditor
                value={aiOptions}
                onChange={setAiOptions}
                subjectHint={`${title}. ${description}`.trim()}
                disabled={aiGenerating}
              />
            )}
            {aiPreview && (
              <div className="rounded-md border border-border overflow-hidden">
                <img src={aiPreview} alt="AI generated cover preview" className="w-full aspect-video object-cover" />
                <div className="px-3 py-2 text-xs text-muted-foreground bg-background/40">AI preview — will be pinned to IPFS on launch.</div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">Or paste an existing URL below.</p>
            <Input id="img" placeholder="https://… or ipfs://…" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} />

            {showStepper && (
              <div className="rounded-md border border-border bg-background/40 p-4 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-medium">IPFS upload progress</span>
                  <span className="text-muted-foreground">{Math.min(doneCount, stepCount)} / {stepCount} step{stepCount === 1 ? "" : "s"}</span>
                </div>
                <Progress value={progressPct} className="h-2" />
                <div className="space-y-2 pt-1">
                  <StepRow label="Cover image" status={pin.image} uri={pin.imageUri} error={pin.imageError} onRetry={retryImage} />
                  <StepRow label="Description" status={pin.description} uri={pin.descriptionUri} error={pin.descriptionError} onRetry={retryDescription} />
                </div>
              </div>
            )}
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="goal">Funding goal (ETH)</Label>
              <Input id="goal" type="number" min="0.01" step="0.01" required value={goal} onChange={(e) => setGoal(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label htmlFor="deadline">Deadline</Label>
              <Input id="deadline" type="date" required value={deadline} onChange={(e) => setDeadline(e.target.value)} />
            </div>
          </div>
        </section>

        <section className="card-surface p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-semibold text-lg">Milestones</h2>
            <Button type="button" variant="outline" size="sm" onClick={() => setMilestones((m) => [...m, { title: "", description: "", amount: "" }])}>
              <Plus className="h-4 w-4 mr-1" /> Add
            </Button>
          </div>
          {milestones.map((m, i) => (
            <div key={i} className="border border-border rounded-lg p-4 space-y-3 bg-background/30">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-muted-foreground">Milestone {i + 1}</span>
                {milestones.length > 1 && (
                  <Button type="button" variant="ghost" size="icon" onClick={() => setMilestones((arr) => arr.filter((_, idx) => idx !== i))}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                )}
              </div>
              <Input placeholder="Title" value={m.title} onChange={(e) => updateMilestone(i, "title", e.target.value)} />
              <Textarea placeholder="What will be delivered?" rows={2} value={m.description} onChange={(e) => updateMilestone(i, "description", e.target.value)} />
              <Input type="number" min="0.01" step="0.01" placeholder="Amount (ETH)" value={m.amount} onChange={(e) => updateMilestone(i, "amount", e.target.value)} />
            </div>
          ))}
        </section>

        <Button type="submit" size="lg" disabled={submitting} className="bg-gradient-primary text-primary-foreground hover:opacity-90 shadow-glow">
          {submitting ? "Creating…" : "Launch project"}
        </Button>
      </form>
    </main>
  );
}
