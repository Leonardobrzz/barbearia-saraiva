import type { Metadata } from "next";
import "@/styles/painel.css";

export const metadata: Metadata = {
  title: "Painel · Barbearia Saraiva",
  manifest: "/painel.webmanifest",
  appleWebApp: { capable: true, title: "Painel Saraiva", statusBarStyle: "black-translucent" },
  robots: { index: false },
};

export default function PainelRoot({ children }: { children: React.ReactNode }) {
  return <div className="pn">{children}</div>;
}
