import type { Metadata } from "next";
import { THEME_BOOT_SCRIPT } from "./components/demo-look";
import { fontVariables } from "./fonts";
import "./globals.css";

export const metadata: Metadata = {
  title: "RAG Demo",
  description: "Upload documents and chat with them using RAG",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${fontVariables} h-full`} suppressHydrationWarning>
      <head>
        {/* Applies the saved edition before first paint, so there is no flash. */}
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT_SCRIPT }} />
      </head>
      <body className="dl-page min-h-full flex flex-col">{children}</body>
    </html>
  );
}
