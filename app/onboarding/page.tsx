import { redirect } from "next/navigation";
import { OnboardingFlow } from "./onboarding-flow";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata = { title: "Get started" };

export default async function OnboardingPage() {
  const { supabase, user } = await getCurrentUser();
  if (!supabase || !user) redirect("/login?next=/onboarding");
  const { data: profile } = await supabase.from("profiles").select("display_name, onboarded_at").eq("id", user.id).maybeSingle();
  if (profile?.onboarded_at) redirect("/dashboard");
  return (
    <div className="wrap">
      <div className="form-page">
        <OnboardingFlow initialName={profile?.display_name ?? ""} />
      </div>
    </div>
  );
}
