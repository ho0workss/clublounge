/** @type {import('next').NextConfig} */
// GitHub Pages(정적 배포)일 때만 export/basePath 적용. Vercel/로컬은 일반 모드.
const isPages = process.env.GITHUB_PAGES === "true";
const repo = "clublounge";

const nextConfig = {
  reactStrictMode: true,
  ...(isPages
    ? {
        output: "export",
        basePath: `/${repo}`,
        images: { unoptimized: true },
        trailingSlash: true,
      }
    : {}),
};

module.exports = nextConfig;
