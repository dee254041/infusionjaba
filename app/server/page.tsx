import type { Metadata } from "next"
import { ServerControlPanel } from "./control-panel"

export const metadata: Metadata = {
  title: "Server",
  robots: { index: false, follow: false },
}

export default function ServerControlPage() {
  return (
    <main style={{ minHeight: "100vh", background: "#fff", padding: "48px 24px" }}>
      <ServerControlPanel />
    </main>
  )
}
