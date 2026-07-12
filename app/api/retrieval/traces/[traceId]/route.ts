import { NextResponse } from "next/server";
import { runSampleRetrieval } from "@/lib/retrieval/core";

export async function GET(_request:Request,{params}:{params:Promise<{traceId:string}>}){const {traceId}=await params;const response=runSampleRetrieval({query:"air pollution Detroit",mode:"ranked"});return NextResponse.json({...response.trace,requestedTraceId:traceId,notice:"Prototype route returns a generated sample trace; traces are not persisted."});}

