import Link from "next/link";
import { ForgotForm } from "./forgot-form";
import { AuthUnavailable } from "@/components/AuthUnavailable";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata = { title: "Reset password" };

export default function ForgotPasswordPage() {
  return (
    <div className="wrap">
      <div className="form-page">
        <h1>Reset your password</h1>
        <p>Enter the email you signed up with. We will send you a link to choose a new password.</p>
        {isSupabaseConfigured ? <ForgotForm /> : <AuthUnavailable />}
        <p className="form-foot"><Link href="/login">Back to sign in</Link></p>
      </div>
    </div>
  );
}
