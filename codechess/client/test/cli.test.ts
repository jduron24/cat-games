import { describe, expect, it } from "vitest";

import { parseCliOptions } from "../src/cli.js";

describe("parseCliOptions", () => {
  it("enables standalone mock mode", () => {
    expect(parseCliOptions(["--mock"], {})).toEqual({
      help: false,
      mock: true,
      url: "ws://localhost:8080",
      userId: "terminal-user",
    });
  });

  it("accepts production URL and user ID from flags or environment", () => {
    expect(
      parseCliOptions(["--url", "wss://codechess.example/ws", "--user-id", "alice"], {}),
    ).toMatchObject({
      mock: false,
      url: "wss://codechess.example/ws",
      userId: "alice",
    });
    expect(
      parseCliOptions([], {
        CODECHESS_WS_URL: "ws://server:9000",
        CODECHESS_USER_ID: "bob",
      }),
    ).toMatchObject({ url: "ws://server:9000", userId: "bob" });
  });

  it("rejects unsupported or incomplete flags", () => {
    expect(() => parseCliOptions(["--url"], {})).toThrow(/value after --url/i);
    expect(() => parseCliOptions(["--wat"], {})).toThrow(/unknown option/i);
  });
});
