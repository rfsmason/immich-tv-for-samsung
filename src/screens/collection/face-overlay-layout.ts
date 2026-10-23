import type { AssetFace } from "../../domain/face";

// Where face boxes sit over a photo shown with `object-fit: contain`: the
// photo is scaled to fit the stage and centred, leaving letterbox bars, and
// each box is placed within the photo itself. This is how Immich Web maps
// its normalised face boxes onto the displayed image.

export type Size = { height: number; width: number };

export type FaceRect = { height: number; left: number; top: number; width: number };

export function readContainedContentRect(stage: Size, image: Size): FaceRect | null {
  if (stage.width <= 0 || stage.height <= 0 || image.width <= 0 || image.height <= 0) {
    return null;
  }

  const scale = Math.min(stage.width / image.width, stage.height / image.height);
  const width = image.width * scale;
  const height = image.height * scale;

  return {
    height,
    left: (stage.width - width) / 2,
    top: (stage.height - height) / 2,
    width
  };
}

export function mapFaceToContent(face: AssetFace, content: FaceRect): FaceRect {
  return {
    height: (face.box.bottom - face.box.top) * content.height,
    left: content.left + face.box.left * content.width,
    top: content.top + face.box.top * content.height,
    width: (face.box.right - face.box.left) * content.width
  };
}

// A name label's left edge: centred under its box, but kept `margin` inside
// the stage so a face near an edge still has a readable label.
export function clampLabelLeft(
  box: FaceRect,
  labelWidth: number,
  stageWidth: number,
  margin = 12
): number {
  const centred = box.left + box.width / 2 - labelWidth / 2;

  return Math.max(margin, Math.min(stageWidth - labelWidth - margin, centred));
}

// A name label's top edge: below its box, or above it when there is no room
// below, and always inside the stage.
export function clampLabelTop(
  box: FaceRect,
  labelHeight: number,
  stageHeight: number,
  margin = 12,
  gap = 8
): number {
  const below = box.top + box.height + gap;
  const top = below + labelHeight + margin <= stageHeight ? below : box.top - labelHeight - gap;

  return Math.max(margin, Math.min(stageHeight - labelHeight - margin, top));
}
