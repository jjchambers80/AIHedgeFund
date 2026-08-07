import { buildServer } from "./server.js";

const port = parseInt(process.env["PORT"] ?? "3001", 10);
const host = process.env["HOST"] ?? "0.0.0.0";

const server = await buildServer();

try {
  await server.listen({ port, host });
  server.log.info(`ARF-OS API listening on ${host}:${port}`);
} catch (err) {
  server.log.error(err);
  process.exit(1);
}
