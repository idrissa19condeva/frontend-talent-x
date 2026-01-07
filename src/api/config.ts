const rawApiUrl = process.env.EXPO_PUBLIC_API_URL || "";

const normalizeApiUrl = (value: string) => {
    const trimmed = String(value || "").trim();
    if (!trimmed) return "";

    // Remove trailing slashes
    const noTrailingSlash = trimmed.replace(/\/+$/, "");

    // Ensure we target the API prefix.
    return noTrailingSlash.endsWith("/api") ? noTrailingSlash : `${noTrailingSlash}/api`;
};

export const API_URL = normalizeApiUrl(rawApiUrl);

if (__DEV__) {
    const hasWhitespace = /\s/.test(rawApiUrl);
    if (!API_URL) {
        console.warn("⚠️ EXPO_PUBLIC_API_URL is empty. Backend calls will fail.");
    } else if (hasWhitespace) {
        console.warn("⚠️ EXPO_PUBLIC_API_URL contains whitespace; normalized value will be used.", {
            raw: rawApiUrl,
            normalized: API_URL,
        });
    } else {
        console.info("API_URL:", API_URL);
    }
}
