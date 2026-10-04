import { cp, mkdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";

const root = process.cwd();
const output = join(root, "dist");
const client = join(output, "client");
const server = join(output, "server");

await rm(output, { recursive: true, force: true });
await mkdir(client, { recursive: true });
await mkdir(server, { recursive: true });

for (const file of ["index.html", "styles.css", "game.js", "sprites"]) {
  await cp(join(root, file), join(client, file), { recursive: true });
}

const worker = `export default {
  async fetch(request, env) {
    if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
      return env.ASSETS.fetch(request);
    }
    return new Response("The Last Descent is temporarily unavailable.", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" }
    });
  }
};
`;

await writeFile(join(server, "index.js"), worker, "utf8");
console.log("Built The Last Descent.");
