import Link from "next/link";
import { LegalPage } from "@/components/LegalPage";
import { site } from "@/lib/site";

export const metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p>These terms apply when you use Q-ICU. By creating an account you agree to them.</p>

      <h2>What Q-ICU is</h2>
      <p>Q-ICU is a research and demonstration prototype built for a hackathon. It shows a method for planning ICU resources with a quantum optimization algorithm run on a simulator.</p>

      <h2>Not for clinical use</h2>
      <p>
        Q-ICU is not a medical device, has not been clinically validated and must not be used to make or support decisions about real patients.
        Its risk scores come from a model trained on synthetic data.
      </p>

      <h2>Your account</h2>
      <ul>
        <li>You must be {site.minimumAge} or older.</li>
        <li>Keep your password private. You are responsible for activity on your account.</li>
        <li>You can delete your account at any time from the <Link href="/account">account page</Link>.</li>
      </ul>

      <h2>Acceptable use</h2>
      <ul>
        <li>Only enter synthetic or fully de-identified records. Never enter data that identifies a real person.</li>
        <li>Do not try to break, overload or get around the security or rate limits of the service.</li>
        <li>Do not use the service to break any law.</li>
      </ul>
      <p>We may suspend accounts that break these rules. Where we can, we will tell you why first.</p>

      <h2>Your content</h2>
      <p>Scenarios you save remain yours. You give us permission to store and process them only to run the service for you.</p>

      <h2>Price</h2>
      <p>Q-ICU is free. There are no paid plans, trials that turn into subscriptions, or hidden fees. See the <Link href="/legal/refunds">Refund Policy</Link>.</p>

      <h2>Availability and warranty</h2>
      <p>The service is provided as it is, without any warranty. It may change, pause or stop. Results may contain errors. We will give reasonable notice before shutting the service down so you can download your data.</p>

      <h2>Liability</h2>
      <p>To the extent the law allows, we are not liable for indirect or consequential loss arising from use of the prototype. Nothing in these terms limits liability that cannot be limited by law.</p>

      <h2>Changes and contact</h2>
      <p>We will post changes on this page and update the date above. These terms are governed by the laws of {site.jurisdiction}. Questions: <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>.</p>
    </LegalPage>
  );
}
