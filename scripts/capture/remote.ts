import type { Page, Request } from "playwright";

const timeout = 30_000;
// Longer than the app's 180-300ms CSS transitions. Used only after state,
// images and relevant requests are ready, never as a loading substitute.
const settleMs = 350;
const quietMs = 250;

// Serialized by Playwright and evaluated in the page, not in Node.
function renderedImagesReady(): boolean {
  const active = document.activeElement;
  if (!active || active === document.body || !active.getClientRects().length) return false;
  return Array.from(document.images).every((image) => {
    const rect = image.getBoundingClientRect();
    const visible =
      image.getClientRects().length > 0 &&
      rect.bottom > 0 &&
      rect.right > 0 &&
      rect.top < innerHeight &&
      rect.left < innerWidth &&
      getComputedStyle(image).visibility !== "hidden";
    return !visible || !image.hasAttribute("src") || (image.complete && image.naturalWidth > 0);
  });
}

type RemoteOptions = {
  actionDelayMs?: number;
  beforePress?(): Promise<void>;
};

export class Remote {
  step = "initial screen readiness";
  private pending = new Set<Request>();
  private lastActivity = Date.now();
  private onRequest = (request: Request) => {
    if (new URL(request.url()).pathname === "/__immich-proxy") {
      this.pending.add(request);
      this.lastActivity = Date.now();
    }
  };
  private onFinished = (request: Request) => {
    if (this.pending.delete(request)) this.lastActivity = Date.now();
  };

  constructor(
    readonly page: Page,
    private readonly options: RemoteOptions = {}
  ) {
    page.on("request", this.onRequest);
    page.on("requestfinished", this.onFinished);
    page.on("requestfailed", this.onFinished);
    page.setDefaultTimeout(timeout);
  }

  dispose(): void {
    this.page.off("request", this.onRequest);
    this.page.off("requestfinished", this.onFinished);
    this.page.off("requestfailed", this.onFinished);
  }

  async attached(selector: string): Promise<void> {
    this.step = `attached ${selector}`;
    await this.page.locator(selector).first().waitFor({ state: "attached", timeout: 15_000 });
  }

  async visible(selector: string): Promise<void> {
    this.step = `visible ${selector}`;
    await this.page.locator(selector).first().waitFor({ state: "visible" });
  }

  async focus(selector: string): Promise<void> {
    await this.page.waitForFunction(
      (expected) => document.activeElement?.matches(expected),
      selector,
      { timeout }
    );
  }

  async ready(): Promise<void> {
    const deadline = Date.now() + timeout;
    do {
      await this.page.waitForFunction(renderedImagesReady, undefined, { timeout });
      await this.waitForRequests(deadline);
      await new Promise((resolve) => setTimeout(resolve, settleMs));
      // Rendering may queue another thumbnail batch. Recheck after transitions.
      if (this.pending.size === 0 && Date.now() - this.lastActivity >= quietMs) {
        await this.page.waitForFunction(renderedImagesReady, undefined, { timeout });
        if (this.pending.size > 0 || Date.now() - this.lastActivity < quietMs) continue;
        await this.page.waitForFunction(
          () =>
            document
              .getAnimations()
              .every(
                (animation) =>
                  !(animation instanceof CSSTransition) || animation.playState !== "running"
              ),
          undefined,
          { timeout }
        );
        const hasError = await this.page.locator('[data-state="error"]:visible').count();
        if (hasError > 0)
          throw new Error("The demo app reported a visible error; capture stopped.");
        return;
      }
    } while (Date.now() < deadline);
    throw new Error("Timed out waiting for demo thumbnails and requests.");
  }

  private async waitForRequests(deadline: number): Promise<void> {
    while (this.pending.size > 0 || Date.now() - this.lastActivity < quietMs) {
      if (Date.now() >= deadline) throw new Error("Demo requests did not settle.");
      await new Promise((resolve) => setTimeout(resolve, 50));
    }
  }

  // Editorial viewing time, after observable readiness. Stills use zero.
  async hold(): Promise<void> {
    if (this.options.actionDelayMs) {
      await new Promise((resolve) => setTimeout(resolve, this.options.actionDelayMs));
    }
  }

  private async press(key: string, expectedFocus: string, pauseAfter = true): Promise<void> {
    this.step = `${key} → focus ${expectedFocus}`;
    await this.options.beforePress?.();
    await this.page.keyboard.press(key);
    await this.focus(expectedFocus);
    await this.ready();
    await this.focus(expectedFocus);
    if (pauseAfter) await this.hold();
  }

  up = (expected: string): Promise<void> => this.press("ArrowUp", expected);
  down = (expected: string): Promise<void> => this.press("ArrowDown", expected);
  left = (expected: string): Promise<void> => this.press("ArrowLeft", expected);
  right = (expected: string): Promise<void> => this.press("ArrowRight", expected);
  ok = (expected: string, options: { pauseAfter?: boolean } = {}): Promise<void> =>
    this.press("Enter", expected, options.pauseAfter);
  back = (expected: string): Promise<void> => this.press("Backspace", expected);
}
