import Link from "next/link";
import { SignupForm } from "./signup-form";
import { AuthUnavailable } from "@/components/AuthUnavailable";
import { isSupabaseConfigured } from "@/lib/supabase/env";

export const metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <div className="wrap">
      <div className="form-page">
        <h1>Create an account</h1>
        <p>An account lets you save scenarios and come back to them. We only ask for an email address and a password.</p>
        {isSupabaseConfigured ? <SignupForm /> : <AuthUnavailable />}
        <p className="form-foot">Already have an account? <Link href="/login">Sign in</Link></p>
      </div>
    </div>
  );
}
