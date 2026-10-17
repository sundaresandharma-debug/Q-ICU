import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Q-ICU | Predictive Bottleneck-Aware Quantum Optimization",
  description: "Dynamic ICU resource allocation using predictive bottleneck-aware QAOA."
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}