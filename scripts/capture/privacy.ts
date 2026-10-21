import type { Page } from "playwright";

// Install before navigating to Settings, independently of optional callouts.
// Values, field types and app behavior stay intact; recorded glyphs are masked.
// Keep the mask until context close so cleanup cannot expose a final frame.
export async function maskConnectionFields(page: Page): Promise<void> {
  await page.addStyleTag({
    content: "#server-url, #api-key { -webkit-text-security: disc !important; }"
  });
  const masked = await page.evaluate(() =>
    ["server-url", "api-key"].every((id) => {
      const field = document.getElementById(id);
      return field && getComputedStyle(field).getPropertyValue("-webkit-text-security") === "disc";
    })
  );
  if (!masked) throw new Error("Cannot safely mask connection fields for the Settings recording.");
}
