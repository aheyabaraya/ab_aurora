import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "AB_Aurora",
  description: "Brand Persona Director Agent"
};

type RootLayoutProps = Readonly<{
  children: React.ReactNode;
}>;

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
