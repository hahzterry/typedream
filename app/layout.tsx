import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { HarnessProvider } from "@/components/HarnessProvider";
import { Nav } from "@/components/Nav";

const geistSans = Geist({ variable: "--font-geist-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Seedance Harness",
  description: "Anime production harness for Seedance",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col">
        <HarnessProvider>
          <Nav />
          <main className="flex-1 px-4 md:px-6 py-5 max-w-[1500px] w-full mx-auto">{children}</main>
        </HarnessProvider>
      </body>
    </html>
  );
}
