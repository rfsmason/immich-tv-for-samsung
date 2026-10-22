import type { Person } from "../../domain/home";
import { formatPersonName } from "../../presentation/person-labels";

// A person as a remote-focusable card: a circular face above the name. The
// People browser uses it now; a Search people picker (Milestone 13) can reuse
// it with its own selection state.

// The card's spoken label before any screen adds its own state to it.
export function personCardLabel(person: Person): string {
  const name = formatPersonName(person);

  return person.isFavorite ? `${name}, favourite` : name;
}

export function createPersonCard(
  documentRef: Document,
  person: Person,
  index: number
): HTMLButtonElement {
  const card = documentRef.createElement("button");
  const name = formatPersonName(person);

  card.className = "focusable person-card";
  card.type = "button";
  card.setAttribute("data-person-index", String(index));
  card.setAttribute("data-person-id", person.id);
  card.setAttribute("aria-label", personCardLabel(person));

  const face = documentRef.createElement("span");
  face.className = "person-face";
  face.setAttribute("aria-hidden", "true");

  const initial = documentRef.createElement("span");
  initial.className = "person-face-initial";
  initial.textContent = person.name ? person.name.charAt(0).toUpperCase() : "?";
  face.appendChild(initial);
  card.appendChild(face);

  if (person.isFavorite) {
    const marker = documentRef.createElement("span");
    marker.className = "person-favourite";
    marker.setAttribute("aria-hidden", "true");
    marker.textContent = "♥";
    card.appendChild(marker);
  }

  const label = documentRef.createElement("span");
  label.className = "person-name";
  label.textContent = name;
  card.appendChild(label);

  return card;
}

// Shows a loaded face. The face circle clips the image; the initial stays
// underneath until it loads.
export function setPersonCardFace(card: HTMLElement, url: string): void {
  const face = card.querySelector<HTMLElement>(".person-face");

  if (!face || face.querySelector("img")) {
    return;
  }

  const image = card.ownerDocument.createElement("img");
  image.className = "person-face-image";
  image.alt = "";
  image.decoding = "async";
  image.src = url;
  face.appendChild(image);
}
