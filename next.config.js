/** @type {import('next').NextConfig} */

// CSP estricta. dangerouslySetInnerHTML del email-html-body sigue funcionando
// porque sanitizeEmailHtml() ya quita scripts. Permitimos inline styles para
// que los emails con CSS inline se rendericen.
const CSP_HEADER = [
  "default-src 'self'",
  // Permitir Vercel analytics + Google fonts + posibles iframes Stripe
  "script-src 'self' 'unsafe-inline' 'unsafe-eval' https://va.vercel-scripts.com https://vercel.live",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  "font-src 'self' data: https://fonts.gstatic.com",
  // Imágenes: avatares Google, sitios remotos en emails
  "img-src 'self' data: blob: https: http:",
  // XHR a APIs propias + Google APIs (calendar/drive/tasks/gmail) + LLMs + Vercel
  "connect-src 'self' https://*.googleapis.com https://accounts.google.com https://api.openai.com https://generativelanguage.googleapis.com https://api.stability.ai https://api.elevenlabs.io https://api.deepgram.com https://api.esios.ree.es https://api.hostinger.com https://*.vercel.app https://vitals.vercel-insights.com wss://*.vercel.app",
  // Frames (OAuth de Google + previews Vercel)
  "frame-src 'self' https://accounts.google.com https://content.googleapis.com https://vercel.live",
  // Bloquear que nos embebean
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self' https://accounts.google.com",
  "object-src 'none'",
].join("; ");

const SECURITY_HEADERS = [
  { key: "Content-Security-Policy", value: CSP_HEADER },
  { key: "Strict-Transport-Security", value: "max-age=31536000; includeSubDomains; preload" },
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  { key: "X-DNS-Prefetch-Control", value: "on" },
  { key: "Permissions-Policy", value: "camera=(self), microphone=(self), geolocation=(self), interest-cohort=()" },
];

const nextConfig = {
  experimental: {
    serverComponentsExternalPackages: ["pdf-parse"],
    outputFileTracingIncludes: {
      "/api/admin/migrate-all": ["./drizzle/**/*.sql"],
    },
  },
  images: {
    remotePatterns: [
      {
        protocol: "https",
        hostname: "lh3.googleusercontent.com",
      },
    ],
  },
  async headers() {
    return [
      // Headers globales de seguridad
      {
        source: "/:path*",
        headers: SECURITY_HEADERS,
      },
      // /api responses NO se cachean por defecto
      {
        source: "/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store, max-age=0" }],
      },
    ];
  },
};

module.exports = nextConfig;
