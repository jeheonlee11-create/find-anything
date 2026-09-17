import {pkceChallenge,randomToken} from "./crypto";
import {requireGoogleDriveEnvironment} from "@/lib/config/server-env";
// Per-file scope: Find Anything can only reach files the user explicitly
// shares with it through Google's picker (plus files it creates, which it
// never does). Non-sensitive per Google's Drive scope tiers, so no restricted
// -scope verification or security assessment is required to go public.
export const DRIVE_SCOPE="https://www.googleapis.com/auth/drive.file";
export interface OAuthConfiguration{clientId:string;clientSecret:string;redirectUri:string}
export function googleOAuthConfig():OAuthConfiguration{const {clientId,clientSecret,redirectUri}=requireGoogleDriveEnvironment();return{clientId,clientSecret,redirectUri}}
export async function createAuthorizationRequest(){const config=googleOAuthConfig(),state=randomToken(),verifier=randomToken(48),challenge=await pkceChallenge(verifier);const url=new URL("https://accounts.google.com/o/oauth2/v2/auth");url.search=new URLSearchParams({client_id:config.clientId,redirect_uri:config.redirectUri,response_type:"code",scope:DRIVE_SCOPE,access_type:"offline",prompt:"consent",include_granted_scopes:"true",state,code_challenge:challenge,code_challenge_method:"S256"}).toString();return{url:url.toString(),state,verifier}}
export interface GoogleTokenResponse{access_token:string;expires_in:number;refresh_token?:string;scope:string;token_type:string;id_token?:string}
export class GoogleOAuthError extends Error {
  constructor(
    public readonly code: "invalid_grant" | "revoked" | "temporarily_unavailable" | "token_error",
    public readonly retryable: boolean,
  ) {
    super(`GOOGLE_OAUTH_${code.toUpperCase()}`);
  }
}
export async function exchangeAuthorizationCode(code:string,verifier:string){const config=googleOAuthConfig();const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,redirect_uri:config.redirectUri,grant_type:"authorization_code",code,code_verifier:verifier})});if(!response.ok)throw new Error(`Google token exchange failed (${response.status})`);return response.json() as Promise<GoogleTokenResponse>}
export async function refreshAccessToken(refreshToken:string){const config=googleOAuthConfig();const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,grant_type:"refresh_token",refresh_token:refreshToken})});if(!response.ok){const body=await response.json().catch(()=>({})) as {error?:string};const code=body.error==="invalid_grant"?"invalid_grant":response.status>=500||response.status===429?"temporarily_unavailable":"token_error";throw new GoogleOAuthError(code,code==="temporarily_unavailable")}return response.json() as Promise<GoogleTokenResponse>}
export async function revokeGoogleToken(token:string){const response=await fetch("https://oauth2.googleapis.com/revoke",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams({token})});if(!response.ok&&response.status!==400)throw new Error(`Google token revocation failed (${response.status})`)}
