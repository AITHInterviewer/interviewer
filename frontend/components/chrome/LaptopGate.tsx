"use client";

import { useEffect, useState, type ReactNode } from "react";

export function useIsNarrow(maxWidth = 900) {
  const [narrow, setNarrow] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${maxWidth}px)`);
    const update = () => setNarrow(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, [maxWidth]);
  return narrow;
}

export function LaptopGate({ children }: { children: ReactNode }) {
  const narrow = useIsNarrow(900);
  if (!narrow) return <>{children}</>;
  return (
    <div className="laptop-gate">
      <h1 style={{ fontSize: 28, marginBottom: 12 }}>Откройте с ноутбука</h1>
      <p style={{ color: "var(--ink-secondary)", fontSize: 16 }}>
        Интервью проходит на ноутбуке с микрофоном. На этом устройстве можно только прочитать приглашение и
        прислать ссылку себе на почту.
      </p>
    </div>
  );
}
