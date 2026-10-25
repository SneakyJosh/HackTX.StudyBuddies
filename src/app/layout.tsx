import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { DemoProvider } from "@/components/demo-provider";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "StudySync",
    template: "%s · StudySync",
  },
  description: "Find a study partner at a public campus building using labeled demo accounts.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="flex min-h-dvh flex-col bg-background font-sans text-foreground">
        <DemoProvider>{children}</DemoProvider>
      </body>
    </html>
  );
}
