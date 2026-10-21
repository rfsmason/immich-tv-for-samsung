import { spawn } from "node:child_process";
import { resolve } from "node:path";

const root = process.cwd();
const startPort = Number(process.env.PORT || 5173);
const portSpan = Number(process.env.PREVIEW_PORT_SPAN || 20);
const extraPorts = readPortList(process.env.PREVIEW_KILL_PORTS || "");
const ports = Array.from(
  new Set([...Array.from({ length: portSpan }, (_, index) => startPort + index), ...extraPorts])
);

async function main() {
  await stopPreviewProcesses();
  await stopPortListeners(ports);
  await run("npm", ["run", "build"]);

  const server = spawn("node", ["scripts/serve-preview.mjs", "--root", "dist"], {
    cwd: root,
    env: process.env,
    stdio: "inherit"
  });

  process.on("SIGINT", () => {
    server.kill("SIGINT");
  });
  process.on("SIGTERM", () => {
    server.kill("SIGTERM");
  });

  server.on("exit", (code, signal) => {
    if (signal) {
      process.kill(process.pid, signal);
      return;
    }

    process.exit(code || 0);
  });
}

async function stopPreviewProcesses() {
  const patterns = [
    `${resolve(root, "scripts", "serve-preview.mjs")}`,
    "scripts/serve-preview.mjs --root dist"
  ];

  for (const pattern of patterns) {
    await runQuiet("pkill", ["-f", pattern]);
  }
}

async function stopPortListeners(targetPorts) {
  for (const port of targetPorts) {
    const output = await readCommand("lsof", ["-tiTCP:" + port, "-sTCP:LISTEN"]);
    const pids = output
      .split(/\s+/)
      .map((value) => Number(value))
      .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);

    for (const pid of pids) {
      await killProcess(pid);
    }
  }
}

async function killProcess(pid) {
  try {
    process.kill(pid, "SIGTERM");
  } catch {
    return;
  }

  await delay(250);

  try {
    process.kill(pid, 0);
  } catch {
    return;
  }

  try {
    process.kill(pid, "SIGKILL");
  } catch {
    // The process may already have exited between checks.
  }
}

function run(command, args) {
  return new Promise((resolvePromise, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      env: process.env,
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      reject(new Error(`${command} ${args.join(" ")} exited with ${code}`));
    });
  });
}

function runQuiet(command, args) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd: root,
      env: process.env,
      stdio: "ignore"
    });

    child.on("error", () => resolvePromise());
    child.on("exit", () => resolvePromise());
  });
}

function readCommand(command, args) {
  return new Promise((resolvePromise) => {
    const child = spawn(command, args, {
      cwd: root,
      env: process.env,
      stdio: ["ignore", "pipe", "ignore"]
    });
    const chunks = [];

    child.stdout.on("data", (chunk) => {
      chunks.push(chunk);
    });
    child.on("error", () => resolvePromise(""));
    child.on("exit", () => resolvePromise(Buffer.concat(chunks).toString("utf8")));
  });
}

function readPortList(value) {
  return value
    .split(",")
    .map((port) => Number(port.trim()))
    .filter((port) => Number.isInteger(port) && port > 0);
}

function delay(ms) {
  return new Promise((resolvePromise) => {
    setTimeout(resolvePromise, ms);
  });
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
