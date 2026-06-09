import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Фиксируем корень workspace (рядом несколько lockfile — иначе Next берёт неверный).
  turbopack: {
    root: __dirname,
  },
};

export default nextConfig;
