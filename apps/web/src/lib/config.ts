const configuredApiUrl =
  process.env.NEXT_PUBLIC_FLOWWRIGHT_API_URL ?? process.env.FLOWWRIGHT_API_URL;
const production = process.env.NODE_ENV === "production";

if (production && !configuredApiUrl && typeof window !== "undefined") {
  console.warn(
    "Production API URL is not configured; live backend actions are unavailable.",
  );
}

export const API_URL =
  configuredApiUrl ?? (production ? "" : "http://localhost:8000");
export const API_CONFIGURED = Boolean(configuredApiUrl) || !production;

export function apiUnavailableMessage(): string {
  return "The live backend is unavailable. Configure FLOWWRIGHT_API_URL to enable this action.";
}
