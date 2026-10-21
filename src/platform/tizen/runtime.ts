// The subset of Samsung's Tizen Web Device APIs this app uses. Everything is
// optional because the desktop preview has no `window.tizen`.

export type TizenInputDeviceKey = {
  code: number;
  name: string;
};

export type TizenTvInputDevice = {
  getSupportedKeys?(): TizenInputDeviceKey[];
  registerKey(name: string): void;
  registerKeyBatch?(names: string[]): void;
};

// Application API (since Tizen 2.0, no privilege required):
// tizen.application.getCurrentApplication().exit()
export type TizenApplicationManager = {
  getCurrentApplication(): {
    exit(): void;
  };
};

export type TizenRuntime = {
  application?: TizenApplicationManager;
  tvinputdevice?: TizenTvInputDevice;
};

declare global {
  interface Window {
    tizen?: TizenRuntime;
  }
}
