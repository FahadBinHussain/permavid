import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TauriProvider } from './tauri-integration';
import { AuthProvider } from './auth-provider';
import AuthGuard from './auth-guard';

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "PermaVid - Local Video Archiving",
  description: "A tool for downloading and archiving videos locally",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <AuthProvider>
          <TauriProvider>
            <AuthGuard>
              {children}
            </AuthGuard>
          </TauriProvider>
        </AuthProvider>
      </body>
    </html>
  );
}
