import {
  parseCreateRoomResponse,
  type ActivityAction,
  type CreateRoomResponse,
} from "@codechess/shared/http-contract";

export type Fetch = typeof fetch;

export class CodeChessApiClient {
  constructor(
    private readonly serverUrl: string,
    private readonly fetchImpl: Fetch = fetch,
    private readonly timeoutMs = 5_000,
  ) {}

  async host(displayName: string): Promise<CreateRoomResponse> {
    return this.roomRequest("/v1/rooms", { displayName });
  }

  async join(roomCode: string, displayName: string): Promise<CreateRoomResponse> {
    return this.roomRequest(`/v1/rooms/${encodeURIComponent(roomCode)}/join`, {
      roomCode,
      displayName,
    });
  }

  async activity(playerToken: string, activityId: string, action: ActivityAction): Promise<void> {
    const response = await this.request("/v1/activity", {
      method: "POST",
      headers: {
        authorization: `Bearer ${playerToken}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({ activityId, action }),
    });
    if (response.status !== 204) throw new Error(`CodeChess activity request failed (${response.status}).`);
  }

  async health(): Promise<boolean> {
    const response = await this.request("/healthz", { method: "GET" });
    return response.ok;
  }

  private async roomRequest(path: string, body: unknown): Promise<CreateRoomResponse> {
    const response = await this.request(path, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    if (!response.ok) throw new Error(`CodeChess room request failed (${response.status}).`);
    const parsed = parseCreateRoomResponse(await response.json());
    if (!parsed) throw new Error("CodeChess server returned an invalid room response.");
    return parsed;
  }

  private request(path: string, init: RequestInit): Promise<Response> {
    const url = new URL(path, `${this.serverUrl}/`);
    return this.fetchImpl(url, { ...init, signal: AbortSignal.timeout(this.timeoutMs) });
  }
}

export function toWebSocketUrl(serverUrl: string): string {
  const url = new URL(serverUrl);
  if (url.protocol === "https:") url.protocol = "wss:";
  else if (url.protocol === "http:") url.protocol = "ws:";
  else throw new Error("CodeChess server URL must use HTTP or HTTPS.");
  return url.toString().replace(/\/$/, "");
}
