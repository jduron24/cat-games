import type { IncomingMessage } from "node:http";

export class BodyError extends Error {
  constructor(
    public readonly code: "BODY_TOO_LARGE" | "INVALID_JSON",
    message: string,
  ) {
    super(message);
  }
}

export async function readJsonBody(request: IncomingMessage, maximumBytes = 16 * 1024): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > maximumBytes) {
      throw new BodyError("BODY_TOO_LARGE", "JSON body exceeds 16 KiB");
    }
    chunks.push(buffer);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    throw new BodyError("INVALID_JSON", "Request body must be valid JSON");
  }
}
