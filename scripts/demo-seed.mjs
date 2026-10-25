import { createHash, randomBytes } from "node:crypto";
import { execFileSync } from "node:child_process";
import { chmod, readFile, readdir, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { apiKeyHashKeys, hashApiKey } from "../lib/api/key-hash.ts";
import { demoFiles, inaccessibleFinanceFile, DEMO_AUTHORIZED_DISCOVERED, DEMO_CONNECTOR_ID, DEMO_REMOVED_OR_UNAUTHORIZED, DEMO_WORKSPACE_ID, DEMO_WORKSPACE_NAME } from "./demo-fixture.mjs";

const root = new URL("../", import.meta.url).pathname;
const dbPath = await findDatabase(join(root, ".wrangler/state"));
if (!dbPath) throw new Error("Local D1 is not initialized. Run npm run dev once, stop it, then run npm run demo:seed.");
const localEmail = "local-oauth-tester@localhost.invalid";
const actorId = `actor_${createHash("sha256").update(`find-anything-actor-v1:${localEmail}`).digest("hex").slice(0, 24)}`;
const now = "2026-07-02T16:30:00.000Z";
const apiKey = `demo_${randomBytes(24).toString("hex")}`;
const env = await localEnv(join(root, ".env.local"));
if (!env.API_KEY_PEPPER && !env.TOKEN_ENCRYPTION_KEY) throw new Error("API_KEY_PEPPER or TOKEN_ENCRYPTION_KEY is required in .env.local for the local demo API key.");
// Same derivation as lib/api/auth.ts, so the seeded key validates.
const apiKeyHash = await hashApiKey(apiKey, (await apiKeyHashKeys(env)).current);
const q = (value) => `'${String(value).replaceAll("'", "''")}'`;
const statements = [
  "PRAGMA foreign_keys=OFF",
  `DELETE FROM search_receipts WHERE workspace_id=${q(DEMO_WORKSPACE_ID)}`,
  `DELETE FROM retrieval_traces WHERE workspace_id=${q(DEMO_WORKSPACE_ID)}`,
  `DELETE FROM retrieval_conflicts WHERE workspace_id=${q(DEMO_WORKSPACE_ID)}`,
  `DELETE FROM api_rate_limits WHERE api_key_id IN (SELECT id FROM api_keys WHERE workspace_id=${q(DEMO_WORKSPACE_ID)})`,
  `DELETE FROM api_keys WHERE workspace_id=${q(DEMO_WORKSPACE_ID)}`,
  `DELETE FROM extracted_units WHERE workspace_id=${q(DEMO_WORKSPACE_ID)}`,
  `DELETE FROM extracted_units WHERE id LIKE 'demo_unit_%'`,
  `DELETE FROM file_versions WHERE file_id IN (SELECT id FROM source_files WHERE workspace_id=${q(DEMO_WORKSPACE_ID)})`,
  `DELETE FROM file_versions WHERE id LIKE 'demo_version_%' OR file_id LIKE 'demo_file_%'`,
  `DELETE FROM source_files WHERE workspace_id=${q(DEMO_WORKSPACE_ID)}`,
  `DELETE FROM sync_runs WHERE connector_id=${q(DEMO_CONNECTOR_ID)}`,
  `DELETE FROM connectors WHERE workspace_id=${q(DEMO_WORKSPACE_ID)}`,
  `DELETE FROM memberships WHERE workspace_id=${q(DEMO_WORKSPACE_ID)}`,
  `DELETE FROM workspaces WHERE id=${q(DEMO_WORKSPACE_ID)}`,
  `INSERT INTO users(id,email,created_at,updated_at) VALUES(${q(actorId)},${q(localEmail)},${q(now)},${q(now)}) ON CONFLICT(id) DO UPDATE SET updated_at=excluded.updated_at`,
  `INSERT INTO workspaces(id,name,owner_user_id,created_at,updated_at) VALUES(${q(DEMO_WORKSPACE_ID)},${q(DEMO_WORKSPACE_NAME)},${q(actorId)},${q(now)},${q(now)})`,
  `INSERT INTO memberships(id,workspace_id,user_id,role,created_at) VALUES('membership_yc_demo',${q(DEMO_WORKSPACE_ID)},${q(actorId)},'owner',${q(now)})`,
  `INSERT INTO connectors(id,workspace_id,actor_id,provider,provider_account_id,status,access_token_ciphertext,refresh_token_ciphertext,token_expires_at,granted_scopes,last_sync_at,last_error_code,created_at,updated_at) VALUES(${q(DEMO_CONNECTOR_ID)},${q(DEMO_WORKSPACE_ID)},${q(actorId)},'demo_fixture','synthetic-acme-ai','connected','demo-fixture-no-token',NULL,NULL,'demo.fixture.readonly',${q(now)},NULL,${q(now)},${q(now)})`,
  `INSERT INTO sync_runs(id,connector_id,status,files_discovered,files_indexed,files_failed,structured_files,fallback_files,fallback_reasons_json,files_added,files_updated,files_unchanged,files_removed,pagination_complete,next_page_token,error_code,started_at,finished_at) VALUES('sync_yc_demo',${q(DEMO_CONNECTOR_ID)},'partial',${DEMO_AUTHORIZED_DISCOVERED},${demoFiles.length},0,${demoFiles.length},0,'{}',${demoFiles.length},0,0,${DEMO_REMOVED_OR_UNAUTHORIZED},1,NULL,'SOURCE_NO_LONGER_AUTHORIZED','2026-07-02T16:29:42.000Z',${q(now)})`,
];
for (const [index, file] of demoFiles.entries()) {
  const version = `demo_version_${index + 1}`, unit = `demo_unit_${index + 1}`;
  const hash = `sha256:${createHash("sha256").update(file.content).digest("hex")}`;
  statements.push(
    `INSERT INTO source_files(id,workspace_id,connector_id,source_id,name,mime_type,owners_json,permissions_json,parents_json,modified_at,web_view_link,md5_checksum,size_bytes,trashed,index_status,extraction_error,extraction_mode,structural_fallback_reason,searchable_status,permission_fingerprint,provider_revision,extraction_version,indexing_version,tombstoned_at,last_permission_checked_at,created_at,updated_at) VALUES(${q(file.id)},${q(DEMO_WORKSPACE_ID)},${q(DEMO_CONNECTOR_ID)},${q(file.sourceId)},${q(file.name)},${q(file.mime)},'["Synthetic Northstar team"]','["demo-workspace-only"]','[]',${q(file.modifiedAt)},${q(`/app/demo/source/${file.id}`)},NULL,${file.content.length},0,'indexed',NULL,'structured',NULL,'searchable','demo-permission-v1','demo-revision-v1','demo-structure-v1','demo-index-v1',NULL,${q(now)},${q(now)},${q(now)})`,
    `INSERT INTO file_versions(id,file_id,source_modified_at,content_hash,extraction_status,created_at) VALUES(${q(version)},${q(file.id)},${q(file.modifiedAt)},${q(hash)},'complete',${q(now)})`,
    `INSERT INTO extracted_units(id,workspace_id,file_id,file_version_id,unit_type,structural_location_json,text_content,content_hash,created_at) VALUES(${q(unit)},${q(DEMO_WORKSPACE_ID)},${q(file.id)},${q(version)},${q(file.unitType)},${q(JSON.stringify(file.location))},${q(file.content)},${q(hash)},${q(now)})`,
  );
}
statements.push(`INSERT INTO source_files(id,workspace_id,connector_id,source_id,name,mime_type,owners_json,permissions_json,parents_json,modified_at,web_view_link,md5_checksum,size_bytes,trashed,index_status,extraction_error,extraction_mode,structural_fallback_reason,searchable_status,permission_fingerprint,provider_revision,extraction_version,indexing_version,tombstoned_at,last_permission_checked_at,created_at,updated_at) VALUES(${q(inaccessibleFinanceFile.id)},${q(DEMO_WORKSPACE_ID)},${q(DEMO_CONNECTOR_ID)},${q(inaccessibleFinanceFile.sourceId)},${q(inaccessibleFinanceFile.name)},${q(inaccessibleFinanceFile.mime)},'[]','[]','["Finance"]',${q(inaccessibleFinanceFile.modifiedAt)},NULL,NULL,NULL,1,'failed','SOURCE_NO_LONGER_AUTHORIZED',NULL,NULL,'unauthorized','demo-permission-revoked-v1','demo-revision-v1','demo-structure-v1','demo-index-v1',${q(now)},${q(now)},${q(now)},${q(now)})`);
const citation = (file, index) => { const contentHash = `sha256:${createHash("sha256").update(file.content).digest("hex")}`; return { fileId: file.id, fileName: file.name, sourceUrl: `/app/demo/source/${file.id}`, unitId: `demo_unit_${index + 1}`, unitType: file.unitType, structuralLocation: file.location, excerpt: file.content, contentHash, retrievedAt: now }; };
const conflict = ({ id, type, method, leftIndex, rightIndex, leftValue, rightValue, status, decision, reason }) => { const left = demoFiles[leftIndex], right = demoFiles[rightIndex]; statements.push(`INSERT INTO retrieval_conflicts(id,workspace_id,conflict_type,detection_version,detection_method,left_file_id,right_file_id,left_value_json,right_value_json,left_citation_json,right_citation_json,newer_file_id,relationship_inference,reasons_json,status,decision_json,detected_at,updated_at,active) VALUES(${q(id)},${q(DEMO_WORKSPACE_ID)},${q(type)},'deterministic-conflicts-v1',${q(method)},${q(left.id)},${q(right.id)},${q(JSON.stringify(leftValue))},${q(JSON.stringify(rightValue))},${q(JSON.stringify(citation(left,leftIndex)))},${q(JSON.stringify(citation(right,rightIndex)))},${q(left.id)},'The newer source supersedes an older draft, but chronology alone does not prove correctness.',${q(JSON.stringify([reason]))},${q(status)},${q(JSON.stringify(decision))},${q(now)},${q(now)},1)`); };
conflict({ id: "conflict_demo_pricing", type: "currency_amount", method: "structured_currency_comparison", leftIndex: 0, rightIndex: 1, leftValue: { currency: "USD", annual: 120000, implementation: 25000 }, rightValue: { currency: "USD", annual: 95000, implementation: 20000 }, status: "authoritative_source", decision: { actorId, authoritativeFileId: demoFiles[0].id, note: "Approved by the Acme AI executive pricing committee", decidedAt: now }, reason: "Approved and draft pricing documents contain different enterprise and implementation amounts." });
conflict({ id: "conflict_demo_launch", type: "date", method: "structured_date_comparison", leftIndex: 3, rightIndex: 4, leftValue: { date: "2026-09-15", status: "approved" }, rightValue: { date: "2026-09-01", status: "draft" }, status: "unresolved", decision: null, reason: "Final and draft launch plans contain different launch dates." });
statements.push(`INSERT INTO api_keys(id,workspace_id,actor_id,name,key_prefix,key_hash,revoked_at,created_at,last_used_at) VALUES('key_yc_demo',${q(DEMO_WORKSPACE_ID)},${q(actorId)},'Local investor demo',${q(apiKey.slice(0, 16))},${q(apiKeyHash)},NULL,${q(now)},NULL)`);
const sql = `BEGIN;\n${statements.join(";\n")};\nCOMMIT;\n`;
const sqlPath = join(root, ".demo-seed.sql");
await writeFile(sqlPath, sql, { mode: 0o600 });
try { execFileSync("sqlite3", [dbPath], { input: sql, stdio: ["pipe", "ignore", "inherit"] }); }
finally { await writeFile(sqlPath, "-- generated temporarily by demo:seed\n", { mode: 0o600 }); }
const keyPath = join(root, ".demo-api-key");
await writeFile(keyPath, `${apiKey}\n`, { mode: 0o600 }); await chmod(keyPath, 0o600);
const count = execFileSync("sqlite3", [dbPath, `SELECT count(*) FROM source_files WHERE workspace_id='${DEMO_WORKSPACE_ID}' AND searchable_status='searchable';`], { encoding: "utf8" }).trim();
if (Number(count) !== demoFiles.length) throw new Error(`Demo seed verification failed: expected ${demoFiles.length} searchable files, found ${count}.`);
console.log(`Demo workspace restored with ${count} synthetic indexed files. Local API credential saved to .demo-api-key without displaying it.`);

async function findDatabase(directory) {
  const candidates = [];
  async function walk(path) { for (const name of await readdir(path).catch(() => [])) { const p=join(path,name), s=await stat(p); if(s.isDirectory()) await walk(p); else if(name.endsWith(".sqlite") && s.size>4096) candidates.push({p,size:s.size,mtime:s.mtimeMs}); } }
  await walk(directory); candidates.sort((a,b)=>b.mtime-a.mtime || b.size-a.size);
  for (const item of candidates) { try { if (execFileSync("sqlite3", [item.p, "SELECT count(*) FROM sqlite_master WHERE type='table' AND name='workspaces';"], {encoding:"utf8"}).trim()==="1") return item.p; } catch {} }
  return null;
}
async function localEnv(path) { const text=await readFile(path,"utf8").catch(()=>""); return Object.fromEntries(text.split(/\r?\n/).map(line=>line.trim()).filter(line=>line&&!line.startsWith("#")&&line.includes("=")).map(line=>{const i=line.indexOf("=");return[line.slice(0,i),line.slice(i+1).replace(/^['"]|['"]$/g,"")]})); }
