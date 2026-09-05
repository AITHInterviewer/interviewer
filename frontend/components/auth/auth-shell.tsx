type AuthShellProps = {
  eyebrow: string;
  title: string;
  description: string;
  children: React.ReactNode;
};

export function AuthShell({
  eyebrow,
  title,
  description,
  children,
}: AuthShellProps) {
  return (
    <main className="auth-shell">
      <div className="auth-shell__panel">
        <p className="path">{eyebrow}</p>
        <h1>{title}</h1>
        <p className="page-title__description">{description}</p>
        {children}
      </div>
    </main>
  );
}
