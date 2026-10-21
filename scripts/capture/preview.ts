import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";

export async function stopChild(child: ChildProcess): Promise<void> {
  if (child.exitCode !== null || child.signalCode !== null) return;
  const closed = once(child, "close");
  child.kill("SIGTERM");
  const timer = setTimeout(() => child.kill("SIGKILL"), 3000);
  try {
    await closed;
  } finally {
    clearTimeout(timer);
  }
}

export async function buildApp(signal: AbortSignal): Promise<void> {
  const child = spawn(process.execPath, ["scripts/build-app.mjs"], { stdio: "inherit" });
  const abort = () => {
    child.kill("SIGTERM");
  };
  signal.addEventListener("abort", abort, { once: true });
  try {
    const [code] = await once(child, "close");
    if (code !== 0 || signal.aborted) throw new Error("Capture build interrupted or failed.");
  } finally {
    signal.removeEventListener("abort", abort);
    await stopChild(child);
  }
}

export async function startPreview(
  port: number,
  signal: AbortSignal
): Promise<{
  origin: string;
  stop(): Promise<void>;
}> {
  signal.throwIfAborted();
  const child = spawn(process.execPath, ["scripts/serve-preview.mjs", "--root", "dist"], {
    env: { ...process.env, PORT: String(port), PREVIEW_STRICT_PORT: "1" },
    stdio: ["ignore", "ignore", "ignore", "ipc"]
  });
  const abort = () => {
    child.kill("SIGTERM");
  };
  signal.addEventListener("abort", abort, { once: true });
  const stop = async () => {
    signal.removeEventListener("abort", abort);
    await stopChild(child);
  };
  try {
    await new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => {
        cleanup();
        reject(new Error("Preview startup timed out."));
      }, 15_000);
      const cleanup = () => {
        clearTimeout(timer);
        child.off("message", ready);
        child.off("error", failed);
        child.off("exit", failed);
      };
      const ready = (message: unknown) => {
        if (typeof message === "object" && message !== null && "ready" in message) {
          cleanup();
          resolve();
        }
      };
      const failed = () => {
        cleanup();
        reject(new Error("Preview could not start. Check the fixed port."));
      };
      child.on("message", ready);
      child.on("error", failed);
      child.on("exit", failed);
    });
    const origin = `http://127.0.0.1:${port}`;
    const response = await fetch(origin, {
      signal: AbortSignal.any([signal, AbortSignal.timeout(5000)])
    });
    if (!response.ok) throw new Error("Preview did not respond successfully.");
    return { origin, stop };
  } catch (error) {
    await stop();
    throw error;
  }
}
