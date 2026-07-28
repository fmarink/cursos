import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  serverExternalPackages: ['pg', 'exceljs', 'puppeteer-core'],
  experimental: {
    // El expediente con firmas en base64 puede superar el límite por defecto.
    serverActions: { bodySizeLimit: '12mb' },
  },
}

export default nextConfig
