// IPFS URL helpers — resolve ipfs:// CIDs to a public gateway and provide a
// safe placeholder for failed loads.
const GATEWAY = "https://gateway.pinata.cloud/ipfs/";

export function resolveIpfs(url: string | null | undefined): string | null {
  if (!url) return null;
  if (url.startsWith("ipfs://")) return GATEWAY + url.slice("ipfs://".length);
  return url;
}

export const FALLBACK_IMAGE =
  "data:image/svg+xml;utf8," +
  encodeURIComponent(
    `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 16 9'><rect width='16' height='9' fill='%231a1a2e'/><text x='50%' y='50%' fill='%236b7280' font-family='sans-serif' font-size='1' text-anchor='middle' dominant-baseline='middle'>Image unavailable</text></svg>`,
  );
