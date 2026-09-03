"use client";

import Link from "next/link";

import { AppShell, managerNav } from "@/components/chrome/AppShell";
import { PilotBadge } from "@/components/chrome/VersionTag";
import { Button } from "@/components/ui/button";
import { candidates } from "@/lib/demo/candidates";
import { vacancy } from "@/lib/demo/vacancies";

export default function ManagerListPage() {
  return (
    <AppShell nav={managerNav()} title="К встречам">
      <main className="workspace">
        <header className="page-title">
          <div>
            <h1>Кандидаты к встрече</h1>
            <PilotBadge />
          </div>
        </header>
        <table className="vacancies-table">
          <thead>
            <tr>
              <th>Имя</th>
              <th>Вакансия</th>
              <th>Дата</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {candidates.map((item) => (
              <tr key={item.id}>
                <td>{item.name}</td>
                <td>{vacancy.title}</td>
                <td>завтра, 15:00</td>
                <td>
                  <Button asChild variant="secondary">
                    <Link href={`/manager/${item.id}`}>Открыть</Link>
                  </Button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </main>
    </AppShell>
  );
}
