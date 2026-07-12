import { NextResponse } from "next/server";
export async function POST(){return NextResponse.json({status:"not_implemented",prototype:true,message:"Connector synchronization requires Google OAuth, persistence, and a background-job implementation."},{status:501});}

