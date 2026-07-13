const DEFAULTS = {
  site: "https://findanything.dev",
  app: "https://app.findanything.dev",
  api: "https://api.findanything.dev",
  docs: "https://docs.findanything.dev",
  mcp: "https://mcp.findanything.dev",
};

function validUrl(value:string|undefined,fallback:string):string { if(!value) return fallback; try{return new URL(value).origin;}catch{return fallback;} }

export const publicUrls = {
  site: validUrl(process.env.NEXT_PUBLIC_SITE_URL,DEFAULTS.site),
  app: validUrl(process.env.NEXT_PUBLIC_APP_URL,DEFAULTS.app),
  api: validUrl(process.env.NEXT_PUBLIC_API_URL,DEFAULTS.api),
  docs: validUrl(process.env.NEXT_PUBLIC_DOCS_URL,DEFAULTS.docs),
  mcp: validUrl(process.env.NEXT_PUBLIC_MCP_URL,DEFAULTS.mcp),
};

