// A face Immich has detected in a photo (ADR 0017). The box is in fractions
// of the photo's width and height (0 to 1, from the top left), so it can be
// drawn over the photo at any size.
export type AssetFace = {
  box: { bottom: number; left: number; right: number; top: number };
  id: string;
  // The name of the person the face belongs to, or null for an unnamed face.
  personName: string | null;
};
