import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";

const files = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter(Boolean)
  .filter((file) => !file.startsWith("drizzle/meta/"));
const patterns = [
  /GOCSPX-[A-Za-z0-9_-]{10,}/,
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /GOOGLE_CLIENT_SECRET\s*=\s*(?!your_|$)[^\s#]+/m,
  /TOKEN_ENCRYPTION_KEY\s*=\s*(?!generate_|$)[^\s#]+/m,
  /\bsk-[A-Za-z0-9_-]{20,}/,
];
for (const file of files) {
  const content = await readFile(file, "utf8").catch(() => "");
  for (const pattern of patterns)
    assert.doesNotMatch(content, pattern, `Potential secret in ${file}`);
}
console.log(`Scanned ${files.length} tracked files; no committed secret patterns found.`);
