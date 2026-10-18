/**
 * Business details shown in the footer and in the legal pages.
 * Fill these in (or set the env vars) before a public launch.
 */
export const site = {
  name: "Q-ICU",
  url: process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000",
  legalName: process.env.NEXT_PUBLIC_LEGAL_NAME || "Q-ICU project team",
  contactEmail: process.env.NEXT_PUBLIC_CONTACT_EMAIL || "privacy@q-icu.example",
  postalAddress: process.env.NEXT_PUBLIC_POSTAL_ADDRESS || "Postal address available on request",
  jurisdiction: process.env.NEXT_PUBLIC_JURISDICTION || "India",
  /** Bump when a policy changes. New sign-ups record the version they accepted. */
  termsVersion: "2026-10-18",
  privacyVersion: "2026-10-18",
  policyEffectiveDate: "18 October 2026",
  minimumAge: 18,
};
