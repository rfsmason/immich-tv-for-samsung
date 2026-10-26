import type { AlbumService } from "../../app/album-service";
import { removeSearchPerson, type SearchPerson } from "../../domain/search";
import { formatPersonName } from "../../presentation/person-labels";
import { formatSearchPeopleSummary, searchPeopleRule } from "../../presentation/search-labels";
import {
  createSearchControl,
  createSearchRow,
  type SearchPanelContext,
  type SearchRow
} from "./search-row";

// Search's People row: + Add people opens the picker, each chosen person is a
// chip (OK removes it), and "+N more" reopens the picker.

// Chips shown before "+N more"; the rest stay selected.
export const visiblePersonChipCount = 4;

type PeopleRowOptions = {
  onAddPeople(people: SearchPerson[]): void;
  service: Pick<AlbumService, "loadPersonThumbnailUrl" | "revokeThumbnailUrl">;
};

export function createPeopleRow(context: SearchPanelContext, options: PeopleRowOptions): SearchRow {
  const { documentRef } = context;
  let faces: Record<string, string> = {};
  let faceRequests: Record<string, true> = {};
  let generation = 0;
  let rendered: HTMLElement | null = null;

  const people = () => context.criteria().people;

  function appendFaceImage(face: HTMLElement, url: string): void {
    const image = documentRef.createElement("img");

    image.alt = "";
    image.className = "search-chip-image";
    image.src = url;
    face.appendChild(image);
  }

  // Faces for the visible chips only; at most four, released with the chip.
  function loadChipFaces(): void {
    const visible = people().slice(0, visiblePersonChipCount);
    const visibleIds: Record<string, true> = {};

    visible.forEach((person) => (visibleIds[person.id] = true));

    Object.keys(faces).forEach((id) => {
      if (!visibleIds[id]) {
        options.service.revokeThumbnailUrl(faces[id]!);
        delete faces[id];
      }
    });

    const requestGeneration = generation;

    visible.forEach((person) => {
      if (faces[person.id] || faceRequests[person.id]) {
        return;
      }

      faceRequests[person.id] = true;
      options.service
        .loadPersonThumbnailUrl(person)
        .then((url) => {
          delete faceRequests[person.id];

          if (!url) {
            return;
          }

          const chipStillShown = people()
            .slice(0, visiblePersonChipCount)
            .some((item) => item.id === person.id);

          if (requestGeneration !== generation || context.isHidden() || !chipStillShown) {
            options.service.revokeThumbnailUrl(url);
            return;
          }

          faces[person.id] = url;
          const face = rendered?.querySelector<HTMLElement>(
            `[data-search-control="chip:${person.id}"] .search-chip-face`
          );

          if (face) {
            appendFaceImage(face, url);
          }
        })
        .catch(() => {
          // A missing face leaves the chip's initial; the chip still works.
          delete faceRequests[person.id];
        });
    });
  }

  function removeChip(id: string): void {
    const index = people().findIndex((person) => person.id === id);

    context.setCriteria(removeSearchPerson(context.criteria(), id));

    const remaining = people();
    const next = remaining[Math.min(index, remaining.length - 1)];
    const nextKey =
      next && Math.min(index, remaining.length - 1) < visiblePersonChipCount
        ? `chip:${next.id}`
        : "add-people";

    context.update(nextKey);
  }

  return {
    activate(key) {
      if (key === "add-people" || key === "more") {
        options.onAddPeople(people().slice());
        return true;
      }

      if (key.indexOf("chip:") === 0) {
        removeChip(key.slice(5));
        return true;
      }

      return false;
    },
    hide() {
      generation += 1;
      Object.keys(faces).forEach((id) => options.service.revokeThumbnailUrl(faces[id]!));
      faces = {};
      faceRequests = {};
      rendered = null;
    },
    lines() {
      const chosen = people();
      const line = ["add-people"].concat(
        chosen.slice(0, visiblePersonChipCount).map((person) => `chip:${person.id}`)
      );

      if (chosen.length > visiblePersonChipCount) {
        line.push("more");
      }

      return [line];
    },
    render() {
      const { controls, row } = createSearchRow(documentRef, "People");
      const chosen = people();

      controls.appendChild(
        createSearchControl(documentRef, "add-people", "+ Add people", "search-add")
      );

      chosen.slice(0, visiblePersonChipCount).forEach((person) => {
        const name = formatPersonName(person);
        const chip = createSearchControl(documentRef, `chip:${person.id}`, "", "search-chip");
        const face = documentRef.createElement("span");
        const label = documentRef.createElement("span");
        const remove = documentRef.createElement("span");

        face.className = "search-chip-face";
        face.setAttribute("aria-hidden", "true");
        face.textContent = person.name ? person.name.charAt(0).toUpperCase() : "?";

        if (faces[person.id]) {
          appendFaceImage(face, faces[person.id]!);
        }

        label.className = "search-chip-name";
        label.textContent = name;
        remove.className = "search-chip-remove";
        remove.setAttribute("aria-hidden", "true");
        remove.textContent = "×";
        chip.setAttribute("aria-label", `Remove ${name}`);
        chip.appendChild(face);
        chip.appendChild(label);
        chip.appendChild(remove);
        controls.appendChild(chip);
      });

      if (chosen.length > visiblePersonChipCount) {
        const more = createSearchControl(
          documentRef,
          "more",
          `+${chosen.length - visiblePersonChipCount} more`,
          "search-more"
        );
        more.setAttribute("aria-label", `${chosen.length} people selected. Change people`);
        controls.appendChild(more);
      }

      if (chosen.length > 1) {
        const rule = documentRef.createElement("p");
        rule.className = "search-rule";
        rule.textContent = searchPeopleRule;
        row.appendChild(rule);
      }

      rendered = row;
      loadChipFaces();

      return [row];
    },
    summary() {
      return formatSearchPeopleSummary(people());
    }
  };
}
