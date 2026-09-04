import Link from "next/link";

import { PageHeader } from "@/components/chrome/PageHeader";
import { Button } from "@/components/ui/button";
import { vacancy } from "@/lib/demo/vacancies";

export default function ExpiredLinkPage() {
  return (
    <main className="workspace workspace--form">
      <PageHeader
        path="ссылка"
        title="Срок прохождения закончился"
        description={`Срок прохождения закончился 8 сентября. Напишите рекрутеру: ${vacancy.recruiterEmail}`}
      />
      <Button asChild variant="secondary">
        <Link href="/login">Вернуться ко входу</Link>
      </Button>
    </main>
  );
}
