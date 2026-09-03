import Link from "next/link";

import { Button } from "@/components/ui/button";
import { vacancy } from "@/lib/demo/vacancies";

export default function ExpiredLinkPage() {
  return (
    <main className="workspace workspace--form">
      <p className="path">ссылка</p>
      <h1>Срок прохождения закончился</h1>
      <p className="page-title__description">
        Срок прохождения закончился 8 сентября. Напишите рекрутеру: {vacancy.recruiterEmail}
      </p>
      <Button asChild variant="secondary">
        <Link href="/login">Вернуться ко входу</Link>
      </Button>
    </main>
  );
}
