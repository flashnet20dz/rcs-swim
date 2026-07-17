import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  output: "standalone",
  // السماح بالاتصال من أي جهاز على الشبكة المحلية
  allowedDevOrigins: ["*"],
  typescript: {
    ignoreBuildErrors: true,
  },
  reactStrictMode: false,
  // إعداد للعمل مع Electron
  experimental: {
    // تحسين الأداء في Electron
    optimizePackageImports: ["lucide-react", "framer-motion"],
  },
};

export default nextConfig;
