import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

let workerPromise;
async function worker(){if(!workerPromise){const url=new URL("../dist/server/index.js",import.meta.url);url.searchParams.set("test",`${process.pid}-${Date.now()}`);workerPromise=import(url.href).then((module)=>module.default);}return workerPromise;}
async function request(path,init={}){const handler=await worker();return handler.fetch(new Request(`http://localhost${path}`,init),{ASSETS:{fetch:async()=>new Response("Not found",{status:404})}},{waitUntil(){},passThroughOnException(){}});}
async function search(query,extra={}){const response=await request("/api/retrieval/search",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({query,...extra})});assert.equal(response.status,200);return response.json();}

test("renders product, docs, and trust routes with prototype disclosures",async()=>{for(const [path,pattern] of [["/",/Interactive prototype/i],["/docs",/Retrieval API contract/i],["/trust",/Trust starts with accurate claims/i]]){const response=await request(path);assert.equal(response.status,200);assert.match(await response.text(),pattern);}});

test("sample search returns relevant structural evidence",async()=>{const result=await search("air pollution Detroit");assert.ok(result.totalMatches>=1);const essay=result.results.find((item)=>item.file.name==="Environmental Justice Scholarship Essay");assert.ok(essay);assert.match(essay.citation,/Paragraphs 47–51/);assert.equal(essay.permissionStatus,"allowed");});

test("unrelated query does not return Detroit sample results",async()=>{const result=await search("hi");assert.equal(result.totalMatches,0);assert.deepEqual(result.results,[]);});

test("coverage marks extraction failure as partial and warns",async()=>{const result=await search("air");assert.equal(result.coverage.complete,false);assert.equal(result.coverage.completenessStatus,"partial");assert.equal(result.coverage.extractionFailed,1);assert.ok(result.coverage.warnings.some((warning)=>/incomplete/i.test(warning)));});

test("receipt matches results and is labeled exportable rather than immutable",async()=>{const result=await search("customer growth");assert.equal(result.receipt.label,"Exportable retrieval record");assert.equal(result.receipt.returnedEvidence.length,result.results.length);assert.equal(result.receipt.prototype,true);});

test("Find All pagination is stable and non-duplicating",async()=>{const init=(page)=>request("/api/retrieval/find-all",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({query:"growth revenue enterprise",page,pageSize:1})}).then(async(response)=>{assert.equal(response.status,200);return response.json();});const first=await init(1);const second=await init(2);assert.ok(first.totalMatches>=2);assert.equal(first.results.length,1);assert.equal(second.results.length,1);assert.notEqual(first.results[0].file.id,second.results[0].file.id);});

test("public URLs are environment configurable and contain no personal-name branding",async()=>{const [config,layout,page]=await Promise.all([readFile(new URL("../lib/config/urls.ts",import.meta.url),"utf8"),readFile(new URL("../app/layout.tsx",import.meta.url),"utf8"),readFile(new URL("../app/page.tsx",import.meta.url),"utf8")]);for(const key of ["NEXT_PUBLIC_SITE_URL","NEXT_PUBLIC_APP_URL","NEXT_PUBLIC_API_URL","NEXT_PUBLIC_DOCS_URL","NEXT_PUBLIC_MCP_URL"]) assert.match(config,new RegExp(key));assert.match(layout,/NEXT_PUBLIC_SITE_URL/);assert.doesNotMatch(`${config}${layout}${page}`,/minhwi\s*yi|minhwi/i);});
