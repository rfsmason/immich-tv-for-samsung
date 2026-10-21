# Tizen Deploy Runbook

Use this runbook when deploying to the physical Samsung Q950R.

## Known-Good Command

First, give the scripts your own TV and signing settings. Copy `.env.tizen.example` to `.env.tizen` (ignored by git) and fill in:

- `TIZEN_TV_HOST`: the TV's SDB address, `<tv-ip>:26101`;
- `TIZEN_TARGET_NAME`: the target name `sdb devices` shows for the TV. On the Q950R test TV it's the model code, `QE55Q950RBTXXU`;
- `TIZEN_CERT_PROFILE`: your Tizen Studio certificate profile.

The same names can be set in the environment instead. The app ID defaults to `imchTV0001.ImmichTV` (from `config.xml`), and `TIZEN_APP_ID` overrides it.

Then, from the project root:

```sh
npm run tizen:deploy
```

## Important Target Detail

`sdb devices` shows the raw SDB serial next to the target name:

```text
<tv-ip>:26101    device    <target-name>
```

Use the target name, not the raw `<tv-ip>:26101` value, for Tizen CLI commands such as `install-permit`, `install` and `run`. With the raw value, Tizen CLI can fail with:

```text
There is no <tv-ip>:26101 target.
```

## Stale SDB Recovery

The commands below use the values from `.env.tizen`. Load them into your shell first:

```sh
set -a; . ./.env.tizen; set +a
```

If deployment hangs with no output, or if `sdb devices` works but `sdb shell`, `tizen install` or `tizen install-permit` hangs, restart SDB and reconnect:

```sh
$HOME/tizen-studio/tools/sdb kill-server
$HOME/tizen-studio/tools/sdb start-server
$HOME/tizen-studio/tools/sdb connect "$TIZEN_TV_HOST"
$HOME/tizen-studio/tools/sdb devices
```

If needed, check for stale agents:

```sh
ps -ef | egrep 'sdb|tizen' | grep -v egrep
```

After reconnecting, refresh install permission with the target name:

```sh
$HOME/tizen-studio/tools/ide/bin/tizen install-permit -t "$TIZEN_TARGET_NAME"
```

## Manual Deploy Sequence

If the script is not available, use the same sequence manually, with `.env.tizen` loaded as above:

```sh
$HOME/tizen-studio/tools/sdb kill-server
$HOME/tizen-studio/tools/sdb start-server
$HOME/tizen-studio/tools/sdb connect "$TIZEN_TV_HOST"
$HOME/tizen-studio/tools/ide/bin/tizen install-permit -t "$TIZEN_TARGET_NAME"
TIZEN_CLI=$HOME/tizen-studio/tools/ide/bin/tizen npm run tizen:package
cd .tizen/package-src/.buildResult
$HOME/tizen-studio/tools/ide/bin/tizen install -t "$TIZEN_TARGET_NAME" --name ImmichTV.wgt -- .
$HOME/tizen-studio/tools/ide/bin/tizen run -t "$TIZEN_TARGET_NAME" -p imchTV0001.ImmichTV
```

## Debug Build For On-TV Diagnosis

Production builds ship a minified `scripts/main.js`. To inspect readable code and stack traces in the TV's Web Inspector, deploy an unminified build instead:

```sh
IMMICH_TV_DEBUG_BUILD=1 npm run tizen:deploy
```

`npm run build:debug` produces the same unminified `dist/` locally. Redeploy with plain `npm run tizen:deploy` afterwards so the TV runs the production bundle.
