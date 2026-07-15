import os, requests, uuid
response = requests.post("http://localhost:3000/v1/search", headers={"Authorization":f"Bearer {os.environ['FIND_ANYTHING_API_KEY']}","X-Request-ID":str(uuid.uuid4())}, json={"query":"scholarship","mode":"best","fileType":"docs","pageSize":20}, timeout=30)
response.raise_for_status()
search = response.json()
print({key: search[key] for key in ("searchId", "traceId", "receiptId", "totalMatches")})
