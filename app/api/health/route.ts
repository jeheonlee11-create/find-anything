import { NextResponse } from "next/server";
export async function GET(){return NextResponse.json({status:"ok",service:"find-anything-web",timestamp:new Date().toISOString(),productionIntegrations:"not_configured"},{headers:{"cache-control":"no-store","x-content-type-options":"nosniff"}})}
