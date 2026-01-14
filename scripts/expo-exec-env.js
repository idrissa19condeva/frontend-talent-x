#!/usr/bin/env node

const { spawnSync } = require("child_process");
const { loadEnvFile } = require("./load-env-file");

function printUsageAndExit(code) {
    // eslint-disable-next-line no-console
    console.log(
        [
            "Usage:",
            "  node scripts/expo-exec-env.js <envFile> <expo args...>",
            "",
            "Examples:",
            "  node scripts/expo-exec-env.js .env.development run:android",
            "  node scripts/expo-exec-env.js .env.production run:ios",
            "  node scripts/expo-exec-env.js .env.development config --type public",
        ].join("\n"),
    );
    process.exit(code);
}

const [, , envFile, ...expoArgs] = process.argv;

if (!envFile || envFile === "-h" || envFile === "--help" || expoArgs.length === 0) {
    printUsageAndExit(envFile ? 0 : 1);
}

try {
    const { resolvedPath } = loadEnvFile(envFile);
    process.env.ENV_FILE = resolvedPath;
    process.env.EXPO_NO_DOTENV = "1";

    const useShell = process.platform === "win32";

    const result = spawnSync(
        "npx",
        ["expo", ...expoArgs],
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

    // Fallback (shouldn't happen), but do not report success silently.
    process.exit(1);
} catch (error) {
    // eslint-disable-next-line no-console
    console.error(String(error?.message || error));
    process.exit(1);
}
