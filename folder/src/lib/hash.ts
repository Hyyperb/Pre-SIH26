export async function sha256Hex(input: string): Promise<string> {
  const data = new TextEncoder().encode(input);
  const digest = await crypto.subtle.digest("SHA-256", data);
  return [...new Uint8Array(digest)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

export function shortHash(hex: string): string {
  const clean = hex.replace(/^0x/, "");
  return `0x${clean.slice(0, 10)}…${clean.slice(-8)}`;
}

export function genesisHash(): string {
  return "0".repeat(64);
}
