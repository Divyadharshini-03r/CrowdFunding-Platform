// Lightweight MetaMask wallet helper — no ethers needed for the simulated demo.
declare global {
  interface Window {
    ethereum?: {
      request: (args: { method: string; params?: unknown[] }) => Promise<unknown>;
      on?: (event: string, handler: (...args: unknown[]) => void) => void;
      removeListener?: (event: string, handler: (...args: unknown[]) => void) => void;
      isMetaMask?: boolean;
    };
  }
}

export function hasMetaMask(): boolean {
  return typeof window !== "undefined" && !!window.ethereum;
}

export async function connectWallet(): Promise<string | null> {
  if (!hasMetaMask()) {
    window.open("https://metamask.io/download/", "_blank");
    return null;
  }
  const accounts = (await window.ethereum!.request({ method: "eth_requestAccounts" })) as string[];
  return accounts?.[0] ?? null;
}

export function shortAddress(addr: string | null | undefined): string {
  if (!addr) return "";
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}
