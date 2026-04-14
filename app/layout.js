import { Outfit } from "next/font/google";
import "./globals.css";
import Providers from "./providers";

const outfit = Outfit({ subsets: ["latin"], weight: ["300", "400", "600", "700", "800"] });

export const metadata = {
  title: "Chefy.AI | AI-Powered Recipe Generator",
  description: "Chefy.AI - Generate delicious recipes from ingredients or food photos using AI.",
};

export default function RootLayout({ children }) {
  return (
    <html lang="en" data-theme="dark" suppressHydrationWarning>
      <body className={outfit.className}>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
