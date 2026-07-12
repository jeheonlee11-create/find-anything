import { NextResponse } from "next/server";
import { runSampleRetrieval } from "@/lib/retrieval/core";

export async function GET(_request:Request,{params}:{params:Promise<{workspaceId:string}>}){const {workspaceId}=await params;const response=runSampleRetrieval({query:"air",mode:"ranked"});return NextResponse.json({workspaceId,prototype:true,sampleCorpus:true,coverage:response.coverage});}

