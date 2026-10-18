import { redirect } from "next/navigation";
import { ICUTool } from "@/components/icu/ICUTool";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata = { title: "Dashboard" };

export default async function DashboardPage() {
  const { supabase, user } = await getCurrentUser();
  if (!supabase || !user) redirect("/login?next=/dashboard");
  const { data: profile } = await supabase.from("profiles").select("onboarded_at").eq("id", user.id).maybeSingle();
  if (!profile?.onboarded_at) redirect("/onboarding");
  return <ICUTool mode="account" />;
}
