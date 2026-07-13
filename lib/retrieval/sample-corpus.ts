import type { ExtractedUnit, PermissionSnapshot, SourceFile } from "./types";

export const SAMPLE_WORKSPACE_ID = "ws_synthetic_demo";
export const SAMPLE_ACTOR_ID = "actor_demo_user";
const modifiedAt = "2026-07-11T14:22:10Z";

function statusFor(index:number):Pick<SourceFile,"indexStatus"|"extractionStatus"> {
  if(index===58 || index===103) return {indexStatus:"awaiting_index",extractionStatus:"partial"};
  if(index===59 || index===104) return {indexStatus:"failed",extractionStatus:"failed"};
  return {indexStatus:"indexed",extractionStatus:"complete"};
}

function makeFile(index:number,kind:"document"|"presentation"|"spreadsheet"|"pdf"):SourceFile {
  const id=`demo_${kind}_${String(index+1).padStart(3,"0")}`;
  const mimeType=kind==="document"?"application/vnd.google-apps.document":kind==="presentation"?"application/vnd.google-apps.presentation":kind==="spreadsheet"?"application/vnd.google-apps.spreadsheet":"application/pdf";
  const name=kind==="document"?`Detroit Air Pollution Research Note ${String(index+1).padStart(2,"0")}`:kind==="presentation"?`Air Quality Presentation ${String(index-39).padStart(2,"0")}`:kind==="spreadsheet"?`Air Sensor Measurements ${String(index-49).padStart(2,"0")}`:`Environmental Justice Report ${String(index-59).padStart(2,"0")}`;
  return {id,workspaceId:SAMPLE_WORKSPACE_ID,source:"google_drive",name,mimeType,owner:index%2?"Jordan Lee":"Maya Chen",folder:kind==="document"?"/Research/Detroit":kind==="presentation"?"/Research/Slides":kind==="spreadsheet"?"/Research/Data":"/Research/Reports",modifiedAt,versionId:`ver_${id}`,permissionSnapshotId:`perm_${id}`,...statusFor(index),unitCount:statusFor(index).indexStatus==="indexed"?1:0};
}

export const sampleFiles:SourceFile[]=[
  ...Array.from({length:60},(_,i)=>makeFile(i,"document")),
  ...Array.from({length:15},(_,i)=>makeFile(i+60,"presentation")),
  ...Array.from({length:15},(_,i)=>makeFile(i+75,"spreadsheet")),
  ...Array.from({length:15},(_,i)=>makeFile(i+90,"pdf")),
];

export const sampleUnits:ExtractedUnit[]=sampleFiles.filter(file=>file.indexStatus==="indexed").map((file,index)=>{
  const isDoc=file.mimeType.includes("document"),isSlides=file.mimeType.includes("presentation"),isSheet=file.mimeType.includes("spreadsheet");
  const location:ExtractedUnit["location"]=isDoc?{type:"document_paragraph",paragraphStart:47+index,paragraphEnd:51+index,headingPath:["Detroit measurements"]}:isSlides?{type:"slide",slideNumber:(index%15)+1,includesSpeakerNotes:true}:isSheet?{type:"spreadsheet_range",sheetName:"Measurements",range:`B${index+2}:F${index+10}`}:{type:"pdf_page",pageNumber:(index%12)+1};
  return {id:`unit_${file.id}`,fileId:file.id,fileVersionId:file.versionId,unitType:isDoc?"paragraph":isSlides?"speaker_notes":isSheet?"cell_range":"page",location,text:`Synthetic demo evidence about air pollution, Detroit PM1 measurements, environmental justice, emissions, and atmospheric conditions. Record ${index+1} is fictional and exists only to test complete pagination and structural citations.`,metadata:{synthetic:true,topic:"air pollution Detroit"},extractionStatus:"complete",checksum:`sha256:synthetic-${index+1}`};
});

export const samplePermissions:PermissionSnapshot[]=sampleFiles.map(file=>({id:file.permissionSnapshotId,fileId:file.id,actorId:SAMPLE_ACTOR_ID,status:"allowed",reason:"Allowed only inside the synthetic demo workspace.",capturedAt:modifiedAt,sourcePermissionVersion:"demo-v2"}));
