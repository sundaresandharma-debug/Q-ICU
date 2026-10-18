import { LegalPage } from "@/components/LegalPage";
import { CookieSettingsButton } from "@/components/ConsentBanner";

export const metadata = { title: "Cookie Policy" };

export default function CookiesPage() {
  return (
    <LegalPage title="Cookie Policy">
      <p>Q-ICU uses as few cookies as possible. We use no advertising or cross-site tracking cookies, and we load no third-party scripts.</p>
      <h2>Cookies we set</h2>
      <table>
        <thead><tr><th scope="col">Name</th><th scope="col">Purpose</th><th scope="col">Type</th><th scope="col">Lasts</th></tr></thead>
        <tbody>
          <tr><td><code>sb-*-auth-token</code></td><td>Keeps you signed in. Only set when you sign in.</td><td>Strictly necessary</td><td>Until you sign out, at most 400 days</td></tr>
          <tr><td><code>qicu_consent</code></td><td>Remembers your cookie choice.</td><td>Strictly necessary</td><td>180 days</td></tr>
        </tbody>
      </table>
      <h2>Analytics</h2>
      <p>
        If you allow analytics, your browser sends us the path of each page you open and the website that linked you here. This uses no cookie and no identifier,
        and we do not store your IP address. If your browser sends a Global Privacy Control signal, analytics stays off unless you turn it on.
      </p>
      <h2>Change your choice</h2>
      <p>You can change your choice at any time. <CookieSettingsButton /></p>
    </LegalPage>
  );
}
