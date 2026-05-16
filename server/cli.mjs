#!/usr/bin/env node
// Mediant local server. Serves the built UI and one or more Org files
// over localhost with read/write + change notifications.
//
// Single-file mode:  mediant ~/org/todo.org
// Directory mode:    mediant ~/org/
//   Reads all *.org files in the directory; new entries are written to
//   inbox.org within that directory.

import http from "node:http";
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawn } from "node:child_process";

const HELP = `Usage: mediant <file.org | directory> [options]

Serve the Mediant agenda UI against a local Org file or directory.

  Single-file mode:  mediant ~/org/todo.org
  Directory mode:    mediant ~/org/
    All *.org files in the directory are shown in the agenda.
    New entries are captured to inbox.org within that directory.

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
  if (!args.target) {
    console.error(HELP);
    process.exit(1);
  }
  return args;
}

const args = parseArgs(process.argv.slice(2));

const targetPath = path.resolve(args.target);
if (!fs.existsSync(targetPath)) die(`Not found: ${targetPath}`);

const stat = fs.statSync(targetPath);
const isDir = stat.isDirectory();

// In single-file mode the "directory" is the parent folder and the single
// file acts as both the only source and the inbox.
let dirPath, inboxRelPath;
if (isDir) {
  dirPath = targetPath;
  inboxRelPath = "inbox.org";
} else {
  if (!stat.isFile()) die(`Not a regular file or directory: ${targetPath}`);
  dirPath = path.dirname(targetPath);
  inboxRelPath = path.basename(targetPath);
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

/** Map of relPath → mtime string */
const fileVersions = new Map();
const sseClients = new Set();
let changeSerial = 0;

function orgFilesInDir() {
  if (!isDir) return [inboxRelPath];
  try {
    return fs.readdirSync(dirPath)
      .filter(f => f.endsWith(".org"))
      .sort();
  } catch {
    return [];
  }
}

function resolveRelPath(relPath) {
  const abs = path.resolve(dirPath, relPath);
  // Guard against path traversal
  if (!abs.startsWith(dirPath + path.sep) && abs !== dirPath) return null;
  if (!abs.endsWith(".org")) return null;
  return abs;
}

function readAllFiles() {
  const result = {};
  const seen = new Set();
  for (const rel of orgFilesInDir()) {
    const abs = path.join(dirPath, rel);
    try {
      const content = fs.readFileSync(abs, "utf-8");
      const version = String(fs.statSync(abs).mtimeMs);
      seen.add(rel);
      fileVersions.set(rel, version);
      result[rel] = { content, version };
    } catch {
      // Skip unreadable files
    }
  }
  for (const rel of [...fileVersions.keys()]) {
    if (!seen.has(rel)) fileVersions.delete(rel);
  }
  return result;
}

function combinedVersion() {
  return String(changeSerial);
}

function currentOrgFileVersions() {
  const next = new Map();
  for (const rel of orgFilesInDir()) {
    const abs = path.join(dirPath, rel);
    try {
      next.set(rel, String(fs.statSync(abs).mtimeMs));
    } catch {
      // Skip files that disappeared between readdir and stat.
    }
  }
  return next;
}

function versionsDiffer(next) {
  if (next.size !== fileVersions.size) return true;
  for (const [rel, version] of next) {
    if (fileVersions.get(rel) !== version) return true;
  }
  return false;
}

function replaceFileVersions(next) {
  fileVersions.clear();
  for (const [rel, version] of next) fileVersions.set(rel, version);
}

function syncFileVersionsFromDisk() {
  const next = currentOrgFileVersions();
  if (!versionsDiffer(next)) return false;
  replaceFileVersions(next);
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
  const watchTarget = isDir ? dirPath : path.join(dirPath, inboxRelPath);
  try {
    fs.watch(watchTarget, { recursive: false }, () => {
      if (watchTimer) clearTimeout(watchTimer);
      watchTimer = setTimeout(() => {
        try {
          if (syncFileVersionsFromDisk()) broadcastChange();
        } catch {}
      }, 100);
    });
  } catch (e) {
    console.warn(`mediant: file watch unavailable (${e.message}) — external edits won't push`);
  }
}

// Seed initial versions
readAllFiles();
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
      const files = readAllFiles();
      const body = JSON.stringify({ files, inbox: inboxRelPath });
      console.log(`mediant: read  ${new Date().toISOString()}  ${Object.keys(files).length} file(s)`);
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
      const { path: relPath, content, version } = payload;
      if (typeof relPath !== "string" || typeof content !== "string" || typeof version !== "string") {
        res.writeHead(400); res.end("missing path, content, or version");
        return;
      }
      const absPath = resolveRelPath(relPath);
      if (!absPath) {
        res.writeHead(400); res.end("invalid path");
        return;
      }

      // Check for conflicts. A missing file may only be created by a client
      // that observed it as missing (`version: ""`); stale clients must not
      // overwrite a newly-created file or resurrect a deleted one.
      const fileExists = fs.existsSync(absPath);
      if (fileExists) {
        const onDisk = String(fs.statSync(absPath).mtimeMs);
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

      fs.writeFileSync(absPath, content, "utf-8");
      const newVersion = String(fs.statSync(absPath).mtimeMs);
      fileVersions.set(relPath, newVersion);
      const combined = combinedVersion();
      console.log(`mediant: write ${new Date().toISOString()}  ${relPath}  ${content.length} bytes`);
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
    if (isDir) {
      console.log(`mediant: serving directory ${dirPath}`);
      console.log(`mediant: inbox → ${inboxRelPath}`);
    } else {
      console.log(`mediant: serving ${path.join(dirPath, inboxRelPath)}`);
    }
    console.log(`mediant: http://localhost:${args.port}`);
  }
});

function shutdown() {
  server.close(() => process.exit(0));
  setTimeout(() => process.exit(0), 500).unref();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
