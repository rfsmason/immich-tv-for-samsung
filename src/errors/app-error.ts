export type AppErrorKind =
  "invalid-config" | "network" | "timeout" | "api" | "auth" | "permission" | "invalid-response";

type AppErrorOptions = {
  cause?: unknown;
  // Household-facing name of the capability a permission error blocks, for
  // example "People" or "Memories". Never an endpoint or permission string.
  feature?: string;
  status?: number;
};

export class AppError extends Error {
  // Diagnostic detail only (the original exception or a technical note). It is
  // logged, never shown to the household.
  readonly cause?: unknown;
  readonly feature?: string;
  readonly kind: AppErrorKind;
  readonly status?: number;

  constructor(kind: AppErrorKind, message: string, options: AppErrorOptions = {}) {
    super(message);
    this.name = "AppError";
    this.kind = kind;
    this.status = options.status;
    this.feature = options.feature;

    if (options.cause !== undefined) {
      this.cause = options.cause;
    }
  }
}

export function isAppError(error: unknown): error is AppError {
  return error instanceof AppError;
}

export function toUserMessage(error: unknown): string {
  if (!isAppError(error)) {
    return "Something unexpected happened while checking Immich.";
  }

  if (error.kind === "invalid-config") {
    return error.message;
  }

  if (error.kind === "network") {
    return "Browser could not reach Immich. Check the URL, HTTPS certificate, and network access.";
  }

  if (error.kind === "timeout") {
    return "Immich is taking too long to respond. Check the server is running, then try again.";
  }

  if (error.kind === "auth") {
    return "Immich rejected the API key. Check that the key is active and copied correctly.";
  }

  if (error.kind === "permission") {
    const feature = error.feature || "this";

    return `This Immich API key is not allowed to show ${feature}. Ask whoever manages Immich to allow ${feature} for this key, then try again.`;
  }

  if (error.kind === "invalid-response") {
    if (error.message.startsWith("Immich response debug:")) {
      return error.message;
    }

    return "Immich responded, but the app could not understand the response.";
  }

  // A server-side failure keeps Immich's own wording (such as "Not found or
  // no asset.read access") for diagnostics only. App-written API messages
  // carry no HTTP status and are already household-facing.
  if (error.kind === "api" && error.status !== undefined) {
    return "Immich couldn't complete this request.";
  }

  return error.message;
}
