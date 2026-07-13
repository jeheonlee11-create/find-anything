import { NextResponse } from "next/server";
import { runSampleRetrieval } from "@/lib/retrieval/core";

export async function GET(_request:Request,{params}:{params:Promise<{receiptId:string}>}){const {receiptId}=await params;const response=runSampleRetrieval({query:"air pollution Detroit",mode:"ranked"});return NextResponse.json({...response.receipt,requestedReceiptId:receiptId,notice:"Prototype receipt is generated on request and is not immutable or persisted."});}

