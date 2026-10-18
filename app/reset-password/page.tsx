import Link from "next/link";
import { ResetForm } from "./reset-form";
import { AuthUnavailable } from "@/components/AuthUnavailable";
import { getCurrentUser } from "@/lib/supabase/server";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata = { title: "Choose a new password" };

export default async function ResetPasswordPage() {
  const { user } = await getCurrentUser();
  return (
    <div className="wrap">
      <div className="form-page">
        <h1>Choose a new password</h1>
        {!isSupabaseConfigured ? <AuthUnavailable /> : user ? <ResetForm /> : (
          <div className="alert alert-error" role="alert">
            <p>This reset link has expired or was already used. <Link href="/forgot-password">Request a new link</Link>.</p>
          </div>
        )}
      </div>
    </div>
  );
}
