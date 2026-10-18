import Link from "next/link";

export const metadata = { title: "Link not valid" };

export default function AuthErrorPage() {
  return (
    <div className="wrap">
      <div className="form-page">
        <h1>This link did not work</h1>
        <p>Links from our emails work once and expire after a while. It may also have been opened in a different browser from the one you signed up in.</p>
        <div className="btn-row">
          <Link href="/login" className="btn btn-primary">Sign in</Link>
          <Link href="/forgot-password" className="btn">Request a new reset link</Link>
        </div>
      </div>
    </div>
  );
}
