import { NextResponse } from "next/server";
export async function GET(){return NextResponse.json({ready:true,demoRetrieval:true,database:false,googleDrive:false,billing:false,status:"demo_ready_production_not_ready"},{status:200,headers:{"cache-control":"no-store"}})}
