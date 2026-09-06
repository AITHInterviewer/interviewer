import { redirect } from "next/navigation";

/** Отдельная очередь дублировала блок на /expert. Оставляем главную страницу роли. */
export default function ExpertQueueRedirectPage() {
  redirect("/expert");
}
