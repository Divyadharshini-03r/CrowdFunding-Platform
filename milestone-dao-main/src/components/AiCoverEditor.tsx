import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AI_COVER_STYLES } from "@/lib/ai-image.functions";

export interface AiCoverOptions {
  customPrompt: string;
  style: string;
  negativePrompt: string;
}

export const defaultAiCoverOptions: AiCoverOptions = {
  customPrompt: "",
  style: "cinematic",
  negativePrompt: "",
};

export function AiCoverEditor({
  value,
  onChange,
  subjectHint,
  disabled,
}: {
  value: AiCoverOptions;
  onChange: (next: AiCoverOptions) => void;
  subjectHint?: string;
  disabled?: boolean;
}) {
  const set = <K extends keyof AiCoverOptions>(k: K, v: AiCoverOptions[K]) => onChange({ ...value, [k]: v });
  return (
    <div className="rounded-md border border-border bg-background/40 p-4 space-y-3">
      <div className="space-y-1.5">
        <Label htmlFor="ai-prompt" className="text-xs">Custom prompt</Label>
        <Textarea
          id="ai-prompt"
          rows={3}
          disabled={disabled}
          placeholder={subjectHint ? `Leave blank to use: "${subjectHint.slice(0, 80)}${subjectHint.length > 80 ? "…" : ""}"` : "Describe the cover you want…"}
          value={value.customPrompt}
          onChange={(e) => set("customPrompt", e.target.value)}
        />
        <p className="text-[11px] text-muted-foreground">Overrides title/description. Leave empty to use them.</p>
      </div>
      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="ai-style" className="text-xs">Style preset</Label>
          <Select value={value.style} onValueChange={(v) => set("style", v)} disabled={disabled}>
            <SelectTrigger id="ai-style"><SelectValue placeholder="Choose a style" /></SelectTrigger>
            <SelectContent>
              {AI_COVER_STYLES.map((s) => (
                <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="ai-negative" className="text-xs">Avoid (negative prompt)</Label>
          <Textarea
            id="ai-negative"
            rows={2}
            disabled={disabled}
            placeholder="text, logos, watermarks, blurry…"
            value={value.negativePrompt}
            onChange={(e) => set("negativePrompt", e.target.value)}
          />
        </div>
      </div>
    </div>
  );
}
