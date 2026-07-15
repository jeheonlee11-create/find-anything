export {};
const response = await fetch("http://localhost:3000/v1/search", {method:"POST",headers:{authorization:`Bearer ${process.env.FIND_ANYTHING_API_KEY}`,"content-type":"application/json","x-request-id":crypto.randomUUID()},body:JSON.stringify({query:"scholarship",mode:"best",fileType:"docs",pageSize:20})});
if(!response.ok) throw new Error(`Search failed: ${response.status}`);
const search = await response.json();
console.log({searchId:search.searchId,traceId:search.traceId,receiptId:search.receiptId,totalMatches:search.totalMatches});
