import { env } from "@/lib/env";

export async function pinTaskMetadata(metadata: Record<string, unknown>) {
  if (!env.pinataJwt && !(env.pinataApiKey && env.pinataApiSecret)) {
    return null;
  }

  const response = await fetch("https://api.pinata.cloud/pinning/pinJSONToIPFS", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(env.pinataJwt
        ? { Authorization: `Bearer ${env.pinataJwt}` }
        : {
            pinata_api_key: env.pinataApiKey ?? "",
            pinata_secret_api_key: env.pinataApiSecret ?? "",
          }),
    },
    body: JSON.stringify({
      pinataContent: metadata,
      pinataMetadata: {
        name: `yoink-task-${String(metadata.id ?? "task")}`,
      },
    }),
    cache: "no-store",
  });

  if (!response.ok) {
    throw new Error(`Pinata pin failed with ${response.status}`);
  }

  const payload = (await response.json()) as { IpfsHash?: string };
  return payload.IpfsHash ?? null;
}
