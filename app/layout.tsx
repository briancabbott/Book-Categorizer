import type { Metadata } from "next";
import { headers } from "next/headers";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  const requestHeaders = await headers();
  const host = requestHeaders.get("x-forwarded-host") || requestHeaders.get("host") || "localhost:3000";
  const protocol = host.includes("localhost") ? "http" : "https";
  const metadataBase = new URL(`${protocol}://${host}`);
  return {
    metadataBase,
    title: "Librarian — Every book in its right place",
    description: "Photograph a book and discover exactly where it belongs in your growing home library.",
    icons: { icon: "/favicon.svg" },
    openGraph: {
      title: "Librarian",
      description: "Every book has a right place.",
      type: "website",
      images: [{ url: "/og.png", width: 1731, height: 909, alt: "Librarian — Every book has a right place." }],
    },
    twitter: { card: "summary_large_image", images: ["/og.png"] },
  };
}

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="en"><body>{children}</body></html>;
}
