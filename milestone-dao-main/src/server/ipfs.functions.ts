import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

const PINATA_API = "https://api.pinata.cloud";
const GATEWAY = "https://gateway.pinata.cloud/ipfs/";

function toGateway(uri: string | null | undefined): string | null {
  if (!uri) return null;
  if (uri.startsWith("ipfs://")) return GATEWAY + uri.slice(7);
  if (uri.startsWith("http://") || uri.startsWith("https://")) return uri;
  return null;
}

async function probe(url: string): Promise<boolean> {
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 8000);
    let res = await fetch(url, { method: "HEAD", signal: ctrl.signal });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { method: "GET", signal: ctrl.signal, headers: { Range: "bytes=0-0" } });
    }
    clearTimeout(t);
    return res.ok || res.status === 206;
  } catch {
    return false;
  }
}

async function pinFile(file: File, jwt: string): Promise<string> {
  const fd = new FormData();
  fd.append("file", file, file.name || "upload");
  const res = await fetch(`${PINATA_API}/pinning/pinFileToIPFS`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}` },
    body: fd,
  });
  if (!res.ok) throw new Error(`Pinata upload failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { IpfsHash: string };
  return `ipfs://${json.IpfsHash}`;
}

async function pinJson(payload: unknown, jwt: string): Promise<string> {
  const res = await fetch(`${PINATA_API}/pinning/pinJSONToIPFS`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${jwt}`,
    },
    body: JSON.stringify({ pinataContent: payload }),
  });
  if (!res.ok) throw new Error(`Pinata JSON upload failed: ${res.status} ${await res.text()}`);
  const json = (await res.json()) as { IpfsHash: string };
  return `ipfs://${json.IpfsHash}`;
}

export const uploadToIpfs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("Expected FormData");
    return data;
  })
  .handler(async ({ data }) => {
    const jwt = process.env.PINATA_JWT;
    if (!jwt) throw new Error("PINATA_JWT not configured");

    const file = data.get("file");
    const description = data.get("description");

    const result: { imageUri?: string; descriptionUri?: string } = {};

    if (file instanceof File && file.size > 0) {
      if (file.size > 10 * 1024 * 1024) throw new Error("File too large (max 10MB)");
      result.imageUri = await pinFile(file, jwt);
    }
    if (typeof description === "string" && description.trim().length > 0) {
      result.descriptionUri = await pinJson({ description, createdAt: new Date().toISOString() }, jwt);
    }
    return result;
  });

// Retry pinning the description for an existing project. Reads the description
// text from the DB (RLS scoped to authenticated user) and updates project status.
export const retryPinDescription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    if (!input || typeof input !== "object" || !("projectId" in input)) {
      throw new Error("projectId required");
    }
    const { projectId } = input as { projectId: string };
    if (typeof projectId !== "string") throw new Error("projectId must be string");
    return { projectId };
  })
  .handler(async ({ data, context }) => {
    const jwt = process.env.PINATA_JWT;
    if (!jwt) throw new Error("PINATA_JWT not configured");
    const { supabase } = context;

    const { data: project, error } = await supabase
      .from("projects")
      .select("id, description, ipfs_description_status")
      .eq("id", data.projectId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!project) throw new Error("Project not found");
    if (!project.description?.trim()) {
      await supabase
        .from("projects")
        .update({ ipfs_description_status: "skipped" })
        .eq("id", data.projectId);
      return { status: "skipped" as const };
    }

    try {
      const uri = await pinJson(
        { description: project.description, createdAt: new Date().toISOString() },
        jwt,
      );
      await supabase
        .from("projects")
        .update({ description_uri: uri, ipfs_description_status: "done" })
        .eq("id", data.projectId);
      return { status: "done" as const, descriptionUri: uri };
    } catch (err) {
      await supabase
        .from("projects")
        .update({ ipfs_description_status: "failed" })
        .eq("id", data.projectId);
      throw err instanceof Error ? err : new Error("Pin failed");
    }
  });

// Retry pinning a fresh image upload for an existing project.
export const retryPinImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: unknown) => {
    if (!(data instanceof FormData)) throw new Error("Expected FormData");
    const projectId = data.get("projectId");
    if (typeof projectId !== "string") throw new Error("projectId required");
    return data;
  })
  .handler(async ({ data, context }) => {
    const jwt = process.env.PINATA_JWT;
    if (!jwt) throw new Error("PINATA_JWT not configured");
    const { supabase } = context;
    const projectId = data.get("projectId") as string;
    const file = data.get("file");
    if (!(file instanceof File) || file.size === 0) throw new Error("file required");
    if (file.size > 10 * 1024 * 1024) throw new Error("File too large (max 10MB)");

    try {
      const uri = await pinFile(file, jwt);
      await supabase
        .from("projects")
        .update({ image_url: uri, ipfs_image_status: "done" })
        .eq("id", projectId);
      return { status: "done" as const, imageUri: uri };
    } catch (err) {
      await supabase
        .from("projects")
        .update({ ipfs_image_status: "failed" })
        .eq("id", projectId);
      throw err instanceof Error ? err : new Error("Pin failed");
    }
  });

// Verify that the project's stored IPFS URIs resolve through the configured
// gateway. Marks the corresponding ipfs_*_status as "failed" when unreachable,
// or "done" when reachable. Returns the per-asset reachability so the UI can
// surface a one-click re-pin action.
export const verifyProjectIpfs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    if (!input || typeof input !== "object" || !("projectId" in input)) {
      throw new Error("projectId required");
    }
    const { projectId } = input as { projectId: string };
    if (typeof projectId !== "string") throw new Error("projectId must be string");
    return { projectId };
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: project, error } = await supabase
      .from("projects")
      .select("id, image_url, description_uri, ipfs_image_status, ipfs_description_status")
      .eq("id", data.projectId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!project) throw new Error("Project not found");

    const imageUrl = toGateway(project.image_url);
    const descUrl = toGateway(project.description_uri);

    const [imageOk, descOk] = await Promise.all([
      imageUrl ? probe(imageUrl) : Promise.resolve(null),
      descUrl ? probe(descUrl) : Promise.resolve(null),
    ]);

    const patch: { ipfs_image_status?: string; ipfs_description_status?: string } = {};
    if (imageOk === true) patch.ipfs_image_status = "done";
    else if (imageOk === false) patch.ipfs_image_status = "failed";
    if (descOk === true) patch.ipfs_description_status = "done";
    else if (descOk === false) patch.ipfs_description_status = "failed";

    if (Object.keys(patch).length > 0) {
      await supabase.from("projects").update(patch).eq("id", data.projectId);
    }

    return {
      image: imageOk === null ? "skipped" : imageOk ? "ok" : "unreachable",
      description: descOk === null ? "skipped" : descOk ? "ok" : "unreachable",
      checkedAt: new Date().toISOString(),
    };
  });

// Verify a single asset (image or description) reachability via the gateway.
export const verifyProjectIpfsAsset = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => {
    if (!input || typeof input !== "object") throw new Error("input required");
    const { projectId, kind } = input as { projectId?: string; kind?: string };
    if (typeof projectId !== "string") throw new Error("projectId required");
    if (kind !== "image" && kind !== "description") throw new Error("kind must be image|description");
    return { projectId, kind };
  })
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { data: project, error } = await supabase
      .from("projects")
      .select("id, image_url, description_uri")
      .eq("id", data.projectId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    if (!project) throw new Error("Project not found");

    const uri = data.kind === "image" ? project.image_url : project.description_uri;
    const url = toGateway(uri);
    if (!url) {
      const patch = data.kind === "image"
        ? { ipfs_image_status: "skipped" }
        : { ipfs_description_status: "skipped" };
      await supabase.from("projects").update(patch).eq("id", data.projectId);
      return { kind: data.kind, status: "skipped" as const, checkedAt: new Date().toISOString() };
    }
    const ok = await probe(url);
    const status = ok ? "done" : "failed";
    const patch = data.kind === "image"
      ? { ipfs_image_status: status }
      : { ipfs_description_status: status };
    await supabase.from("projects").update(patch).eq("id", data.projectId);
    return { kind: data.kind, status: ok ? ("ok" as const) : ("unreachable" as const), checkedAt: new Date().toISOString() };
  });
