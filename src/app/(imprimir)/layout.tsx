/**
 * Layout limpio para las vistas imprimibles: sin navegación ni cromo de la
 * aplicación, para que Puppeteer imprima exactamente el documento.
 */
export default function LayoutImprimir({ children }: { children: React.ReactNode }) {
  return <div className="bg-white">{children}</div>
}
