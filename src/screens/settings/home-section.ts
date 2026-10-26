import { homeRailOrder, homeRailTitles, type HomeRailId } from "../../domain/home";
import { requireElement, type SettingsSection } from "./settings-section";

// Settings > Home: an On/Off choice for each Home rail, in Home's order.
// Changes apply the next time Home is shown.

const railHints: Partial<Record<HomeRailId, string>> = {
  "recently-viewed": "Viewing history is still kept while the rail is hidden."
};

export function createHomeSection(documentRef: Document): SettingsSection {
  const panel = requireElement(documentRef, "settings-panel-home");
  const inputs = homeRailOrder.map((railId) => {
    const input = createRailChoice(documentRef, panel, railId);

    return { input, railId };
  });

  function readVisibility(): Record<HomeRailId, boolean> {
    const visibility = {} as Record<HomeRailId, boolean>;

    inputs.forEach(({ input, railId }) => {
      visibility[railId] = input.checked;
    });

    return visibility;
  }

  return {
    button: requireElement<HTMLButtonElement>(documentRef, "settings-section-home"),
    id: "home",
    panel,
    firstControl: () => inputs[0]!.input,
    readAppSettings: () => ({ homeRails: readVisibility() }),
    showAppSettings(settings) {
      inputs.forEach(({ input, railId }) => {
        input.checked = settings.homeRails[railId];
      });
    },
    snapshot: readVisibility
  };
}

function createRailChoice(
  documentRef: Document,
  panel: HTMLElement,
  railId: HomeRailId
): HTMLInputElement {
  const label = documentRef.createElement("label");
  const input = documentRef.createElement("input");
  const text = documentRef.createElement("span");
  const title = documentRef.createElement("span");
  const hint = railHints[railId];

  label.className = "field choice-field";
  input.id = `home-rail-${railId}`;
  input.className = "focusable";
  input.type = "checkbox";
  input.name = `homeRail-${railId}`;
  title.className = "field-label";
  title.textContent = `Show ${homeRailTitles[railId]}`;
  text.appendChild(title);

  if (hint) {
    const hintElement = documentRef.createElement("span");

    hintElement.className = "field-hint";
    hintElement.textContent = hint;
    text.appendChild(hintElement);
  }

  label.appendChild(input);
  label.appendChild(text);
  panel.appendChild(label);

  return input;
}
