export type CliOptions = {
  help: boolean;
  mock: boolean;
  url: string;
  userId: string;
};

type Environment = Record<string, string | undefined>;

export function parseCliOptions(args: string[], environment: Environment): CliOptions {
  const options: CliOptions = {
    help: false,
    mock: false,
    url: environment.CODECHESS_WS_URL ?? "ws://localhost:8080",
    userId: environment.CODECHESS_USER_ID ?? "terminal-user",
  };

  for (let index = 0; index < args.length; index += 1) {
    const argument = args[index];
    switch (argument) {
      case "--mock":
        options.mock = true;
        break;
      case "--help":
      case "-h":
        options.help = true;
        break;
      case "--url": {
        const value = args[index + 1];
        if (!value || value.startsWith("--")) {
          throw new Error("Expected a value after --url.");
        }
        options.url = value;
        index += 1;
        break;
      }
      case "--user-id": {
        const value = args[index + 1];
        if (!value || value.startsWith("--")) {
          throw new Error("Expected a value after --user-id.");
        }
        options.userId = value;
        index += 1;
        break;
      }
      default:
        throw new Error(`Unknown option: ${argument}`);
    }
  }

  return options;
}

export const CLI_HELP = `CodeChess terminal client

Usage:
  npm run ui:mock
  npm run ui -- --url ws://localhost:8080 --user-id alice

Options:
  --mock              Run the standalone local game
  --url <websocket>   Multiplayer WebSocket URL
  --user-id <id>      Temporary protocol user ID
  -h, --help          Show this help

Environment:
  CODECHESS_WS_URL
  CODECHESS_USER_ID
`;
