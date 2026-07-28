/* Cloudflare Pages worker for findanything.dev (Direct Upload "advanced mode").
   One job: make the access-request form on this static site save for real by
   proxying POST /api/waitlist server-side to the application's waitlist API.
   Server-to-server, so no CORS is involved, and no secrets live here — the
   upstream endpoint is public and does its own validation, rate limiting,
   and bot filtering. Everything else falls through to the static assets. */

const UPSTREAM = "https://app.findanything.dev/api/beta/waitlist";
const MAX_BODY_BYTES = 24_000; // mirrors the upstream request-size limit

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname !== "/api/waitlist") return env.ASSETS.fetch(request);

    if (request.method !== "POST") {
      return json(405, { error: { code: "METHOD_NOT_ALLOWED", message: "Use POST." } }, { allow: "POST" });
    }
    const length = Number(request.headers.get("content-length") ?? 0);
    if (length > MAX_BODY_BYTES) {
      return json(413, { error: { code: "REQUEST_TOO_LARGE", message: "Please shorten your response and try again." } });
    }

    try {
      const upstream = await fetch(UPSTREAM, {
        method: "POST",
        headers: {
          "content-type": "application/json",
          // Informational only: the upstream rate limiter keys on the
          // connecting IP it observes (this worker's egress), so submissions
          // proxied through this page share one public-request bucket.
          "x-forwarded-for": request.headers.get("cf-connecting-ip") ?? "",
        },
        body: await request.text(),
      });
      const body = await upstream.text();
      return new Response(body, {
        status: upstream.status,
        headers: { "content-type": "application/json", "cache-control": "no-store" },
      });
    } catch {
      return json(502, { error: { code: "UPSTREAM_UNREACHABLE", message: "The application could not be reached. Nothing was saved — please try again." } });
    }
  },
};

function json(status, payload, extraHeaders = {}) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store", ...extraHeaders },
  });
}
