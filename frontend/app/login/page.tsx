"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { BrandMark } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { Modal } from "@/components/evidence/Drawer";
import { Button } from "@/components/ui/button";
import { demoRoles, roleCardLabel } from "@/lib/demo/roles";
import { setDemoRole } from "@/lib/demo/session";
import type { DemoRole } from "@/lib/demo/types";

export default function LoginPage() {
  const router = useRouter();
  const [selected, setSelected] = useState<DemoRole | null>(null);

  function closeOnboarding() {
    setSelected(null);
  }

  function continueWithRole(role: DemoRole) {
    setDemoRole(role.id);
    router.push(role.homePath);
  }

  return (
    <main className="workspace workspace--form">
      <BrandMark />
      <PageHeader
        path="демо-вход"
        title="Вход"
        description="Демо доказательного интервью. Настоящая почта не нужна — письма наружу не уходят."
      />
      <div className="login-grid">
        {demoRoles.map((role) => (
          <button
            className="login-card"
            key={role.id}
            type="button"
            onClick={() => setSelected(role)}
          >
            <strong className="login-card__title">{roleCardLabel(role)}</strong>
            <span className="login-card__see">{role.cardLine}</span>
            <span className="login-card__cta">Открыть</span>
          </button>
        ))}
      </div>
      <p className="login-note">Пометка: демо. Письма наружу не уходят.</p>

      <Modal
        open={Boolean(selected)}
        title={selected ? roleCardLabel(selected) : "Роль"}
        onClose={closeOnboarding}
      >
        {selected ? (
          <div className="login-onboarding">
            <p>{selected.onboarding.who}</p>
            <p>{selected.onboarding.willSee}</p>
            <p>{selected.onboarding.firstAction}</p>
            <div className="form-actions">
              <Button type="button" onClick={() => continueWithRole(selected)}>
                {selected.onboarding.continueLabel}
              </Button>
              <Button type="button" variant="secondary" onClick={closeOnboarding}>
                {selected.onboarding.backLabel}
              </Button>
            </div>
          </div>
        ) : null}
      </Modal>
    </main>
  );
}
