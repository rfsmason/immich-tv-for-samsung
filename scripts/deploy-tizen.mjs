import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { homedir } from "node:os";
import { basename, resolve } from "node:path";
import { loadTizenEnv, requireTizenEnv } from "./tizen-env.mjs";

const root = process.cwd();
const tizenStudioRoot = process.env.TIZEN_STUDIO_HOME || resolve(homedir(), "tizen-studio");
const sdbCli = process.env.SDB_CLI || resolve(tizenStudioRoot, "tools", "sdb");
const tizenCli = process.env.TIZEN_CLI || resolve(tizenStudioRoot, "tools", "ide", "bin", "tizen");

// The app ID is the project's own identity (config.xml), so it has a default.
const appId = process.env.TIZEN_APP_ID || "imchTV0001.ImmichTV";
const packagePath = resolve(root, ".tizen", "package-src", ".buildResult", "ImmichTV.wgt");
const packageDir = resolve(root, ".tizen", "package-src", ".buildResult");

function run(command, args, options = {}) {
  return new Promise((resolvePromise, reject) => {
    console.log(`\n$ ${[command, ...args].join(" ")}`);

    const child = spawn(command, args, {
      cwd: options.cwd || root,
      env: {
        ...process.env,
        TIZEN_CLI: tizenCli
      },
      stdio: "inherit"
    });

    child.on("error", reject);
    child.on("exit", (code) => {
      if (code === 0) {
        resolvePromise();
        return;
      }

      reject(new Error(`${basename(command)} ${args.join(" ")} exited with ${code}`));
    });
  });
}

async function main() {
  loadTizenEnv(root);
  const {
    TIZEN_CERT_PROFILE: certificateProfile,
    TIZEN_TARGET_NAME: targetName,
    TIZEN_TV_HOST: tvHost
  } = requireTizenEnv(["TIZEN_TV_HOST", "TIZEN_TARGET_NAME", "TIZEN_CERT_PROFILE"]);

  console.log("Deploying Immich TV to Samsung Tizen target.");
  console.log(`Target label: ${targetName}`);
  console.log(`SDB host: ${tvHost}`);
  console.log(`Certificate profile: ${certificateProfile}`);

  await run(sdbCli, ["kill-server"]);
  await run(sdbCli, ["start-server"]);
  await run(sdbCli, ["connect", tvHost]);
  await run(sdbCli, ["devices"]);

  // Tizen CLI expects the friendly target label, not the raw SDB host:port serial.
  await run(tizenCli, ["install-permit", "-t", targetName]);
  await run("npm", ["run", "tizen:package"]);
  await access(packagePath);
  await run(tizenCli, ["install", "-t", targetName, "--name", "ImmichTV.wgt", "--", "."], {
    cwd: packageDir
  });
  await run(tizenCli, ["run", "-t", targetName, "-p", appId]);

  console.log("\nDeployment complete.");
}

main().catch((error) => {
  console.error(error.message);
  process.exit(1);
});
