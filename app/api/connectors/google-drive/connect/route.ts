import { NextResponse } from "next/server";
export async function POST(){return NextResponse.json({status:"not_implemented",prototype:true,message:"Google OAuth is not configured. See docs/google-drive-mvp.md and .env.example."},{status:501});}

