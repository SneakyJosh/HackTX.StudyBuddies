import type { Metadata } from "next";
import { Fraunces, Manrope } from "next/font/google";
import { DemoProvider } from "@/components/demo-provider";
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
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${manrope.variable} ${fraunces.variable} h-full antialiased`}>
      <body className="flex min-h-dvh flex-col bg-background font-sans text-foreground">
        <DemoProvider>{children}</DemoProvider>
      </body>
    </html>
  );
}
