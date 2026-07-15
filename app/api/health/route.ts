import { sql } from "drizzle-orm";
import { NextResponse } from "next/server";
import { getDb } from "@/db";
export async function GET(){let database="unavailable";try{const db=await getDb();await db.run(sql`select 1`);database="ok"}catch{}const ok=database==="ok";return NextResponse.json({status:ok?"ok":"degraded",service:"find-anything",database,timestamp:new Date().toISOString()},{status:ok?200:503,headers:{"cache-control":"no-store","x-content-type-options":"nosniff"}})}
