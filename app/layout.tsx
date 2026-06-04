import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { SafeArea } from "@coinbase/onchainkit/minikit";
import { minikitConfig } from "@/minikit.config";
import { RootProvider } from "./rootProvider";
import "./globals.css";

export async function generateMetadata(): Promise<Metadata> {
  return {
    title: minikitConfig.miniapp.name,
    description: minikitConfig.miniapp.description,
    twitter: {
      card: "summary_large_image",
      creator: "@lrifton6240",
      site: "@lrifton6240",
    },
    other: {
      // Talent Protocol project ownership proof (public token, served in <head>).
      "talentapp:project_verification":
        "ed7969268c0c7330a9dc6ee3535de995d5cf16f1c3498a958e7937fa4d57b26f270b8ad1e4e7cf56426d7fea40ac592f66ae4e00ef429db3d25d35b4a79b21ee",
      "fc:miniapp": JSON.stringify({
        version: minikitConfig.miniapp.version,
        imageUrl: minikitConfig.miniapp.heroImageUrl,
        button: {
          title: `Launch ${minikitConfig.miniapp.name}`,
          action: {
            name: `Launch ${minikitConfig.miniapp.name}`,
            type: "launch_miniapp",
          },
        },
      }),
    },
  };
}

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
  display: "swap",
});

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const locale = await getLocale();
  const messages = await getMessages();
  return (
    <RootProvider>
      <html lang={locale}>
        <body className={`${inter.variable} ${jetbrainsMono.variable}`}>
          <NextIntlClientProvider locale={locale} messages={messages}>
            <SafeArea>{children}</SafeArea>
          </NextIntlClientProvider>
        </body>
      </html>
    </RootProvider>
  );
}
