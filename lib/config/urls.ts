/**
 * One canonical public origin is the source of truth for every customer-facing
 * URL. The marketing site and the authenticated product are one deployment on
 * one origin: the public pages are served from `/`, and the product lives under
 * `APP_BASE_PATH` on the same origin. The other NEXT_PUBLIC_* overrides remain
 * supported for compatibility, but they now default to the site origin instead
 * of separate hostnames.
 */
const DEFAULT_SITE_ORIGIN = "https://findanything.dev";

/** The authenticated product is a path on the public origin, not a second host. */
export const APP_BASE_PATH = "/app";
/** Entry point for the unified connect journey (identity → invite gate → Drive). */
export const CONNECT_PATH = "/connect";
/** Authenticated account, workspace, and Google Drive settings. */
export const SETTINGS_PATH = "/settings";
/** Google OAuth redirect path handled by this application. */
export const GOOGLE_DRIVE_CALLBACK_PATH =
  "/api/connectors/google-drive/callback";

function originOf(value: string | undefined, fallback: string): string {
  if (!value) return fallback;
  try {
    return new URL(value).origin;
  } catch {
    return fallback;
  }
}

/** The single canonical public origin. Everything else derives from this. */
export const siteOrigin = originOf(
  process.env.NEXT_PUBLIC_SITE_URL,
  DEFAULT_SITE_ORIGIN,
);

export const publicUrls = {
  site: siteOrigin,
  app: originOf(process.env.NEXT_PUBLIC_APP_URL, siteOrigin),
  api: originOf(process.env.NEXT_PUBLIC_API_URL, siteOrigin),
  docs: originOf(process.env.NEXT_PUBLIC_DOCS_URL, siteOrigin),
  mcp: originOf(process.env.NEXT_PUBLIC_MCP_URL, siteOrigin),
};

/** Absolute URL of the authenticated product entry point. */
export const appUrl = `${publicUrls.app}${APP_BASE_PATH}`;

/**
 * Google OAuth redirect URI. An explicit `GOOGLE_REDIRECT_URI` always wins so
 * local development and any registered legacy callback keep working; otherwise
 * it derives from the canonical public origin.
 */
export function googleRedirectUri(): string {
  const explicit = process.env.GOOGLE_REDIRECT_URI?.trim();
  if (explicit) return explicit;
  return `${siteOrigin}${GOOGLE_DRIVE_CALLBACK_PATH}`;
}

/** Origins that must be registered as authorized JavaScript origins in Google Cloud. */
export function googleAuthorizedOrigins(): string[] {
  return [...new Set([siteOrigin, publicUrls.app])];
}
