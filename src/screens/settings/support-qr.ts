// The Support Us tip page and its QR code (ADR 0021). Only
// src/app/distribution.ts imports its values, so a store build leaves them out.
//
// QR code
//   Encodes:          https://ko-fi.com/immichtv (exactly; no parameters)
//   Error correction: M (version 2, 25 × 25 modules)
//   Quiet zone:       4 modules, so the code is 33 × 33 modules
//   Generator:        macOS Core Image CIQRCodeGenerator, through
//                     scripts/support-qr.swift
// The path draws the dark modules in module units, quiet zone included.

export type SupportPage = {
  // The address as shown, without the scheme.
  label: string;
  qr: { path: string; size: number };
  url: string;
};

export const tipPage: SupportPage = {
  label: "ko-fi.com/immichtv",
  qr: {
    path: "M4 4h7v1h-7zM13 4h1v1h-1zM17 4h1v1h-1zM22 4h7v1h-7zM4 5h1v1h-1zM10 5h1v1h-1zM16 5h5v1h-5zM22 5h1v1h-1zM28 5h1v1h-1zM4 6h1v1h-1zM6 6h3v1h-3zM10 6h1v1h-1zM12 6h1v1h-1zM15 6h1v1h-1zM18 6h3v1h-3zM22 6h1v1h-1zM24 6h3v1h-3zM28 6h1v1h-1zM4 7h1v1h-1zM6 7h3v1h-3zM10 7h1v1h-1zM12 7h3v1h-3zM17 7h2v1h-2zM22 7h1v1h-1zM24 7h3v1h-3zM28 7h1v1h-1zM4 8h1v1h-1zM6 8h3v1h-3zM10 8h1v1h-1zM12 8h2v1h-2zM15 8h1v1h-1zM17 8h1v1h-1zM20 8h1v1h-1zM22 8h1v1h-1zM24 8h3v1h-3zM28 8h1v1h-1zM4 9h1v1h-1zM10 9h1v1h-1zM12 9h3v1h-3zM16 9h1v1h-1zM19 9h2v1h-2zM22 9h1v1h-1zM28 9h1v1h-1zM4 10h7v1h-7zM12 10h1v1h-1zM14 10h1v1h-1zM16 10h1v1h-1zM18 10h1v1h-1zM20 10h1v1h-1zM22 10h7v1h-7zM12 11h1v1h-1zM18 11h1v1h-1zM20 11h1v1h-1zM4 12h1v1h-1zM6 12h5v1h-5zM13 12h1v1h-1zM16 12h3v1h-3zM22 12h5v1h-5zM5 13h1v1h-1zM7 13h2v1h-2zM16 13h2v1h-2zM20 13h1v1h-1zM23 13h1v1h-1zM27 13h1v1h-1zM5 14h2v1h-2zM10 14h1v1h-1zM12 14h5v1h-5zM18 14h4v1h-4zM23 14h3v1h-3zM27 14h2v1h-2zM5 15h1v1h-1zM9 15h1v1h-1zM12 15h2v1h-2zM18 15h1v1h-1zM21 15h1v1h-1zM24 15h1v1h-1zM28 15h1v1h-1zM4 16h2v1h-2zM9 16h2v1h-2zM13 16h1v1h-1zM15 16h5v1h-5zM22 16h1v1h-1zM24 16h1v1h-1zM26 16h3v1h-3zM4 17h1v1h-1zM9 17h1v1h-1zM11 17h4v1h-4zM16 17h2v1h-2zM20 17h1v1h-1zM23 17h1v1h-1zM25 17h1v1h-1zM27 17h1v1h-1zM4 18h1v1h-1zM7 18h1v1h-1zM10 18h1v1h-1zM13 18h2v1h-2zM16 18h1v1h-1zM18 18h2v1h-2zM21 18h1v1h-1zM23 18h3v1h-3zM27 18h2v1h-2zM4 19h1v1h-1zM6 19h1v1h-1zM9 19h1v1h-1zM11 19h1v1h-1zM14 19h2v1h-2zM18 19h1v1h-1zM20 19h5v1h-5zM28 19h1v1h-1zM4 20h1v1h-1zM7 20h1v1h-1zM9 20h4v1h-4zM14 20h1v1h-1zM17 20h2v1h-2zM20 20h5v1h-5zM26 20h1v1h-1zM12 21h1v1h-1zM14 21h2v1h-2zM17 21h1v1h-1zM19 21h2v1h-2zM24 21h2v1h-2zM4 22h7v1h-7zM13 22h1v1h-1zM16 22h1v1h-1zM20 22h1v1h-1zM22 22h1v1h-1zM24 22h1v1h-1zM26 22h3v1h-3zM4 23h1v1h-1zM10 23h1v1h-1zM12 23h3v1h-3zM18 23h3v1h-3zM24 23h2v1h-2zM4 24h1v1h-1zM6 24h3v1h-3zM10 24h1v1h-1zM12 24h2v1h-2zM17 24h8v1h-8zM26 24h1v1h-1zM4 25h1v1h-1zM6 25h3v1h-3zM10 25h1v1h-1zM12 25h4v1h-4zM21 25h2v1h-2zM24 25h5v1h-5zM4 26h1v1h-1zM6 26h3v1h-3zM10 26h1v1h-1zM12 26h1v1h-1zM16 26h2v1h-2zM19 26h2v1h-2zM25 26h2v1h-2zM28 26h1v1h-1zM4 27h1v1h-1zM10 27h1v1h-1zM13 27h2v1h-2zM16 27h1v1h-1zM18 27h8v1h-8zM28 27h1v1h-1zM4 28h7v1h-7zM12 28h1v1h-1zM14 28h5v1h-5zM23 28h6v1h-6z",
    size: 33
  },
  url: "https://ko-fi.com/immichtv"
};
