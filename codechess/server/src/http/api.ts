import type { IncomingMessage, ServerResponse } from "node:http";

import {
  parseActivityRequest,
  parseCreateRoomRequest,
  parseJoinRoomRequest,
} from "@codechess/shared/http-contract";

import { RoomStore, RoomStoreError } from "../rooms/room-store.js";
import { BodyError, readJsonBody } from "./body.js";

export type ApiOptions = {
  roomStore: RoomStore;
  leaseMs?: number;
  onActivityChanged?: (roomCode: string, playerId: string) => void;
};

function json(response: ServerResponse, status: number, value: unknown): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8" });
  response.end(JSON.stringify(value));
}

function error(response: ServerResponse, status: number, code: string, message: string): void {
  json(response, status, { error: { code, message } });
}

function bearerToken(request: IncomingMessage): string | null {
  const value = request.headers.authorization;
  return value?.startsWith("Bearer ") ? value.slice(7) : null;
}

export function createApiHandler(options: ApiOptions) {
  return async (request: IncomingMessage, response: ServerResponse): Promise<void> => {
    try {
      const url = new URL(request.url ?? "/", "http://localhost");
      if (request.method === "GET" && url.pathname === "/healthz") {
        json(response, 200, { status: "ok" });
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/rooms") {
        const body = parseCreateRoomRequest(await readJsonBody(request));
        if (!body) return error(response, 400, "INVALID_REQUEST", "Invalid room request");
        json(response, 201, options.roomStore.create(body.displayName));
        return;
      }

      const join = url.pathname.match(/^\/v1\/rooms\/([^/]+)\/join$/);
      if (request.method === "POST" && join) {
        const bodyValue = await readJsonBody(request);
        const body = parseJoinRoomRequest({
          ...(typeof bodyValue === "object" && bodyValue !== null ? bodyValue : {}),
          roomCode: join[1],
        });
        if (!body) return error(response, 400, "INVALID_REQUEST", "Invalid join request");
        json(response, 200, options.roomStore.join(body.roomCode, body.displayName));
        return;
      }

      if (request.method === "POST" && url.pathname === "/v1/activity") {
        const token = bearerToken(request);
        if (!token) return error(response, 401, "TOKEN_INVALID", "Invalid player token");
        const body = parseActivityRequest(await readJsonBody(request));
        if (!body) return error(response, 400, "INVALID_REQUEST", "Invalid activity request");
        const authenticated = options.roomStore.authenticate(token);
        if (!authenticated) return error(response, 401, "TOKEN_INVALID", "Invalid player token");
        options.roomStore.updateActivity(token, body.activityId, body.action, options.leaseMs ?? 90_000);
        options.onActivityChanged?.(authenticated.room.code, authenticated.player.id);
        response.writeHead(204);
        response.end();
        return;
      }

      error(response, 404, "NOT_FOUND", "Route not found");
    } catch (caught) {
      if (caught instanceof BodyError) {
        error(response, caught.code === "BODY_TOO_LARGE" ? 413 : 400, caught.code, caught.message);
      } else if (caught instanceof RoomStoreError) {
        const status = caught.code === "ROOM_NOT_FOUND" ? 404 : caught.code === "ROOM_FULL" ? 409 : 401;
        error(response, status, caught.code, caught.message);
      } else {
        error(response, 500, "INTERNAL_ERROR", "Internal server error");
      }
    }
  };
}
