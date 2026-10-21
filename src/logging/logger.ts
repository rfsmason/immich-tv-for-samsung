export type Logger = {
  error(message: string, details?: unknown): void;
  info(message: string, details?: unknown): void;
  warn(message: string, details?: unknown): void;
};

const redactKey = /api[-_\s]?key|x-api-key|authorization|token|secret|password/i;
// Credentials can also appear inside strings, for example a playback URL that
// carries `apiKey=` because <video> cannot send the x-api-key header.
const redactQueryValue = /((?:api[-_]?key|token|secret|password)=)[^&\s"']+/gi;
const maxDepth = 6;
const maxStackLines = 12;
const maxCauseDepth = 4;

type SerializedError = {
  cause?: unknown;
  feature?: unknown;
  kind?: unknown;
  message: string;
  name: string;
  stack?: string;
  status?: unknown;
};

function redactString(value: string): string {
  return value.replace(redactQueryValue, "$1[redacted]");
}

// Error's name, message and stack are not enumerable, so iterating keys would
// log `{}`. Serialise them explicitly, with a bounded stack and cause chain.
function serializeError(error: Error, causeDepth: number, depth: number): SerializedError {
  const output: SerializedError = {
    message: redactString(error.message),
    name: error.name
  };
  const extra = error as Error & {
    cause?: unknown;
    feature?: unknown;
    kind?: unknown;
    status?: unknown;
  };

  if (typeof error.stack === "string") {
    output.stack = redactString(error.stack.split("\n").slice(0, maxStackLines).join("\n"));
  }

  if (extra.kind !== undefined) output.kind = extra.kind;
  if (extra.status !== undefined) output.status = extra.status;
  if (extra.feature !== undefined) output.feature = extra.feature;

  if (extra.cause !== undefined) {
    output.cause =
      causeDepth >= maxCauseDepth
        ? "[cause chain truncated]"
        : extra.cause instanceof Error
          ? serializeError(extra.cause, causeDepth + 1, depth + 1)
          : sanitize(extra.cause, depth + 1);
  }

  return output;
}

export function sanitize(details: unknown, depth = 0): unknown {
  if (typeof details === "string") {
    return redactString(details);
  }

  if (!details || typeof details !== "object") {
    return details;
  }

  if (depth >= maxDepth) {
    return "[truncated]";
  }

  if (details instanceof Error) {
    return serializeError(details, 0, depth);
  }

  if (Array.isArray(details)) {
    return details.map((item) => sanitize(item, depth + 1));
  }

  const output: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(details)) {
    output[key] = redactKey.test(key) ? "[redacted]" : sanitize(value, depth + 1);
  }

  return output;
}

export const consoleLogger: Logger = {
  error(message, details) {
    console.error(message, sanitize(details));
  },
  info(message, details) {
    console.info(message, sanitize(details));
  },
  warn(message, details) {
    console.warn(message, sanitize(details));
  }
};

export const silentLogger: Logger = {
  error() {},
  info() {},
  warn() {}
};
