import Link from "next/link";
import { redirect } from "next/navigation";
import { AccountSettings } from "./account-settings";
import { getCurrentUser } from "@/lib/supabase/server";

export const metadata = { title: "Account" };

export default async function AccountPage() {
  const { supabase, user } = await getCurrentUser();
  if (!supabase || !user) redirect("/login?next=/account");
  const { data: profile } = await supabase.from("profiles")
    .select("display_name, terms_version, terms_accepted_at, created_at").eq("id", user.id).maybeSingle();
  const { count } = await supabase.from("scenarios").select("id", { count: "exact", head: true });

  return (
    <div className="wrap page">
      <h1>Account</h1>
      <dl className="figures" style={{ marginBottom: 28 }}>
        <div className="figure"><dt>Email</dt><dd style={{ fontSize: 16 }}>{user.email}</dd></div>
        <div className="figure"><dt>Member since</dt><dd style={{ fontSize: 16 }}>{new Date(profile?.created_at ?? user.created_at).toLocaleDateString("en-GB")}</dd></div>
        <div className="figure"><dt>Saved scenarios</dt><dd style={{ fontSize: 16 }}>{count ?? 0}</dd></div>
        <div className="figure"><dt>Terms accepted</dt><dd style={{ fontSize: 16 }}>Version {profile?.terms_version ?? "unknown"}</dd></div>
      </dl>
      <AccountSettings initialName={profile?.display_name ?? ""} email={user.email ?? ""} />
      <section className="section">
        <h2>Password</h2>
        <p>To change your password we email you a secure link.</p>
        <Link href="/forgot-password" className="btn">Change password</Link>
      </section>
    </div>
  );
}
