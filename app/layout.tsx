import type { Metadata, Viewport } from "next";
import "@fontsource/ibm-plex-sans/400.css";
import "@fontsource/ibm-plex-sans/500.css";
import "@fontsource/ibm-plex-sans/600.css";
import "@fontsource/ibm-plex-mono/400.css";
import "@fontsource/ibm-plex-mono/600.css";
import "./globals.css";
import { SiteHeader } from "@/components/SiteHeader";
import { SiteFooter } from "@/components/SiteFooter";
import { ConsentBanner } from "@/components/ConsentBanner";
import { Telemetry } from "@/components/Telemetry";
import { site } from "@/lib/site";

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: "Q-ICU", template: "%s | Q-ICU" },
  description: "Research prototype that predicts the next ICU resource bottleneck and re-plans only the affected patients with QAOA. Synthetic data only.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f1ede4" };

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <a href="#main" className="skip-link">Skip to main content</a>
        <SiteHeader />
        <main id="main" tabIndex={-1}>{children}</main>
        <SiteFooter />
        <ConsentBanner />
        <Telemetry />
      </body>
    </html>
  );
}
