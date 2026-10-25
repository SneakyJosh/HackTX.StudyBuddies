import type { Metadata, Viewport } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { DemoProvider } from "@/components/demo-provider";
import { PwaRegister } from "@/components/pwa-register";
import "./globals.css";

const manrope = Manrope({
  variable: "--font-manrope",
  subsets: ["latin"],
  display: "swap",
});

const fraunces = Fraunces({
  variable: "--font-fraunces",
  subsets: ["latin"],
  display: "swap",
});

export const metadata: Metadata = {
  applicationName: "StudyBuddie",
  title: {
    default: "StudyBuddie",
    template: "%s · StudyBuddie",
  },
  description: "StudyBuddie helps you find a study partner at a public campus building.",
  appleWebApp: {
    capable: true,
    title: "StudyBuddie",
    statusBarStyle: "default",
  },
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
  icons: {
    icon: [
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#ff8a1f",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${manrope.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="flex min-h-dvh max-w-full flex-col overflow-x-clip bg-background font-sans text-foreground">
        <PwaRegister />
        <DemoProvider>{children}</DemoProvider>
      </body>
    </html>
  );
}
