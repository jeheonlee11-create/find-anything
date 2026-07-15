import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
const required=["GOOGLE_CLIENT_ID","GOOGLE_CLIENT_SECRET","GOOGLE_REDIRECT_URI","TOKEN_ENCRYPTION_KEY","BETA_ACCESS_MODE","BETA_INVITE_PEPPER","BETA_ADMIN_EMAILS"] as const;
export async function GET(){const missing=required.filter(name=>!process.env[name]);let database=false;try{const db=await getDb();await db.run(sql`select 1`);database=true}catch{}const ready=database&&missing.length===0;return NextResponse.json({ready,database,configuration:{required:required.length,configured:required.length-missing.length,missingNames:missing},features:{googleDrive:true,literalSearch:true,semanticSearch:false,secondConnector:false}},{status:ready?200:503,headers:{"cache-control":"no-store","x-content-type-options":"nosniff"}})}
