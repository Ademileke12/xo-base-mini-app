// app/layout.tsx
import type { Metadata, Viewport } from 'next';
import type { ReactNode } from 'react';
import { Geist, Geist_Mono } from 'next/font/google';
import './globals.css';
import { Providers } from './providers';

const geistSans = Geist({
  variable: '--font-geist-sans',
  subsets: ['latin'],
});

const geistMono = Geist_Mono({
  variable: '--font-geist-mono',
  subsets: ['latin'],
});

// 🔁 Replace this with your real deployed URL (Vercel, etc.)
const APP_URL = 'https://xo-base-mini-appv1.vercel.app/';

export const metadata: Metadata = {
  title: {
    default: 'X & O – Base Mini Game',
    template: '%s | X & O',
  },
  description: 'Onchain Tic-Tac-Toe built as a Base mini app. Connect your Base wallet, play, and track your wins by wallet address.',
  metadataBase: new URL(APP_URL),
  openGraph: {
    title: 'X & O – Base Mini Game',
    description:
      'Onchain Tic-Tac-Toe on Base. Connect your wallet, play vs AI, locally or online, and climb the leaderboard.',
    url: APP_URL,
    siteName: 'X & O',
    images: [
      {
        // Put an image at public/og-image.png or change this path
        url: 'https://i.postimg.cc/wTW0YVP5/X-O.png',
        width: 1200,
        height: 630,
        alt: 'X & O on Base',
      },
    ],
    type: 'website',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'X & O – Base Mini Game',
    description:
      'Onchain Tic-Tac-Toe on Base. Connect your wallet, play, and earn wins.',
    images: ['/og-image.png'],
  },
};

// Better mobile scaling for mini-app / in-app browser environments
export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({
  children,
}: Readonly<{
  children: ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
