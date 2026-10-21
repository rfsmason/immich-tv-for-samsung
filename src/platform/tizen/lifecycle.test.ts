import { describe, expect, it, vi } from "vitest";
import { createAppLifecycle } from "./lifecycle";

function createDocument(hidden = false) {
  const target = new EventTarget() as EventTarget & { hidden: boolean };

  target.hidden = hidden;

  return target;
}

const logger = { error: vi.fn(), info: vi.fn(), warn: vi.fn() };

describe("Tizen application lifecycle", () => {
  it("reports hidden and visible from document visibilitychange", () => {
    const documentRef = createDocument();
    const lifecycle = createAppLifecycle({
      documentRef: documentRef as unknown as Document,
      logger,
      windowRef: {} as Window
    });
    const listener = vi.fn();
    const unsubscribe = lifecycle.onVisibilityChange(listener);

    documentRef.hidden = true;
    documentRef.dispatchEvent(new Event("visibilitychange"));
    documentRef.hidden = false;
    documentRef.dispatchEvent(new Event("visibilitychange"));

    expect(listener.mock.calls).toEqual([["hidden"], ["visible"]]);

    unsubscribe();
    documentRef.dispatchEvent(new Event("visibilitychange"));
    expect(listener).toHaveBeenCalledTimes(2);
    lifecycle.destroy();
  });

  it("stops listening after destroy", () => {
    const documentRef = createDocument();
    const lifecycle = createAppLifecycle({
      documentRef: documentRef as unknown as Document,
      logger,
      windowRef: {} as Window
    });
    const listener = vi.fn();

    lifecycle.onVisibilityChange(listener);
    lifecycle.destroy();
    documentRef.dispatchEvent(new Event("visibilitychange"));

    expect(listener).not.toHaveBeenCalled();
  });

  it("exits through the Tizen Application API on the TV", () => {
    const exit = vi.fn();
    const windowRef = {
      tizen: { application: { getCurrentApplication: () => ({ exit }) } }
    } as unknown as Window;
    const lifecycle = createAppLifecycle({
      documentRef: createDocument() as unknown as Document,
      logger,
      windowRef
    });

    lifecycle.exit();

    expect(exit).toHaveBeenCalledTimes(1);
  });

  it("is harmless in the desktop preview and logs a failed exit", () => {
    const desktop = createAppLifecycle({
      documentRef: createDocument() as unknown as Document,
      logger,
      windowRef: {} as Window
    });

    expect(() => desktop.exit()).not.toThrow();

    const failure = new Error("UnknownError");
    const windowRef = {
      tizen: {
        application: {
          getCurrentApplication: () => ({
            exit: () => {
              throw failure;
            }
          })
        }
      }
    } as unknown as Window;
    const failing = createAppLifecycle({
      documentRef: createDocument() as unknown as Document,
      logger,
      windowRef
    });

    expect(() => failing.exit()).not.toThrow();
    expect(logger.error).toHaveBeenCalledWith("Tizen application exit failed.", { error: failure });
  });
});
