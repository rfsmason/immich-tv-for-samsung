import type { Page } from "playwright";

// Recording-only annotations. They never alter application elements, take
// focus or accept pointer input, and disappear before the next remote press.
export class TourGuide {
  constructor(private readonly page: Page) {}

  async highlight(
    selector: string,
    label: string,
    region: "element" | "::after" = "element"
  ): Promise<void> {
    await this.page.locator(selector).waitFor({ state: "visible" });
    await this.page.evaluate(
      ({ selector, label, region }) => {
        document.querySelector("[data-capture-annotation]")?.remove();
        const target = document.querySelector<HTMLElement>(selector);
        if (!target) throw new Error("Tour highlight target disappeared.");
        const box = target.getBoundingClientRect();
        let { left, top, width, height } = box;
        if (region === "::after") {
          const style = getComputedStyle(target, region);
          const insetLeft = Number.parseFloat(style.left);
          const insetRight = Number.parseFloat(style.right);
          const insetBottom = Number.parseFloat(style.bottom);
          height = Number.parseFloat(style.height);
          left += target.clientLeft + insetLeft;
          top += target.clientTop + target.clientHeight - insetBottom - height;
          width = target.clientWidth - insetLeft - insetRight;
        }
        if (![left, top, width, height].every(Number.isFinite) || width <= 0 || height <= 0) {
          throw new Error("Tour highlight target has no usable bounds.");
        }
        const annotation = document.createElement("div");
        annotation.setAttribute("data-capture-annotation", "");
        annotation.setAttribute("aria-hidden", "true");
        annotation.style.cssText = "position:fixed;inset:0;pointer-events:none;z-index:2147483647";
        const ring = document.createElement("div");
        Object.assign(ring.style, {
          position: "absolute",
          left: `${left - 8}px`,
          top: `${top - 8}px`,
          width: `${width + 16}px`,
          height: `${height + 16}px`,
          boxSizing: "border-box",
          border: "3px solid #ffd166",
          borderRadius: "8px",
          boxShadow: "0 0 0 3px rgba(0,0,0,0.55)"
        });
        const caption = document.createElement("div");
        caption.textContent = label;
        Object.assign(caption.style, {
          position: "absolute",
          left: `${Math.max(16, Math.min(left - 320, innerWidth - 340))}px`,
          top: `${Math.max(16, top - 64)}px`,
          padding: "12px 18px",
          borderRadius: "10px",
          background: "#101729",
          color: "#ffd166",
          border: "2px solid #ffd166",
          font: "600 22px sans-serif",
          maxWidth: "min(480px, calc(100vw - 32px))",
          boxSizing: "border-box",
          whiteSpace: "normal"
        });
        annotation.append(ring, caption);
        document.body.appendChild(annotation);
        const captionBox = caption.getBoundingClientRect();
        caption.style.left = `${Math.max(16, Math.min(left - captionBox.width - 24, innerWidth - captionBox.width - 16))}px`;
        caption.style.top = `${Math.max(16, top - captionBox.height - 20)}px`;
      },
      { selector, label, region }
    );
  }

  async clear(): Promise<void> {
    if (this.page.isClosed()) return;
    await this.page.evaluate(() => document.querySelector("[data-capture-annotation]")?.remove());
  }
}
