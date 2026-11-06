# Beta testing Immich TV for Samsung

Thank you for trying the beta. Immich TV for Samsung is an independent, unofficial Samsung Tizen TV client for Immich. It is not affiliated with or endorsed by Immich, FUTO or Samsung.

The app only reads from your Immich server: it never uploads, edits or deletes anything. It is a beta, so expect rough edges.

Reported working on:

- **Samsung Q950R** (QLED, 2019, Tizen 5.0): the development TV, where every release is tested.
- **Samsung S90F** (OLED, 2025), reported by a beta tester. On Samsung OLED TVs the TV's own burn-in screensaver can interrupt slideshows and ambient mode after about 2 minutes. **Fixed in 0.1.2 (beta 3):** turn on **Settings → Display → Keep OLED screensaver away** ([issue #15](https://github.com/rfsmason/immich-tv-for-samsung/issues/15)).

If it works on your TV, or doesn't, please tell us with a [TV report](https://github.com/rfsmason/immich-tv-for-samsung/issues/new?template=tv-report.yml).

## What you need

- A Samsung TV from 2019 or later (Tizen 5.0 or newer), on the same network as your Immich server or able to reach it over HTTPS.
- An Immich server running version 3.2.0 or later.
- An Immich API key, ideally one that only has the read permissions listed in [README.md](../README.md#required-api-key-permissions).
- A computer (Windows, macOS or Linux) on the same network as the TV, to install the app.
- A Samsung account. Installing an app on a TV yourself needs a signing certificate made for your TV, and Samsung issues it to your account.

## 1. Download the app

If you install with Apps2Samsung from its community catalogue (option A below), skip this step: Apps2Samsung downloads the app for you.

Otherwise, from the project's [GitHub Releases](https://github.com/rfsmason/immich-tv-for-samsung/releases), download `ImmichTV-<version>-unsigned.wgt` from the latest beta. The release notes give its SHA-256 checksum, so you can check the download:

```sh
shasum -a 256 ImmichTV-<version>-unsigned.wgt
```

The package is **unsigned** on purpose. A signed package only installs on the TVs its certificate names, so you sign it for your own TV as you install it. Nothing in it identifies the developer's certificate or devices.

## 2. Turn on Developer Mode on the TV

1. On the TV, open **Apps**.
2. With the remote's number keys (or the on-screen keypad), enter `1 2 3 4 5`.
3. Turn **Developer mode** on, and enter the IP address of the computer you'll install from.
4. Restart the TV when it asks you to.

Developer Mode can stay on during normal use.

## 3. Install

### Option A: Apps2Samsung (easiest)

[Apps2Samsung](https://github.com/Apps2Samsung/Apps2Samsung) is a community installer for Samsung TVs. It isn't part of this project. On the first install for a TV it creates a signing certificate, which needs a Samsung account sign-in in a browser. The unsigned beta has been installed this way on the 2019 Q950R, with Apps2Samsung 3.1.0 on macOS.

Immich TV is listed in Apps2Samsung's [community catalogue](https://github.com/Apps2Samsung/tizen-community-packages), under Media. The catalogue copies each new GitHub release of this project, so it offers the same package as the Releases page.

If an older copy of Immich TV is already on the TV, for example one you installed with Tizen Studio, remove it first: a copy signed with a different certificate may not be replaced.

1. Install Apps2Samsung by following its README.
2. Choose **Immich TV** from its community catalogue. Or, if you downloaded the `.wgt` yourself, choose to install a custom `.wgt` and pick that file.
3. From the catalogue, starting with beta 2 (version 0.1.1), Apps2Samsung asks for your Immich server URL and API key before it installs. Fill them in and the app starts already connected, with no typing on the TV. You can leave them empty and enter them on the TV instead. Apps2Samsung remembers them for updates.
4. Follow its prompts to find your TV, sign in to Samsung and install.

### Option B: Tizen Studio

If you already use Samsung's Tizen Studio with the TV extensions:

1. In Certificate Manager, create a **Samsung** certificate profile that includes your TV's DUID. The DUID is shown on the TV under Menu › Support › Contact Samsung, or Certificate Manager can read it from a connected TV.
2. Connect to the TV:

   ```sh
   sdb connect <tv-ip>
   sdb devices
   ```

   Note the target name `sdb devices` prints for your TV; the commands below need it, not the IP address.
3. Unpack the download, sign it with your profile, and install it:

   ```sh
   mkdir immich-tv && cd immich-tv
   unzip ../ImmichTV-<version>-unsigned.wgt
   tizen package -t wgt -s <your-profile> -- .
   tizen install -t <target-name> --name "<the signed .wgt it created>" -- .
   tizen run -t <target-name> -p imchTV0001.ImmichTV
   ```

## 4. First run

If you gave Apps2Samsung your server URL and API key, the app opens connected on Home. A connection you later change in Settings on the TV stays until you reinstall with different details in Apps2Samsung.

Otherwise the app opens on Settings. Enter your Immich server URL (for example `http://<server-ip>:2283`, or your `https://` address) and API key, choose **Test connection**, then **Save**. Typing a long key with the remote is slow; pairing with your phone is planned.

Everything is driven by the Smart Remote: arrows, OK and Back reach everything. Settings › Support Us explains how to tip if you enjoy the app. Tips are optional and unlock nothing.

## Updating

Install a newer beta the same way. It has the same app ID, so it replaces the one already on the TV. Apps2Samsung's catalogue picks up a new release shortly after it is published on GitHub.

## Feedback

Please report what works and what doesn't:

- [GitHub Issues](https://github.com/rfsmason/immich-tv-for-samsung/issues): for bugs, include your TV model and year, your Immich version, and what you did.
- The feedback form on the [website](https://immich-samsungtv.app/#feedback).

Never post your API key or your server's address, and don't attach screenshots of your own photos.

## Removing the app

Remove it from the TV's Apps screen like any other app, or with `tizen uninstall -t <target-name> -p imchTV0001.ImmichTV`.
