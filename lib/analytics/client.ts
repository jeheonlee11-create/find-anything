"use client";
import type {AnalyticsEventName,AnalyticsProperties} from "./events";
export function trackEvent(name:AnalyticsEventName,properties:AnalyticsProperties={}){try{const key="fa_anonymous_id";let anonymousId=sessionStorage.getItem(key);if(!anonymousId){anonymousId=crypto.randomUUID();sessionStorage.setItem(key,anonymousId)}void fetch("/api/analytics",{method:"POST",headers:{"content-type":"application/json"},keepalive:true,body:JSON.stringify({name,anonymousId,properties:{...properties,timestamp:new Date().toISOString()}})});}catch{/* Analytics must never block the product. */}}
