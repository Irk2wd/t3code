import type { File } from "expo-file-system";
import { fetch } from "../connection/networkAccess";

export async function downloadFile(
  url: string,
  target: File,
  options: { readonly signal: AbortSignal },
): Promise<void> {
  const response = await fetch(url, options);
  if (!response.ok || !response.body) throw new Error("Attachment download failed");
  const { FileMode } = await import("expo-file-system");
  target.create();
  const writer = target.open(FileMode.WriteOnly);
  const reader = response.body.getReader();
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) return;
      await writer.writeBytes(chunk.value);
    }
  } finally {
    reader.releaseLock();
    writer.close();
  }
}
