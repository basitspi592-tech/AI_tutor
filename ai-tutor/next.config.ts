import type { NextConfig } from "next";
import path from "path";
import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

const nextConfig: NextConfig = {
  serverExternalPackages: ["ws", "@neondatabase/serverless", "@prisma/adapter-neon"],
  turbopack: {
    root: path.join(__dirname),
  },
};

export default withNextIntl(nextConfig);
