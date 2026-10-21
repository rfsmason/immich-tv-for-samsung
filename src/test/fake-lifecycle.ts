import type { AppLifecycle, AppVisibility } from "../platform/tizen/lifecycle";

export type FakeLifecycle = AppLifecycle & {
  exitCount: number;
  setVisibility(visibility: AppVisibility): void;
};

export function createFakeLifecycle(): FakeLifecycle {
  const listeners: Array<(visibility: AppVisibility) => void> = [];
  const fake: FakeLifecycle = {
    exitCount: 0,
    destroy() {
      listeners.length = 0;
    },
    exit() {
      fake.exitCount += 1;
    },
    onVisibilityChange(listener) {
      listeners.push(listener);

      return () => {
        listeners.splice(listeners.indexOf(listener), 1);
      };
    },
    setVisibility(visibility) {
      listeners.slice().forEach((listener) => listener(visibility));
    }
  };

  return fake;
}
