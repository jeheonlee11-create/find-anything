# Threat model

Protected assets include OAuth credentials, workspace membership, source ACLs, file metadata, extracted units, API keys, traces, receipts, and billing state.

Key threats: cross-tenant IDOR, stale Drive permissions, token theft, OAuth state substitution, SSRF through file links, malicious parsers, stored/reflected XSS through names or content, CSRF, webhook spoofing, brute-force API use, log/PII leakage, and indirect prompt injection.

Required controls: centralized workspace authorization, opaque IDs, deny-by-default ACL evaluation, encrypted credentials, PKCE and exact redirects, URL allowlists, sandboxed parsing, output encoding, CSP, signed webhooks with replay windows, scoped/hashed API keys, rate limits, retention enforcement, and security-event audit logs. Human review and penetration testing remain mandatory before beta.
