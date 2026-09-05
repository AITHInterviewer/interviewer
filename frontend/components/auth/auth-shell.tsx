type AuthShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
};

import { BrandMark } from "@/components/chrome/AppShell";

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: AuthShellProps) {
  return (
    <main className="auth-shell">
      <div className="auth-shell__panel">
        <BrandMark />
        <p className="path">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-title__description">{description}</p>
        {children}
      </div>
    </main>
  );
}
