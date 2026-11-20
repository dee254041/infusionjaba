export function StoreCredit({ tone = "light" }: { tone?: "light" | "dark" }) {
  const muted = tone === "dark" ? "text-[#9f9180]" : "text-[#6f5d4f]"
  const link =
    tone === "dark"
      ? "text-[#d8ccb7] hover:text-[var(--brand-green)]"
      : "text-[#2a201b] hover:text-[#1f7a43]"
  const space = tone === "dark" ? "mt-3" : "px-4 py-8"

  return (
    <div className={`${space} text-center text-xs ${muted}`}>
      <p>&copy; {new Date().getFullYear()} Catha Lounge. All rights reserved.</p>
      <a
        href="https://wa.me/254794269051"
        target="_blank"
        rel="noopener noreferrer"
        className={`mt-1 inline-block underline-offset-2 hover:underline ${link}`}
      >
        Developed by
      </a>
    </div>
  )
}
