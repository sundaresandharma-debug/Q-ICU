import Link from "next/link";
import { Logo } from "./Logo";
import { getCurrentUser } from "@/lib/supabase/server";

export async function SiteHeader() {
  const { user } = await getCurrentUser();
  return (
    <header className="site-header">
      <div className="wrap site-header-inner">
        <Link href="/" className="brand-link" aria-label="Q-ICU home"><Logo /></Link>
        <nav aria-label="Main">
          <ul className="nav-list">
            <li><Link href="/demo">Demo</Link></li>
            {user ? (
              <>
                <li><Link href="/dashboard">Dashboard</Link></li>
                <li><Link href="/account">Account</Link></li>
                <li>
                  <form action="/auth/signout" method="post">
                    <button type="submit" className="link-button">Sign out</button>
                  </form>
                </li>
              </>
            ) : (
              <>
                <li><Link href="/login">Sign in</Link></li>
                <li><Link href="/signup" className="nav-cta">Create account</Link></li>
              </>
            )}
          </ul>
        </nav>
      </div>
    </header>
  );
}
