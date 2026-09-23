import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createServer } from "vite";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const host = process.env.BLABLA_CANVAS_HOST ?? "127.0.0.1";
const port = Number.parseInt(
  process.env.BLABLA_PLUGIN_PORT ??
    process.env.PORT ??
    process.env.BLABLA_CANVAS_PORT ??
    "43218",
  10
);

const server = await createServer({
  configFile: resolve(root, "vite.config.ts"),
  root,
  server: {
    host,
    port,
    strictPort: true
  }
});

await server.listen();

const resolved = server.resolvedUrls?.local?.[0] ?? `http://${host}:${port}/`;
console.log(`Blabla Canvas: ready ${resolved}`);

const close = async () => {
  await server.close();
  process.exit(0);
};

process.once("SIGINT", close);
process.once("SIGTERM", close);
