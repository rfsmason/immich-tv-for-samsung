import {
  createDropdownState,
  readDropdownKey,
  renderDropdownControl,
  renderDropdownList
} from "../dropdown";

// A Settings field using the app's drop-down (dropdown.ts), so it behaves
// exactly like Search's Asset type. Settings keeps its controls in the page
// rather than re-rendering them, so this owns its list's elements: the list
// is added under the field while open and removed when it closes. The value
// is kept in the control's `data-value`.

export type SettingsDropdownOption = { label: string; value: string };

export type SettingsDropdown = {
  close(): void;
  control: HTMLButtonElement;
  // A remote key while the list is open.
  handleKey(keyCode: number): void;
  isOpen(): boolean;
  // Opens the list on the current value and focuses it.
  open(): void;
  setValue(value: string): void;
  value(): string;
};

type SettingsDropdownOptions = {
  control: HTMLButtonElement;
  name: string;
  // Called after OK changes the value.
  onChange?(): void;
  options: SettingsDropdownOption[];
};

export function mountSettingsDropdown(settings: SettingsDropdownOptions): SettingsDropdown {
  const { control, name, options } = settings;
  const documentRef = control.ownerDocument;
  const dropdown = createDropdownState(options.length);
  let list: HTMLElement | null = null;

  const currentIndex = () =>
    Math.max(
      0,
      options.findIndex((option) => option.value === control.getAttribute("data-value"))
    );

  function renderControl(): void {
    renderDropdownControl(control, name, options[currentIndex()]!.label, dropdown.isOpen());
  }

  function focusOption(index: number): void {
    list?.querySelector<HTMLElement>(`[data-dropdown-index="${index}"]`)?.focus();
  }

  function removeList(): void {
    if (list && list.parentNode) {
      list.parentNode.removeChild(list);
    }

    list = null;
  }

  function close(chosen?: number): void {
    dropdown.close();
    removeList();

    if (chosen !== undefined && chosen !== currentIndex()) {
      control.setAttribute("data-value", options[chosen]!.value);
      renderControl();
      settings.onChange?.();
    } else {
      renderControl();
    }

    control.focus();
  }

  function open(): void {
    const index = dropdown.open(currentIndex());

    removeList();
    list = renderDropdownList(
      documentRef,
      name,
      options.map((option) => option.label),
      currentIndex(),
      (optionIndex) => {
        const option = documentRef.createElement("button");

        option.type = "button";
        option.className = "focusable";
        option.setAttribute("data-dropdown-index", String(optionIndex));
        return option;
      }
    );
    list.addEventListener("click", (event) => {
      const option = (event.target as HTMLElement).closest("[data-dropdown-index]");

      if (option) {
        close(Number(option.getAttribute("data-dropdown-index")));
      }
    });
    control.parentNode?.appendChild(list);
    renderControl();
    focusOption(index);
  }

  control.addEventListener("click", () => {
    if (!dropdown.isOpen()) {
      open();
    }
  });
  renderControl();

  return {
    close() {
      if (dropdown.isOpen()) {
        dropdown.close();
        removeList();
        renderControl();
      }
    },
    control,
    handleKey(keyCode) {
      const result = dropdown.handleKey(readDropdownKey(keyCode));

      if ("focus" in result) {
        focusOption(result.focus);
      } else {
        close(result.chosen);
      }
    },
    isOpen: dropdown.isOpen,
    open,
    setValue(value) {
      control.setAttribute("data-value", value);
      renderControl();
    },
    value: () => options[currentIndex()]!.value
  };
}
