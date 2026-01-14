const fs = require("fs");
const path = require("path");

function stripQuotes(value) {
    const trimmed = value.trim();
    if (
        (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
        (trimmed.startsWith("'") && trimmed.endsWith("'"))
    ) {
        return trimmed.slice(1, -1);
    }
    return trimmed;
}

function parseEnvFile(content) {
    const env = {};
    const lines = content.split(/\r?\n/);

    for (const rawLine of lines) {
        const line = rawLine.trim();
        if (!line || line.startsWith("#")) continue;

        const withoutExport = line.startsWith("export ") ? line.slice("export ".length) : line;
        const eqIndex = withoutExport.indexOf("=");
        if (eqIndex === -1) continue;

        const key = withoutExport.slice(0, eqIndex).trim();
        const valueRaw = withoutExport.slice(eqIndex + 1);
        if (!key) continue;

        env[key] = stripQuotes(valueRaw);
    }

    return env;
}

function loadEnvFile(envFilePath, { override = true } = {}) {
    if (!envFilePath) {
        throw new Error("Missing env file path");
    }

    const resolved = path.isAbsolute(envFilePath) ? envFilePath : path.join(process.cwd(), envFilePath);
    if (!fs.existsSync(resolved)) {
        throw new Error(`Env file not found: ${resolved}`);
    }

    const content = fs.readFileSync(resolved, "utf8");
    const parsed = parseEnvFile(content);

    for (const [key, value] of Object.entries(parsed)) {
        if (override || process.env[key] === undefined) {
            process.env[key] = value;
        }
    }

    return { resolvedPath: resolved, parsedKeys: Object.keys(parsed) };
}

module.exports = { loadEnvFile };
