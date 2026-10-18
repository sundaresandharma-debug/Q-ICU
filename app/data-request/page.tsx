import Link from "next/link";
import { DataRequestForm } from "./data-request-form";
import { site } from "@/lib/site";

export const metadata = { title: "Data request" };

export default function DataRequestPage() {
  return (
    <div className="wrap">
      <div className="form-page">
        <h1>Ask us to delete or send your data</h1>
        <p>
          If you have an account, the fastest way is the <Link href="/account">account page</Link>: you can download your data
          or delete your account there yourself. Use this form if you cannot sign in, or if your request is about something else.
        </p>
        <p>We reply within 30 days, to the email address you enter. We may ask you to confirm the request from that address.</p>
        <DataRequestForm />
        <p className="form-foot">You can also email <a href={`mailto:${site.contactEmail}`}>{site.contactEmail}</a>.</p>
      </div>
    </div>
  );
}
