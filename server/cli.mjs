#!/usr/bin/env node
// Mediant local server. Serves the built UI and one Org file over localhost
// with read/write + change notifications.
//
// Default source:  ./Mediant.org
// Explicit file:   mediant ~/org/todo.org
// Directory target: mediant ~/org/
//   Uses ~/org/Mediant.org as the single source of truth.

import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const DEFAULT_SOURCE_FILE = "Mediant.org";

const HELP = `Usage: mediant [file.org | directory] [options]

Serve the Mediant agenda UI against one local Org file.

  Default:           mediant
                     uses ./Mediant.org
  Explicit file:     mediant ~/org/todo.org
  Directory target:  mediant ~/org/
                     uses ~/org/Mediant.org

Options:
  --port N        Port to listen on (default: 4242)
  --daemon        Fork to background and print the PID
  --help, -h      Show this message

Stop a daemonised instance with: pkill mediant
`;

function die(msg) {
  console.error(msg);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { target: null, port: 4242, daemon: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--help" || a === "-h") {
      console.log(HELP);
      process.exit(0);
    } else if (a === "--daemon") {
      args.daemon = true;
    } else if (a === "--port") {
      const v = Number(argv[++i]);
      if (!Number.isFinite(v) || v <= 0 || v > 65535) die("--port requires a valid port number");
      args.port = v;
    } else if (a.startsWith("-")) {
      die(`Unknown option: ${a}\n\n${HELP}`);
    } else if (args.target === null) {
      args.target = a;
    } else {
      die(`Unexpected argument: ${a}`);
    }
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

function resolveSourcePath(target) {
  const resolvedTarget = path.resolve(target ?? DEFAULT_SOURCE_FILE);
  if (fs.existsSync(resolvedTarget)) {
    const stat = fs.statSync(resolvedTarget);
    if (stat.isDirectory()) return path.join(resolvedTarget, DEFAULT_SOURCE_FILE);
    if (!stat.isFile()) die(`Not a regular file or directory: ${resolvedTarget}`);
    return resolvedTarget;
  }
  return resolvedTarget;
}

const sourcePath = resolveSourcePath(args.target);
if (!sourcePath.endsWith(".org")) die(`Source must be an .org file: ${sourcePath}`);

const sourceDir = path.dirname(sourcePath);
if (!fs.existsSync(sourceDir) || !fs.statSync(sourceDir).isDirectory()) {
  die(`Source directory not found: ${sourceDir}`);
}
if (!fs.existsSync(sourcePath)) {
  fs.writeFileSync(sourcePath, "", "utf-8");
} else if (!fs.statSync(sourcePath).isFile()) {
  die(`Not a regular file: ${sourcePath}`);
}

function probePort(port) {
  return new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", (e) => resolve(e.code === "EADDRINUSE" ? "in-use" : "error"));
    probe.once("listening", () => probe.close(() => resolve("free")));
    probe.listen(port, "127.0.0.1");
  });
}

// Daemon mode: re-exec ourselves detached with the flag stripped and exit.
if (args.daemon && !process.env.MEDIANT_CHILD) {
  const status = await probePort(args.port);
  if (status === "in-use") {
    die(`mediant: port ${args.port} is already in use — another daemon may already be running`);
  }
  const childArgs = process.argv.slice(1).filter((a) => a !== "--daemon");
  const child = spawn(process.execPath, childArgs, {
    detached: true,
    stdio: "ignore",
    env: { ...process.env, MEDIANT_CHILD: "1" },
  });
  child.unref();
  console.log(`mediant: started in background (pid ${child.pid})`);
  console.log(`mediant: http://localhost:${args.port}`);
  console.log(`mediant: stop with: pkill mediant`);
  process.exit(0);
}

process.title = "mediant";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const distDir = path.resolve(__dirname, "..", "dist");
if (!fs.existsSync(distDir) || !fs.existsSync(path.join(distDir, "index.html"))) {
  die(`No build found at ${distDir}\nRun: npm run build`);
}

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js":   "application/javascript; charset=utf-8",
  ".mjs":  "application/javascript; charset=utf-8",
  ".css":  "text/css; charset=utf-8",
  ".svg":  "image/svg+xml",
  ".png":  "image/png",
  ".jpg":  "image/jpeg",
  ".ico":  "image/x-icon",
  ".json": "application/json; charset=utf-8",
  ".woff2": "font/woff2",
};

const MAX_BODY_BYTES = 16 * 1024 * 1024;

const sseClients = new Set();
let changeSerial = 0;
let sourceVersion = "";

function readSource() {
  try {
    const content = fs.readFileSync(sourcePath, "utf-8");
    const version = String(fs.statSync(sourcePath).mtimeMs);
    sourceVersion = version;
    return { content, version };
  } catch (e) {
    if (e.code === "ENOENT") {
      sourceVersion = "";
      return { content: "", version: "" };
    }
    throw e;
  }
}

function combinedVersion() {
  return String(changeSerial);
}

function currentSourceVersion() {
  try {
    return String(fs.statSync(sourcePath).mtimeMs);
  } catch (e) {
    if (e.code === "ENOENT") return "";
    throw e;
  }
}

function syncSourceVersionFromDisk() {
  const next = currentSourceVersion();
  if (next === sourceVersion) return false;
  sourceVersion = next;
  return true;
}

function broadcastChange() {
  changeSerial += 1;
  broadcast(combinedVersion());
}

function broadcast(version) {
  for (const res of sseClients) {
    try { res.write(`data: ${version}\n\n`); } catch {}
  }
}

let watchTimer = null;
function startWatcher() {
  try {
    fs.watch(sourcePath, { recursive: false }, () => {
      if (watchTimer) clearTimeout(watchTimer);
      watchTimer = setTimeout(() => {
        try {
          if (syncSourceVersionFromDisk()) broadcastChange();
        } catch {}
      }, 100);
    });
  } catch (e) {
    console.warn(`mediant: file watch unavailable (${e.message}) — external edits won't push`);
  }
}

// Seed initial versions
readSource();
startWatcher();

function serveStatic(req, res) {
  let urlPath;
  try {
    urlPath = decodeURIComponent((req.url ?? "/").split("?")[0]);
  } catch {
    res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("Bad request");
    return;
  }
  if (urlPath === "/") urlPath = "/index.html";
  const resolved = path.resolve(distDir, "." + urlPath);
  if (!resolved.startsWith(distDir + path.sep) && resolved !== distDir) {
    res.writeHead(403); res.end(); return;
  }
  fs.readFile(resolved, (err, data) => {
    if (err) {
      res.writeHead(404, { "Content-Type": "text/plain" });
      res.end("Not found");
      return;
    }
    const ext = path.extname(resolved).toLowerCase();
    res.writeHead(200, {
      "Content-Type": MIME[ext] || "application/octet-stream",
      "Cache-Control": "no-cache",
    });
    res.end(data);
  });
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (c) => {
      total += c.length;
      if (total > MAX_BODY_BYTES) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(c);
    });
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

const server = http.createServer(async (req, res) => {
  const url = (req.url ?? "/").split("?")[0];

  if (url === "/api/source" && req.method === "GET") {
    try {
      const body = JSON.stringify(readSource());
      console.log(`mediant: read  ${new Date().toISOString()}  ${sourcePath}`);
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      res.end(body);
    } catch (e) {
      res.writeHead(500); res.end(`read failed: ${e.message}`);
    }
    return;
  }

  if (url === "/api/source" && req.method === "PUT") {
    try {
      const rawBody = await readBody(req);
      let payload;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        res.writeHead(400); res.end("invalid JSON");
        return;
      }
      const { content, version } = payload;
      if (typeof content !== "string" || typeof version !== "string") {
        res.writeHead(400); res.end("missing content or version");
        return;
      }

      // Check for conflicts. A missing file may only be created by a client
      // that observed it as missing (`version: ""`); stale clients must not
      // overwrite a newly-created file or resurrect a deleted one.
      const fileExists = fs.existsSync(sourcePath);
      if (fileExists) {
        const onDisk = String(fs.statSync(sourcePath).mtimeMs);
        if (version !== onDisk) {
          res.writeHead(409, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ version: onDisk }));
          return;
        }
      } else if (version !== "") {
        res.writeHead(409, { "Content-Type": "application/json" });
        res.end(JSON.stringify({ version: "" }));
        return;
      }

      fs.writeFileSync(sourcePath, content, "utf-8");
      const newVersion = String(fs.statSync(sourcePath).mtimeMs);
      sourceVersion = newVersion;
      const combined = combinedVersion();
      console.log(`mediant: write ${new Date().toISOString()}  ${sourcePath}  ${content.length} bytes`);
      res.writeHead(200, { "Content-Type": "application/json" });
      res.end(JSON.stringify({ version: newVersion, combined }));
    } catch (e) {
      res.writeHead(500); res.end(`write failed: ${e.message}`);
    }
    return;
  }

  if (url === "/api/events" && req.method === "GET") {
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no",
    });
    res.write(`data: ${combinedVersion()}\n\n`);
    sseClients.add(res);
    const ping = setInterval(() => {
      try { res.write(": ping\n\n"); } catch {}
    }, 30000);
    req.on("close", () => {
      clearInterval(ping);
      sseClients.delete(res);
    });
    return;
  }

  if (req.method === "GET") { serveStatic(req, res); return; }

  res.writeHead(405, { Allow: "GET, PUT" });
  res.end();
});

server.on("error", (e) => {
  if (e.code === "EADDRINUSE") die(`Port ${args.port} is in use`);
  die(`server error: ${e.message}`);
});

server.listen(args.port, "127.0.0.1", () => {
  if (!process.env.MEDIANT_CHILD) {
    console.log(`mediant: serving ${sourcePath}`);
    console.log(`mediant: http://localhost:${args.port}`);
  }
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
