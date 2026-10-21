import { getKeyCode, remoteKeys } from "../platform/tizen/keys";

// Samsung's TV guidance: Back on an application's home level shows an HTML
// exit confirmation, and the app terminates only when the user confirms.
// Back inside the popup closes it. Focus starts on "Keep browsing" so an
// accidental double press never exits.

type ExitConfirmationOptions = {
  documentRef?: Document;
  onExit(): void;
};

export type ExitConfirmationController = {
  close(): void;
  destroy(): void;
  isOpen(): boolean;
  open(): void;
};

export function mountExitConfirmation(
  options: ExitConfirmationOptions
): ExitConfirmationController {
  const documentRef = options.documentRef || document;
  const root = requireElement(documentRef, "exit-dialog");
  const stay = requireElement(documentRef, "exit-dialog-stay");
  const exit = requireElement(documentRef, "exit-dialog-exit");
  let returnFocus: HTMLElement | null = null;

  function close(): void {
    if (root.hidden) {
      return;
    }

    root.hidden = true;
    returnFocus?.focus();
    returnFocus = null;
  }

  function confirmExit(): void {
    options.onExit();
    // On the TV the app has terminated. In the desktop preview exit is a no-op,
    // so close the dialog and keep the app usable.
    close();
  }

  // Capture phase so no screen's document listener sees keys while the dialog
  // owns the remote.
  const handleKeydown = (event: KeyboardEvent) => {
    if (root.hidden) {
      return;
    }

    const keyCode = getKeyCode(event);

    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation();

    if (keyCode === remoteKeys.back) {
      close();
      return;
    }

    if (keyCode === remoteKeys.enter) {
      if (documentRef.activeElement === exit) {
        confirmExit();
      } else {
        close();
      }

      return;
    }

    if (keyCode === remoteKeys.left || keyCode === remoteKeys.up) {
      stay.focus();
    } else if (keyCode === remoteKeys.right || keyCode === remoteKeys.down) {
      exit.focus();
    }
  };
  const handleClick = (event: MouseEvent) => {
    if (event.target === exit || exit.contains(event.target as Node)) {
      confirmExit();
    } else if (event.target === stay || stay.contains(event.target as Node)) {
      close();
    }
  };

  documentRef.addEventListener("keydown", handleKeydown, true);
  root.addEventListener("click", handleClick);

  return {
    close,
    destroy() {
      documentRef.removeEventListener("keydown", handleKeydown, true);
      root.removeEventListener("click", handleClick);
    },
    isOpen() {
      return !root.hidden;
    },
    open() {
      if (!root.hidden) {
        return;
      }

      const active = documentRef.activeElement;

      returnFocus = active instanceof HTMLElement ? active : null;
      root.hidden = false;
      stay.focus();
    }
  };
}

function requireElement(documentRef: Document, id: string): HTMLElement {
  const element = documentRef.getElementById(id);

  if (!element) {
    throw new Error(`Missing required element: ${id}`);
  }

  return element;
}
