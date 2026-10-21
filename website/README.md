# Website

This directory contains the small public landing website for Immich TV for Samsung.

The primary product in this repository remains the Samsung Tizen TV application. The website is a separate static artefact used to explain the project, its unofficial status, current app capabilities, privacy model, and future availability.

## Local Preview

The site has no build step and no runtime dependencies.

Open `website/index.html` directly in a browser, or serve this directory with any static file server:

```sh
cd website
python3 -m http.server 8080
```

Then open `http://127.0.0.1:8080/`.

## Isolation From The TV App

Website files are intentionally kept under `website/`.

- The Tizen build scripts do not read from this directory.
- The website does not import modules from `src/`.
- The website does not depend on Tizen packaging files such as `config.xml`.
- Website deployment should use `website/` as the static deployable root.

If the website later needs its own build tooling, hosting configuration, or deployment scripts, keep them inside this directory unless there is a clear repository-level reason to do otherwise.

## Assets

The site's look comes from two source images in `assets/`: `immich-samsungtv-banner.jpg` (the Immich TV banner) and `immich-samsungtv-logo-color.jpg` (the app logo). The colour tokens on `:root` in `styles.css` are taken from them: the navy of the "Immich" wordmark, the blue of "TV" and the lupin purple of the photos. Text colours are tuned to meet WCAG AA on white.

The page never loads the source images directly. It uses copies sized for each use:

| File | Size | Used for |
| --- | --- | --- |
| `banner-800.webp`, `banner-1600.webp` (JPEG fallbacks alongside) | 800 and 1600 px wide | Hero banner, cropped to the artwork |
| `og-image.jpg` | 1200×630 | Social preview (`og:image`) |
| `logo-96.webp` (PNG fallback alongside) | 96 px, transparent | Header mark, shown at 40 px |
| `logo-32.png`, `logo-16.png` | 32 and 16 px, transparent | Favicons (`<link rel="icon">`) |
| `../favicon.ico` | 16, 32 and 48 px, transparent | Default `/favicon.ico` for browsers and tools that request it |
| `logo-180.png` | 180 px, **opaque** | Apple touch icon |

If the source images change, regenerate the copies at the same sizes and names. Any image tool will do, and no build step is needed. Keep `width` and `height` on every `<img>` matching the file's aspect ratio. The banner and social image were made with a headless Chromium canvas (high-quality resampling, WebP at about 82% quality, JPEG at about 84%).

### Transparent logo icons

The logo source is a JPEG, so it has no transparency: the tile sits on a near-white square with a soft grey drop shadow. The favicon, header mark and `favicon.ico` are cut out along the tile's own outline, so everything outside the tile, including the shadow, is fully transparent and everything inside keeps its original colours, including the white frame. Don't cut out "white" instead: that would hole the frame.

How they were made, so they can be regenerated:

1. **Trace the outline.** The tile is a continuous-corner squircle, not a plain rounded rectangle: its sides bow out by about 7 px. From the tile centre (627.25, 624.2 in the 1254 px source), walk 4096 rays inwards from outside the image. On each ray, the shadow darkens towards the tile, and the edge is where brightness rises sharply out of that minimum, onto the white or grey rim. Smooth the radii around the outline (median of 9 rays, then mean of 7). The tile spans about x 112–1142 and y 118–1131, with an effective corner radius of about 226 px.
2. **Mask.** Inset the outline by 1.25 source pixels so no shadow is kept, and anti-alias it with 4×4 supersampling per pixel.
3. **Crop.** Use a square around the tile: its full width plus a pixel each side, centred vertically. The tile is about 1030 × 1013, so a few transparent rows sit above and below it.
4. **Downscale.** Use an area average in premultiplied alpha, so edges get no dark or white fringe and fully transparent corners stay at alpha 0. Write PNGs, and WebP at about 90% for the header mark.
5. **Pack `favicon.ico`.** It holds the 16, 32 and 48 px PNGs as PNG-compressed entries.

**The Apple touch icon stays opaque.** iOS fills transparent areas of a touch icon with black and applies its own rounded mask. So `logo-180.png` is the same cropped tile filling the square, on the frame's own white (`rgb(254, 254, 254)`). That way it looks right once iOS rounds it.

A transparent master isn't kept: at 512 px it is about 580 KB of photo detail. Regenerate from the source with the steps above. The header mark's shadow uses `filter: drop-shadow`, so it follows the tile's outline rather than a box.

The banner is a JPEG on white, so `styles.css` blends it with `mix-blend-mode: multiply` to avoid a white box over the page's soft background tint.

Real application screenshots should be added only after they can be captured from the demo library without API keys, private server addresses, personal photos, device identifiers, Samsung certificate data, or internal test credentials. Use the capture tooling on `main` (`docs/capture.md`).

## Demo Videos

The "See it in action" section (`#demos`) lists the YouTube demo walkthroughs as tiles. Each tile is a normal link to the video on YouTube, with its 11-character video ID in `data-video-id` and its title in `data-video-title`. `videos.js` turns a click into a centred player using YouTube's privacy-enhanced embed (`youtube-nocookie.com`). The player iframe is created only when a video is chosen and removed when the player closes, so playback always stops. Without JavaScript, or in a browser without `<dialog>`, tiles open the video on YouTube.

To add a video, copy a `<li>` in the grid and change the ID, title, description and thumbnail URL (`https://i.ytimg.com/vi/<id>/hqdefault.jpg`). The first tile is shown as the wide featured tile. Preview images are loaded from YouTube's image server; self-host them under `assets/` if that matters.

## Registration Update and Feedback

The `#feedback` section explains the Samsung partner-registration work and invites feedback and expressions of interest. Its Microsoft Forms iframe loads lazily as visitors approach the section. Responses go to Microsoft Forms; this static site does not store them or need a backend. The separate form link also works without JavaScript or if the embed cannot load.

To replace the form, update both the iframe `src` (with `embed=true`) and the separate response link in `index.html`. Use a public response URL, not an editing or collaboration link. Keep the form set to **Anyone can respond**, and manage questions, email validation and response access in Microsoft Forms. The iframe has an accessible title and sits below the introduction at full section width, so Microsoft Forms can use its desktop rating table rather than its compact layout. It still fits the viewport on mobile; its height is set in `.feedback-form` in `styles.css`.

## Deployment

The site is live at <https://immich-samsungtv.app/>. Cloudflare Workers Builds deploys it with static assets whenever `main` changes. Only `main` deploys; other branches and pull requests don't build.

The Worker's build settings in the Cloudflare dashboard (Settings → Builds) must be:

- **Root directory:** `website`. With the repository root, Cloudflare installs the TV app's development packages and tries to upload the whole repository, which fails because files in `node_modules/` exceed the 25 MiB asset limit.
- **Build command:** empty, since the site has no build step.
- **Deploy command:** `npx wrangler deploy`.

`wrangler.jsonc` names the Worker and points its assets at this folder. Renaming the Worker in it would create a new Worker, so leave the name as it is.

`.assetsignore` keeps files that belong to the repository rather than the site out of the upload: this README, `wrangler.jsonc`, the ignore file itself, and `.wrangler/`, where Wrangler writes temporary build files during every deploy. Add any new non-public file in this folder to it. To check what would be uploaded without deploying, run `WRANGLER_LOG=debug npx wrangler deploy --dry-run` here: it logs each ignored file.

Social previews use absolute URLs (`og:url` and `og:image`), because link previews can't resolve a relative image path. Update them if the domain changes.
