import { NextResponse } from "next/server";
import { runSampleRetrieval } from "@/lib/retrieval/core";
import type { RetrievalFilters } from "@/lib/retrieval/types";

export async function POST(request:Request){
  const requestId=request.headers.get("x-request-id")||crypto.randomUUID();
  const body=await request.json().catch(()=>({})) as {query?:string;filters?:RetrievalFilters;page?:number;pageSize?:number};
  if(typeof body.query!=="string"||!body.query.trim()||body.query.length>2000) return NextResponse.json({error:{code:"INVALID_QUERY",message:"query must contain 1–2000 characters",requestId}},{status:400,headers:{"x-request-id":requestId}});
  return NextResponse.json({...runSampleRetrieval({query:body.query,mode:"find_all",filters:body.filters,page:body.page,pageSize:body.pageSize??20}),requestId},{headers:{"x-request-id":requestId,"cache-control":"no-store"}});
}
