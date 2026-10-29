// Minimal document surface: real EventTarget dispatch preserves listener ordering
// and stopImmediatePropagation semantics without a browser dependency.
export class TestDocument extends EventTarget {
  activeElement: TestElement | null = null;
  elements = new Map<string, TestElement>();

  getElementById(id: string): TestElement {
    let element = this.elements.get(id);
    if (!element) {
      element = new TestElement(this);
      this.elements.set(id, element);
    }
    return element;
  }

  createElement(tagName = "div"): TestElement {
    return new TestElement(this, tagName);
  }

  createElementNS(_namespace: string, tagName: string): TestElement {
    return new TestElement(this, tagName);
  }
}

export class TestElement extends EventTarget {
  hidden = false;
  className = "";
  src = "";
  title = "";
  clientWidth = 0;
  // Custom properties are kept, so tests can read what the app set.
  style = {
    opacity: "",
    properties: {} as Record<string, string>,
    width: "",
    getPropertyValue(name: string): string {
      return this.properties[name] ?? "";
    },
    removeProperty(name: string): void {
      delete this.properties[name];
    },
    setProperty(name: string, value: string): void {
      this.properties[name] = value;
    }
  };
  pause(): void {}
  load(): void {}
  removeAttribute(name: string): void {
    this.attributes.delete(name);
  }
  scrollTop = 0;
  scrollLeft = 0;
  children: TestElement[] = [];
  attributes = new Map<string, string>();
  private text = "";

  constructor(
    readonly ownerDocument: TestDocument,
    readonly tagName = "div"
  ) {
    super();
  }

  set textContent(value: string) {
    this.text = value;
    this.children = [];
  }

  get textContent(): string {
    return this.text;
  }
  get firstChild(): TestElement | null {
    return this.children[0] || null;
  }
  appendChild(child: TestElement): void {
    this.children.push(child);
  }
  setAttribute(name: string, value: string): void {
    this.attributes.set(name, value);
  }
  getAttribute(name: string): string | null {
    return this.attributes.get(name) ?? null;
  }
  focus(): void {
    this.ownerDocument.activeElement = this;
  }
  closest(): TestElement {
    return this;
  }
  getBoundingClientRect(): { top: number; bottom: number; left: number; right: number } {
    return { top: 20, bottom: 500, left: 20, right: 1200 };
  }
  contains(target: TestElement): boolean {
    return target === this || this.children.some((child) => child.contains(target));
  }
  querySelector(selector: string): TestElement | null {
    return this.querySelectorAll(selector)[0] || null;
  }
  querySelectorAll(selector: string): TestElement[] {
    const match = /\[([a-z-]+)="([^"]+)"\]/.exec(selector);
    const results: TestElement[] = [];
    for (const child of this.children) {
      const matches = match
        ? child.getAttribute(match[1]!) === match[2]
        : selector.startsWith(".")
          ? child.className.split(" ").includes(selector.slice(1))
          : child.tagName === selector;
      if (matches) results.push(child);
      results.push(...child.querySelectorAll(selector));
    }
    return results;
  }
  replaceChild(child: TestElement, previous: TestElement): void {
    this.children[this.children.indexOf(previous)] = child;
  }
  insertBefore(child: TestElement): void {
    this.children.unshift(child);
  }
}
