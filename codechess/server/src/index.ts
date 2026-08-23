import { createCodeChessServer } from "./server.js";

const port = Number(process.env.PORT ?? 8080);
const host = process.env.HOST ?? "0.0.0.0";

createCodeChessServer(port, { host, allowLegacyProtocol: false });
console.log(`CodeChess server listening on http://${host}:${port}`);
