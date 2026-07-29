import { redirect } from "next/navigation";
import { APP_BASE_PATH } from "@/lib/config/urls";

/**
 * Compatibility redirect. The product used to be addressed as a separate app
 * host where workspaces lived at `/workspaces`. The site and the product are now
 * one origin with the product under `/app`, so old links are forwarded instead
 * of 404ing. Authorization is unchanged: the target route still requires
 * platform identity and beta access.
 */
export default function LegacyWorkspaces() {
  redirect(APP_BASE_PATH);
}
