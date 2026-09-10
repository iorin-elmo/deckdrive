#!/usr/bin/env node
// Local dev bootstrap for F02: env file + Docker Compose (postgres, mailpit).
// Later phases extend this script (migration, seed, dev user, card/mission/
// cosmetic data) once those owning tasks (D00, E02, M00, ...) exist.
import { spawnSync } from "node:child_process";
import { existsSync, copyFileSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..", "..");
const envPath = resolve(repoRoot, ".env");
const envExamplePath = resolve(repoRoot, ".env.example");

const WAIT_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 2_000;
const HTTP_PROBE_TIMEOUT_MS = 2_000;

function log(message) {
  console.log(`[setup] ${message}`);
}

function fail(message) {
  console.error(`[setup] ERROR: ${message}`);
  process.exit(1);
}

function ensureEnvFile() {
  if (existsSync(envPath)) {
    log(".env already exists, leaving it untouched.");
    return;
  }
  if (!existsSync(envExamplePath)) {
    fail(".env.example is missing; cannot generate .env.");
  }
  copyFileSync(envExamplePath, envPath);
  log("generated .env from .env.example.");
}

function loadEnvFile() {
  const env = {};
  const contents = readFileSync(envPath, "utf8");
  for (const line of contents.split(/\r?\n/)) {
    let trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("export ")) {
      trimmed = trimmed.slice("export ".length).trim();
    }
    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    const quote = value[0];
    if ((quote === '"' || quote === "'") && value.endsWith(quote) && value.length >= 2) {
      value = value.slice(1, -1);
    } else {
      // strip an unquoted trailing "# ..." inline comment
      const commentIndex = value.indexOf(" #");
      if (commentIndex !== -1) {
        value = value.slice(0, commentIndex).trim();
      }
    }
    env[key] = value;
  }
  // process env takes precedence, matching docker compose's own variable resolution
  return { ...env, ...process.env };
}

function runDockerCompose(args) {
  const result = spawnSync("docker", ["compose", ...args], {
    cwd: repoRoot,
    stdio: "inherit",
  });
  if (result.error && result.error.code === "ENOENT") {
    fail(
      "Docker is not installed or not on PATH. Install Docker (Docker Desktop " +
        "on Windows/macOS, or Docker Engine on Linux/WSL2) and retry.",
    );
  }
  return result.status ?? 1;
}

async function waitForPostgres(env) {
  const user = env.POSTGRES_USER ?? "deckdrive";
  const db = env.POSTGRES_DB ?? "deckdrive";
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const result = spawnSync(
      "docker",
      ["compose", "exec", "-T", "postgres", "pg_isready", "-U", user, "-d", db],
      { cwd: repoRoot, stdio: "ignore" },
    );
    if (result.status === 0) {
      log("postgres is ready.");
      return true;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return false;
}

async function waitForMailpit(env) {
  const port = env.MAILPIT_UI_PORT ?? "8025";
  const deadline = Date.now() + WAIT_TIMEOUT_MS;
  while (Date.now() < deadline) {
    const live = await checkHttpOk(`http://127.0.0.1:${port}/livez`);
    const ready = await checkHttpOk(`http://127.0.0.1:${port}/readyz`);
    if (live && ready) {
      log("mailpit is ready.");
      return true;
    }
    await sleep(POLL_INTERVAL_MS);
  }
  return false;
}

async function checkHttpOk(url) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), HTTP_PROBE_TIMEOUT_MS);
  try {
    const response = await fetch(url, { method: "GET", signal: controller.signal });
    return response.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  ensureEnvFile();
  const env = loadEnvFile();

  log("starting postgres and mailpit via docker compose...");
  const upStatus = runDockerCompose(["up", "-d", "postgres", "mailpit"]);
  if (upStatus !== 0) {
    fail("docker compose up failed. See output above.");
  }

  const [postgresReady, mailpitReady] = await Promise.all([
    waitForPostgres(env),
    waitForMailpit(env),
  ]);

  if (!postgresReady) {
    fail(
      "postgres did not become ready within the timeout. Check `docker compose logs postgres`.",
    );
  }
  if (!mailpitReady) {
    fail(
      "mailpit did not become ready within the timeout. Check `docker compose logs mailpit`.",
    );
  }

  log("postgres and mailpit are up and healthy.");
  log(
    "the remaining pnpm setup steps (DB migration, DB seed, dev user, card/mission/cosmetic " +
      "data) are not implemented yet; they are introduced by D00, E02, M00, and related tasks.",
  );
  log(
    "api / web / admin containers are not defined yet; they are added by each app's owning phase.",
  );
}

main().catch((error) => {
  fail(error instanceof Error ? error.message : String(error));
});
