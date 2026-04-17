import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Pokedex Checklist",
  description: "A modern web tracker for building out your Pokedex collection.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

const THEME_BOOTSTRAP = `
try {
  var raw = localStorage.getItem("pokemon-web:v1");
  var theme = "tokyo-night";
  if (raw) {
    var saved = JSON.parse(raw);
    if (saved && saved.theme) theme = saved.theme;
  }
  if (theme && theme !== "auto") {
    document.documentElement.setAttribute("data-theme", theme);
  }
} catch (e) {}
`;

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOTSTRAP }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
