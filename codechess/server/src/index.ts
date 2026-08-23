import { createCodeChessServer } from "./server.js";

const port = Number(process.env.PORT ?? 8080);

createCodeChessServer(port);
console.log(`CodeChess WebSocket server listening on ws://localhost:${port}`);
