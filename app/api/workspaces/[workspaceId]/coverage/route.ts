import { NextResponse } from "next/server";
import { runSampleRetrieval } from "@/lib/retrieval/core";
import {authorizeDemoWorkspace,isAuthFailure,requireApiActor} from "@/lib/auth/api-authorization";

export async function GET(request:Request,{params}:{params:Promise<{workspaceId:string}>}){const actor=await requireApiActor(request);if(isAuthFailure(actor))return actor;const {workspaceId}=await params;const denied=authorizeDemoWorkspace(actor,workspaceId);if(denied)return denied;const response=runSampleRetrieval({query:"air",mode:"ranked"});return NextResponse.json({workspaceId,actorId:actor.actorId,prototype:true,sampleCorpus:true,coverage:response.coverage},{headers:{"cache-control":"no-store"}});}
