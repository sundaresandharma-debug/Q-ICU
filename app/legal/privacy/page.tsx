import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { site } from "@/lib/site";

export const metadata = { title: "Privacy Policy" };

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>This policy explains what Q-ICU collects, why, how long we keep it and how you can have it deleted. We collect as little as the service needs to work.</p>

      <h2>Who we are</h2>
      <p>{site.legalName}, {site.postalAddress}. Contact: <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>.</p>

      <h2>What we collect</h2>
      <table>
        <thead><tr><th scope="col">Data</th><th scope="col">Why</th><th scope="col">Kept for</th></tr></thead>
        <tbody>
          <tr><td>Email address and a hashed password</td><td>To create your account and sign you in</td><td>Until you delete your account</td></tr>
          <tr><td>Display name (optional)</td><td>Shown to you in your account</td><td>Until you change it or delete your account</td></tr>
          <tr><td>The date you accepted these terms and confirmed you are {site.minimumAge} or older, and the policy version</td><td>Proof of consent</td><td>Until you delete your account</td></tr>
          <tr><td>Scenarios you save (synthetic patient records and resource counts)</td><td>So you can reload them</td><td>Until you delete them or your account</td></tr>
          <tr><td>Page path and referring website, only if you allow analytics</td><td>To count visits to each page</td><td>90 days</td></tr>
          <tr><td>Error reports: message, page path, code location</td><td>To find and fix bugs</td><td>90 days</td></tr>
          <tr><td>A one-way hash of your IP address</td><td>To limit abuse (rate limiting)</td><td>1 day</td></tr>
          <tr><td>Email and message from the data request form</td><td>To answer your request</td><td>1 year after the request is closed</td></tr>
        </tbody>
      </table>
      <p>We do not collect your location, contacts, device identifiers or advertising IDs. We do not store raw IP addresses. We do not sell or share data for advertising.</p>

      <h2>Patient records you enter</h2>
      <p>
        Q-ICU is for synthetic or fully de-identified data only. Patient IDs must be short codes such as P001, and the form rejects names and email addresses.
        Records you send to the optimizer are processed in memory and are not stored by the optimizer service. They are only stored if you save a scenario.
      </p>

      <h2>Children</h2>
      <p>
        Accounts are for people aged {site.minimumAge} and over, and sign-up requires you to confirm this. We do not knowingly collect personal data from children.
        Do not enter data about real patients of any age, and in particular about minors. If you believe a child has given us personal data, contact us and we will delete it.
      </p>

      <h2>Legal basis</h2>
      <p>Account data and saved scenarios: to provide the service you asked for. Analytics: your consent, which you can withdraw at any time from Cookie settings in the footer. Error reports and rate limiting: our legitimate interest in keeping the service secure and working.</p>

      <h2>Who processes data for us</h2>
      <ul>
        <li>Supabase: database and sign-in. Stores account data, scenarios and the logs above.</li>
        <li>Vercel: hosts the website.</li>
        <li>The optimizer host we deploy the Python service on: processes optimizer requests in memory.</li>
      </ul>
      <p>These providers may process data outside your country under their standard contractual safeguards. See the <Link href="/legal/cookies">Cookie Policy</Link> for the list of cookies.</p>

      <h2>Your rights</h2>
      <ul>
        <li>Access and portability: download your data from the <Link href="/account">account page</Link>.</li>
        <li>Deletion: delete your account from the account page. Your profile and scenarios are removed straight away. Encrypted backups are overwritten within 30 days.</li>
        <li>Correction, objection or anything else: use the <Link href="/data-request">data request form</Link> or email us. We reply within 30 days.</li>
        <li>You may also complain to your local data protection authority.</li>
      </ul>

      <h2>Security</h2>
      <p>Traffic is encrypted with HTTPS. Every database table uses row level security, so each account can only read its own rows. Secret keys are kept on the server and never sent to your browser.</p>

      <h2>Changes</h2>
      <p>If we change this policy we will update the date above. If a change affects how we use data you have already given us, we will ask you again before it applies.</p>
    </LegalPage>
  );
}
