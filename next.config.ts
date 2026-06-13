import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Фиксируем корень workspace (рядом несколько lockfile — иначе Next берёт неверный).
  turbopack: {
    root: __dirname,
  },
  experimental: {
    // Задачи/комменты с картинками-файлами (base64) и большие спеки превышают дефолтный лимит Server Actions 1 МБ.
    serverActions: { bodySizeLimit: "15mb" },
  },
};

export default nextConfig;
