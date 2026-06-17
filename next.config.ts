import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Фиксируем корень workspace (рядом несколько lockfile — иначе Next берёт неверный).
  turbopack: {
    root: __dirname,
  },
  experimental: {
    // Задачи/комменты с файлами (base64) и большие спеки превышают дефолтный лимит Server Actions 1 МБ.
    // 100mb — чтобы можно было прикреплять сборки/APK для отправки клиенту (base64 раздувает ~на 33%,
    // т.е. реально проходит файл до ~70 МБ). Для совсем больших файлов нужен прямой upload, не Server Action.
    serverActions: { bodySizeLimit: "100mb" },
    // ОТДЕЛЬНЫЙ лимит: middleware/proxy по умолчанию читает только первые 10MB тела запроса и обрезает
    // остальное → большой base64-файл бьётся («Unterminated string in JSON» → 500). Поднимаем и его.
    proxyClientMaxBodySize: "100mb",
  },
};

export default nextConfig;
