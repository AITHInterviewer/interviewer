"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

import { AppShell, recruiterNav } from "@/components/chrome/AppShell";
import { PageHeader } from "@/components/chrome/PageHeader";
import { Button } from "@/components/ui/button";
import { requirements } from "@/lib/demo/rubric";
import { vacancy } from "@/lib/demo/vacancies";

export default function NewVacancyPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [extracting, setExtracting] = useState(false);
  const [description, setDescription] = useState(
    "Ищем Middle+ Python Developer для команды платформы заказов. Нужны async, SQL, Celery, тестирование.",
  );

  const mandatory = requirements.filter((item) => item.mandatory);
  const optional = requirements.filter((item) => !item.mandatory);

  return (
    <AppShell nav={recruiterNav()} title="Новая вакансия">
      <main className="workspace workspace--form">
        <PageHeader
          path="Вакансии / новая"
          title="Новая вакансия"
          description="Три шага. Извлечение в демо имитируется за 2 секунды."
        />

        {step === 1 ? (
          <section className="form-surface form-panel">
            <label>
              Описание вакансии
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={8} />
            </label>
            <label>
              Название
              <input defaultValue={vacancy.title} />
            </label>
            <label>
              Грейд
              <input defaultValue={vacancy.grade} />
            </label>
            <label>
              Нанимающий менеджер
              <input defaultValue={vacancy.managerName} />
            </label>
            <label>
              Технический эксперт
              <input defaultValue={vacancy.expertName} />
            </label>
            <div className="form-actions">
              <Button
                type="button"
                disabled={extracting}
                onClick={() => {
                  setExtracting(true);
                  window.setTimeout(() => {
                    setExtracting(false);
                    setStep(2);
                  }, 2000);
                }}
              >
                {extracting ? "Извлекаю требования…" : "Извлечь требования"}
              </Button>
              <Button type="button" variant="secondary" onClick={() => router.push("/vacancies")}>
                Отмена
              </Button>
            </div>
          </section>
        ) : null}

        {step === 2 ? (
          <section className="report-grid" style={{ gridTemplateColumns: "1fr 1fr" }}>
            <div className="form-surface">
              <h2>Обязательные требования</h2>
              {mandatory.map((item) => (
                <div key={item.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                  ■ {item.title}
                </div>
              ))}
            </div>
            <div className="form-surface">
              <h2>Желательные</h2>
              {optional.map((item) => (
                <div key={item.id} style={{ padding: "10px 0", borderBottom: "1px solid var(--border)" }}>
                  □ {item.title}
                </div>
              ))}
              <h3 style={{ marginTop: 18 }}>Реальные задачи</h3>
              <ul>
                {vacancy.realTasks.map((task) => (
                  <li key={task}>{task}</li>
                ))}
              </ul>
              <h3>Стек</h3>
              <p>{vacancy.stack.join(", ")}</p>
              <h3>Стоп-факторы</h3>
              <ul>
                {vacancy.stopFactors.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
              <h3>Нужно уточнить у менеджера</h3>
              {vacancy.clarifyWithManager.map((item) => (
                <label key={item} className="consent-row">
                  <input type="checkbox" defaultChecked />
                  <span>{item}</span>
                </label>
              ))}
              <div className="form-actions">
                <Button type="button" variant="secondary" onClick={() => setStep(1)}>
                  Назад
                </Button>
                <Button type="button" onClick={() => setStep(3)}>
                  Перейти к отправке
                </Button>
              </div>
            </div>
          </section>
        ) : null}

        {step === 3 ? (
          <section className="form-surface form-panel">
            <p>Вакансия получит статус «На проверке».</p>
            <div className="form-actions">
              <Button type="button" variant="ghost" onClick={() => setStep(2)}>
                Назад
              </Button>
              <Button variant="secondary" type="button" onClick={() => router.push("/brief/python-middle")}>
                Отправить менеджеру на бриф
              </Button>
              <Button type="button" onClick={() => router.push("/vacancies/python-middle/rubric")}>
                Отправить эксперту на калибровку
              </Button>
              <Button type="button" variant="text" onClick={() => router.push("/vacancies")}>
                Отмена
              </Button>
            </div>
          </section>
        ) : null}
      </main>
    </AppShell>
  );
}
