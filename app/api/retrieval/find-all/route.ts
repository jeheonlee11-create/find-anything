import { NextResponse } from "next/server";
import { runSampleRetrieval } from "@/lib/retrieval/core";
import type { RetrievalFilters } from "@/lib/retrieval/types";

export async function POST(request:Request){
  const body=await request.json().catch(()=>({})) as {query?:string;filters?:RetrievalFilters;page?:number;pageSize?:number};
  if(typeof body.query!=="string"||!body.query.trim()) return NextResponse.json({error:"query is required"},{status:400});
  return NextResponse.json(runSampleRetrieval({query:body.query,mode:"find_all",filters:body.filters,page:body.page,pageSize:body.pageSize??25}));
}

