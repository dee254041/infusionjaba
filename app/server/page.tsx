import type { Metadata } from "next"
import { ServerControlPanel } from "./control-panel"

export const metadata: Metadata = {
  title: "Server",
  robots: { index: false, follow: false },
}

export default function ServerControlPage() {
  return (
    <main>
      <ServerControlPanel />
    </main>
  )
}
