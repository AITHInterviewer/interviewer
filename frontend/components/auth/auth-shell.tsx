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
      <div className="page-title">
        <div>
          <p className="path">{eyebrow}</p>
          <h1>{title}</h1>
          <p className="page-title__description">{description}</p>
        </div>
      </div>

      <section className="auth-grid auth-grid--single">
        <div className="auth-panel">{children}</div>
      </section>
    </main>
  );
}
