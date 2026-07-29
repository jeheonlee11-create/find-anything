import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
// GOOGLE_REDIRECT_URI is intentionally absent: it derives from the canonical
// public origin (lib/config/urls.ts) unless it is set explicitly, so it can
// never be "missing". `googleRedirectUriSource` reports which one is in effect.
const required=["GOOGLE_CLIENT_ID","GOOGLE_CLIENT_SECRET","TOKEN_ENCRYPTION_KEY","BETA_ACCESS_MODE","BETA_INVITE_PEPPER","BETA_ADMIN_EMAILS"] as const;
export async function GET(){const missing=required.filter(name=>!process.env[name]);let database=false;try{const db=await getDb();await db.run(sql`select 1`);database=true}catch{}const ready=database&&missing.length===0;return NextResponse.json({ready,database,configuration:{required:required.length,configured:required.length-missing.length,missingNames:missing,googleRedirectUriSource:process.env.GOOGLE_REDIRECT_URI?"environment":"derived-from-site-origin"},features:{googleDrive:true,literalSearch:true,semanticSearch:false,secondConnector:false}},{status:ready?200:503,headers:{"cache-control":"no-store","x-content-type-options":"nosniff"}})}
