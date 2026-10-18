import { LegalPage } from "@/components/LegalPage";
import { site } from "@/lib/site";

export const metadata = { title: "Refund Policy" };

export default function RefundsPage() {
  return (
    <LegalPage title="Refund Policy">
      <p>Q-ICU is free to use. We do not take payments, store card details or charge any fees, so there is nothing to refund.</p>
      <h2>If paid features are added</h2>
      <ul>
        <li>The full price, including tax, will be shown before you pay. There will be no fees added at checkout.</li>
        <li>Any subscription will be cancellable from the account page in the same number of steps it took to start.</li>
        <li>You will be able to ask for a full refund within 14 days of a payment.</li>
        <li>This policy will be updated and existing users told by email before any charge applies.</li>
      </ul>
      <p>Questions: <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>.</p>
    </LegalPage>
  );
}
