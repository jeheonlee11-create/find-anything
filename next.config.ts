import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  async headers(){return [{source:"/(.*)",headers:[
    {key:"X-Content-Type-Options",value:"nosniff"},
    {key:"X-Frame-Options",value:"DENY"},
    {key:"Strict-Transport-Security",value:"max-age=31536000; includeSubDomains"},
    {key:"Cross-Origin-Opener-Policy",value:"same-origin"},
    {key:"Cross-Origin-Resource-Policy",value:"same-origin"},
    {key:"Referrer-Policy",value:"strict-origin-when-cross-origin"},
    {key:"Permissions-Policy",value:"camera=(), microphone=(), geolocation=()"},
    {key:"Content-Security-Policy",value:"default-src 'self'; img-src 'self' data: https:; style-src 'self' 'unsafe-inline'; script-src 'self' 'unsafe-inline' https://apis.google.com; connect-src 'self'; frame-src 'self' https://docs.google.com; frame-ancestors 'none'; base-uri 'self'; form-action 'self'"},
  ]}]},
};

export default nextConfig;
