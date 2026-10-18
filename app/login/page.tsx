import Link from "next/link";
import { LoginForm } from "./login-form";
import { AuthUnavailable } from "@/components/AuthUnavailable";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { safeNext } from "@/lib/validation";

export const metadata = { title: "Sign in" };

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <div className="wrap">
      <div className="form-page">
        <h1>Sign in</h1>
        {sp.reset === "1" && <div className="alert alert-success" role="status"><p>Your password has been changed. Sign in with the new one.</p></div>}
        {sp.deleted === "1" && <div className="alert alert-success" role="status"><p>Your account and saved data have been deleted.</p></div>}
        {isSupabaseConfigured ? <LoginForm next={safeNext(sp.next)} /> : <AuthUnavailable />}
        <p className="form-foot">New to Q-ICU? <Link href="/signup">Create an account</Link></p>
      </div>
    </div>
  );
}
