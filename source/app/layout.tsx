import type { Metadata } from "next";
import "./globals.css";
import "./brand.css";

const favicon = `${process.env.NEXT_PUBLIC_BASE_PATH ?? ""}/favicon.svg`;

export const metadata: Metadata = {
  title: "منشئ عروض الأسعار",
  description: "إنشاء وتخصيص وتصدير عروض الأسعار بصيغة PDF.",
  icons: {
    icon: favicon,
    shortcut: favicon,
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl">
      <body className="antialiased">{children}</body>
    </html>
  );
}
