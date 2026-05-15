import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const GATEWAY_URL = "https://ai.gateway.lovable.dev/v1/chat/completions";
const PINATA_API = "https://api.pinata.cloud";

export const AI_COVER_STYLES = [
  { id: "cinematic", label: "Cinematic", hint: "cinematic lighting, dramatic composition, shallow depth of field, film grain" },
  { id: "photorealistic", label: "Photorealistic", hint: "photorealistic, high-detail DSLR photography, natural lighting" },
  { id: "illustration", label: "Illustration", hint: "modern editorial illustration, bold shapes, expressive line work" },
  { id: "3d", label: "3D render", hint: "stylized 3D render, soft global illumination, octane-style materials" },
  { id: "watercolor", label: "Watercolor", hint: "loose watercolor painting, organic washes, paper texture" },
  { id: "minimalist", label: "Minimalist", hint: "minimalist flat design, generous negative space, limited palette" },
  { id: "cyberpunk", label: "Cyberpunk", hint: "neon-soaked cyberpunk cityscape, vibrant magenta and cyan, rain reflections" },
  { id: "pixel", label: "Pixel art", hint: "16-bit pixel art, crisp dithering, vibrant retro palette" },
  { id: "isometric", label: "Isometric", hint: "isometric vector illustration, soft shadows, clean geometry" },
] as const;

export type AiCoverStyleId = (typeof AI_COVER_STYLES)[number]["id"];
const STYLE_MAP: Record<string, string> = Object.fromEntries(AI_COVER_STYLES.map((s) => [s.id, s.hint]));

interface PromptOptions {
  subject: string;
  customPrompt?: string;
  style?: string;
  negativePrompt?: string;
}

function buildPrompt({ subject, customPrompt, style, negativePrompt }: PromptOptions): string {
  const core = (customPrompt?.trim() || `Subject: ${subject}`).slice(0, 1500);
  const styleHint = style && STYLE_MAP[style] ? ` Style: ${STYLE_MAP[style]}.` : "";
  const neg = negativePrompt?.trim() ? ` Avoid: ${negativePrompt.trim().slice(0, 400)}.` : "";
  return `Generate a vivid, high-quality cover image (16:9 aspect ratio) for a crowdfunding project. No text or typography in the image. ${core}.${styleHint}${neg}`;
}

async function callImageGen(prompt: string, apiKey: string): Promise<string> {
  const res = await fetch(GATEWAY_URL, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash-image",
      messages: [{ role: "user", content: prompt }],
      modalities: ["image", "text"],
    }),
  });
  if (res.status === 429) throw new Error("AI rate limit reached, please try again shortly");
  if (res.status === 402) throw new Error("AI credits exhausted — add funds in Settings → Workspace → Usage");
  if (!res.ok) throw new Error(`AI image generation failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  const url = json?.choices?.[0]?.message?.images?.[0]?.image_url?.url as string | undefined;
  if (!url || !url.startsWith("data:")) throw new Error("AI did not return an image");
  return url;
}

function dataUrlToBytes(dataUrl: string): { bytes: Uint8Array; mime: string } {
  const m = /^data:([^;]+);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error("Invalid image data URL");
  const mime = m[1];
  const bin = atob(m[2]);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { bytes, mime };
}

async function pinBytes(bytes: Uint8Array, mime: string, jwt: string): Promise<string> {
  const fd = new FormData();
  const ext = mime.includes("jpeg") ? "jpg" : mime.includes("webp") ? "webp" : "png";
  const ab = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  fd.append("file", new Blob([ab], { type: mime }), `ai-cover.${ext}`);
  const res = await fetch(`${PINATA_API}/pinning/pinFileToIPFS`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: fd,
  });
  if (!res.ok) throw new Error(`Pinata upload failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { IpfsHash: string };
  return `ipfs://${json.IpfsHash}`;
}

function parsePromptInput(input: unknown) {
  if (!input || typeof input !== "object") throw new Error("input required");
  const o = input as Record<string, unknown>;
  const subject = typeof o.subject === "string" ? o.subject.trim() : "";
  const customPrompt = typeof o.customPrompt === "string" ? o.customPrompt.trim() : "";
  const style = typeof o.style === "string" && STYLE_MAP[o.style] ? o.style : undefined;
  const negativePrompt = typeof o.negativePrompt === "string" ? o.negativePrompt.trim() : "";
  if (!subject && !customPrompt) throw new Error("Provide a subject or a custom prompt");
  return { subject, customPrompt, style, negativePrompt };
}

// Generate an AI cover image. Accepts a free-form custom prompt, style preset,
// and negative prompt so users can fully customize the look.
export const generateAiCoverPreview = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(parsePromptInput)
  .handler(async ({ data }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
    const prompt = buildPrompt(data);
    const dataUrl = await callImageGen(prompt, apiKey);
    return { dataUrl, prompt };
  });

// Generate an AI cover for an existing project: pin to IPFS and update DB.
export const generateAiCoverForProject = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("input required");
    const o = input as Record<string, unknown>;
    if (typeof o.projectId !== "string") throw new Error("projectId required");
    return {
      projectId: o.projectId,
      customPrompt: typeof o.customPrompt === "string" ? o.customPrompt.trim() : "",
      style: typeof o.style === "string" && STYLE_MAP[o.style] ? o.style : undefined,
      negativePrompt: typeof o.negativePrompt === "string" ? o.negativePrompt.trim() : "",
    };
  })
  .handler(async ({ data, context }) => {
    const apiKey = process.env.LOVABLE_API_KEY;
    if (!apiKey) throw new Error("LOVABLE_API_KEY not configured");
    const jwt = process.env.PINATA_JWT;
    if (!jwt) throw new Error("PINATA_JWT not configured");
    const { supabase } = context;

    const { data: project, error } = await supabase
      .from("projects")
      .select("id, title, description")
      .eq("id", data.projectId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!project) throw new Error("Project not found");

    const subject = `${project.title}. ${project.description ?? ""}`.trim();
    const prompt = buildPrompt({
      subject,
      customPrompt: data.customPrompt,
      style: data.style,
      negativePrompt: data.negativePrompt,
    });
    try {
      const dataUrl = await callImageGen(prompt, apiKey);
      const { bytes, mime } = dataUrlToBytes(dataUrl);
      const uri = await pinBytes(bytes, mime, jwt);
      await supabase
        .from("projects")
        .update({ image_url: uri, ipfs_image_status: "done" })
        .eq("id", data.projectId);
      return { status: "done" as const, imageUri: uri, prompt };
    } catch (err) {
      await supabase
        .from("projects")
        .update({ ipfs_image_status: "failed" })
        .eq("id", data.projectId);
      throw err instanceof Error ? err : new Error("AI cover generation failed");
    }
  });
