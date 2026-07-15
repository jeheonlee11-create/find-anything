import { redirect } from "next/navigation";
import { PublicPage } from "@/app/components/public-page";
import { requireBetaChatGPTUser } from "@/app/chatgpt-auth";
import { betaAdminData } from "@/lib/beta/repository";
import { BetaAdminControls } from "@/app/components/beta-admin-controls";
export const dynamic = "force-dynamic";
export default async function BetaAdminPage(){const {access}=await requireBetaChatGPTUser("/admin/beta");if(access.role!=="admin")redirect("/app");const data=await betaAdminData();return <PublicPage badge="Private beta admin" title="Manage the first testers." lede="Invite or disable accounts, inspect feedback and aggregate privacy-safe usage. Document contents are not available here."><BetaAdminControls initialData={data}/></PublicPage>}
