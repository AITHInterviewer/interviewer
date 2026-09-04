import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Next.js dev-сервер по умолчанию блокирует кросс-origin запросы к dev-ресурсам
  // (HMR websocket и часть бутстрап-скриптов гидратации) — без этого доступ к странице
  // с любого хоста, кроме localhost, тихо не гидрируется (ни одной ошибки в консоли,
  // просто React не подхватывает SSR-разметку). Найдено на практике при деплое на
  // self-hosted раннер за Radmin VPN (26.67.31.6) — см. ту же диагностику в
  // specs/004-candidate-interview-flow/tasks.md. Список хостов — через запятую в
  // NEXT_DEV_ALLOWED_ORIGINS, не хардкод конкретного IP в репозитории.
  allowedDevOrigins: process.env.NEXT_DEV_ALLOWED_ORIGINS?.split(",").map((origin) => origin.trim()) ?? [],
};

export default nextConfig;
