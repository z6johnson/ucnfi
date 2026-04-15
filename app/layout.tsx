import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Nav } from "@/components/Nav";

export const metadata: Metadata = {
  title: "UCNFI — UC Next Frontier Initiative",
  description:
    "Research, synthesis, and analytics for the UC Next Frontier Initiative Steering Committee.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <body>
        <div className="mx-auto max-w-[1200px] px-6 md:px-10">
          <Nav />
          <main className="pb-24">{children}</main>
          <footer className="hairline mt-16 flex items-center justify-between py-6">
            <span className="label">UC Next Frontier Initiative</span>
            <span className="label">UCNFI Baseline · v0.6.0</span>
          </footer>
        </div>
      </body>
    </html>
  );
}
