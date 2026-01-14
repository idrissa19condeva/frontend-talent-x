#!/usr/bin/env node

const { spawnSync } = require("child_process");
const path = require("path");
const { loadEnvFile } = require("./load-env-file");

function printUsageAndExit(code) {
    // eslint-disable-next-line no-console
    console.log(
        [
            "Usage:",
            "  node scripts/expo-start-env.js <envFile> [expo start args...]",
            "",
            "Examples:",
            "  node scripts/expo-start-env.js .env.development --dev-client",
            "  node scripts/expo-start-env.js .env.production --dev-client --no-dev --minify",
        ].join("\n"),
    );
    process.exit(code);
}

const [, , envFile, ...expoArgs] = process.argv;

if (!envFile || envFile === "-h" || envFile === "--help") {
    printUsageAndExit(envFile ? 0 : 1);
}

try {
    const { resolvedPath } = loadEnvFile(envFile);
    process.env.ENV_FILE = resolvedPath;

    // Prevent Expo from auto-loading .env files so our selection is deterministic.
    process.env.EXPO_NO_DOTENV = "1";

    const useShell = process.platform === "win32";

    const result = spawnSync(
        "npx",
        ["expo", "start", ...expoArgs],
        {
            stdio: "inherit",
            env: process.env,
            cwd: process.cwd(),
            shell: useShell,
        },
    );

    if (result.error) {
        // eslint-disable-next-line no-console
        console.error(String(result.error.message || result.error));
        process.exit(1);
    }

    if (typeof result.status === "number") {
        process.exit(result.status);
    }

    process.exit(1);
} catch (error) {
    // eslint-disable-next-line no-console
    console.error(String(error?.message || error));
    process.exit(1);
}
