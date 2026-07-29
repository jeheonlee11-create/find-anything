/**
 * The single decision point for "may this identified person enter the connect
 * journey?".
 *
 * Find Anything is invite-only during the controlled beta. Every caller — the
 * `/connect` navigation route and the Google Drive connect API — asks this one
 * function and treats a denial as "route to the honest invite-only fallback".
 * Nothing else in the codebase decides connect eligibility.
 *
 * REMOVING THE INVITE GATE LATER IS A ONE-PLACE CHANGE: make
 * `resolveConnectAccess` always return an `allowed: true` result (or delete this
 * module and its two call sites). No caller needs restructuring, because none of
 * them branch on *why* access was denied.
 *
 * The denial result deliberately carries no provider-side detail. It never
 * reveals whether an email exists, was invited, expired, or is configured as a
 * Google Cloud test user.
 */
import {
  pseudonymousActorId,
  type AuthenticatedActor,
} from "@/lib/auth/api-authorization";
import { betaAccess } from "@/lib/beta/repository";

/** Honest, non-revealing fallback for anyone the gate denies. */
export const INVITE_ONLY_FALLBACK_PATH = "/beta/access-required";

/** Non-revealing API error for a denied but authenticated actor. */
export const CONNECT_ACCESS_DENIED = {
  code: "CONNECT_ACCESS_REQUIRED",
  message:
    "Connecting Google Drive is limited to invited testers during the controlled beta.",
} as const;

export type ConnectAccess =
  | {
      allowed: true;
      actor: AuthenticatedActor;
      role: string | null;
      onboardingComplete: boolean;
    }
  | { allowed: false; actor: AuthenticatedActor; fallbackPath: string };

/** Derives the pseudonymous actor identity used for every authorization check. */
export async function connectActor(email: string): Promise<AuthenticatedActor> {
  const normalized = email.trim().toLowerCase();
  return { actorId: await pseudonymousActorId(normalized), email: normalized };
}

export async function resolveConnectAccess(
  input: AuthenticatedActor | { email: string },
): Promise<ConnectAccess> {
  const actor =
    "actorId" in input ? input : await connectActor(input.email);
  const access = await betaAccess(actor);
  if (!access.allowed)
    return { allowed: false, actor, fallbackPath: INVITE_ONLY_FALLBACK_PATH };
  return {
    allowed: true,
    actor,
    role: access.role,
    onboardingComplete: access.onboardingComplete,
  };
}
