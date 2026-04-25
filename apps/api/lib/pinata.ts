/**
 * Pin JSON or text to IPFS via Pinata. Returns the CID and a 32-byte
 * keccak256 of the CID-as-bytes for storing on chain.
 */

import { keccak256, toHex, stringToBytes } from "viem";

const JWT = process.env.PINATA_JWT!;
if (!JWT) throw new Error("PINATA_JWT missing");

export interface PinResult {
  cid: string;
  uri: string;       // ipfs://<cid>
  hash: `0x${string}`; // keccak256(stringToBytes(uri))
}

export async function pinJSON(name: string, content: unknown): Promise<PinResult> {
  const r = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${JWT}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      pinataContent: content,
      pinataMetadata: { name },
    }),
  });
  if (!r.ok) throw new Error(`pinata pinJSON: ${r.status} ${await r.text()}`);
  const j = await r.json() as { IpfsHash: string };
  const uri = `ipfs://${j.IpfsHash}`;
  return { cid: j.IpfsHash, uri, hash: keccak256(stringToBytes(uri)) };
}

export async function pinText(name: string, content: string): Promise<PinResult> {
  const form = new FormData();
  form.append("file", new Blob([content], { type: "text/plain" }), name);
  form.append("pinataMetadata", JSON.stringify({ name }));
  const r = await fetch("https://api.pinata.cloud/pinning/pinFileToIPFS", {
    method: "POST",
    headers: { Authorization: `Bearer ${JWT}` },
    body: form,
  });
  if (!r.ok) throw new Error(`pinata pinFile: ${r.status} ${await r.text()}`);
  const j = await r.json() as { IpfsHash: string };
  const uri = `ipfs://${j.IpfsHash}`;
  return { cid: j.IpfsHash, uri, hash: keccak256(stringToBytes(uri)) };
}

export async function fetchJSON<T = unknown>(uri: string): Promise<T | null> {
  const cid = uri.startsWith("ipfs://") ? uri.slice(7) : uri;
  for (const gw of ["https://ipfs.io/ipfs/", "https://gateway.pinata.cloud/ipfs/"]) {
    try {
      const r = await fetch(`${gw}${cid}`, { signal: AbortSignal.timeout(5000) });
      if (r.ok) return await r.json() as T;
    } catch (_) { /* try next */ }
  }
  return null;
}
