import Link from "next/link";
import { site } from "@/lib/site";
import { CookieSettingsButton } from "./ConsentBanner";

export function SiteFooter() {
  return (
    <footer className="site-footer">
      <div className="wrap footer-grid">
        <div>
          <p className="footer-title">{site.name}</p>
          <p>Research prototype for ICU resource planning. Synthetic data only. Not a medical device and not for clinical decisions.</p>
          <p>Free to use. No paid plans, subscriptions or hidden fees.</p>
        </div>
        <div>
          <p className="footer-title">Operator</p>
          <address>
            {site.legalName}<br />
            {site.postalAddress}<br />
            <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>
          </address>
        </div>
        <nav aria-label="Legal">
          <p className="footer-title">Legal</p>
          <ul className="plain-list">
            <li><Link href="/legal/privacy">Privacy Policy</Link></li>
            <li><Link href="/legal/terms">Terms of Service</Link></li>
            <li><Link href="/legal/cookies">Cookie Policy</Link></li>
            <li><Link href="/legal/refunds">Refund Policy</Link></li>
            <li><Link href="/data-request">Data request</Link></li>
            <li><CookieSettingsButton /></li>
          </ul>
        </nav>
      </div>
      <div className="wrap footer-base">Copyright 2026 {site.legalName}</div>
    </footer>
  );
}
