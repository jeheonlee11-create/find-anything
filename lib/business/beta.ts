export interface BetaInvitation{id:string;emailHash:string;codeHash:string;cohort:string;referrerUserId?:string;seatLimit:number;acceptedCount:number;expiresAt:string;approvedBy?:string;termsVersion:string;status:"pending"|"approved"|"exhausted"|"expired"|"revoked"}
export interface FeatureFlag{key:string;description:string;enabled:boolean;cohorts:string[];securitySensitive:false}
