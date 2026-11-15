"use client"

import { useEffect, useRef, useState } from "react"

type Line = { id: number; text: string; kind?: "dim" | "warn" }
type Arm = "offline" | "online" | null
type SecretPrompt = null | "passwd-current" | "passwd-new" | "passwd-confirm" | "restore-current"

const HELP = [
  "offline, three commands, in order:",
  "  link core",
  "  arm offline",
  "  drop site",
  "online, three commands, in order:",
  "  link core",
  "  arm online",
  "  raise site",
  "change password, three commands, in order:",
  "  passwd open",
  "  passwd new",
  "  passwd save",
  "restore the starting password, three commands, in order:",
  "  restore open",
  "  restore confirm RESET-TO-EMAIL",
  "  restore apply",
  "other: status   clear   logout",
]

export function ServerControlPanel() {
  const [ready, setReady] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const [online, setOnline] = useState(true)
  const [mustChangePassword, setMustChangePassword] = useState(false)
  const [loginStep, setLoginStep] = useState<"email" | "password">("email")
  const [loginEmail, setLoginEmail] = useState("")
  const [lines, setLines] = useState<Line[]>([])
  const [input, setInput] = useState("")
  const [hidden, setHidden] = useState(false)
  const [busy, setBusy] = useState(false)
  const [linked, setLinked] = useState(false)
  const [arm, setArm] = useState<Arm>(null)
  const [secretPrompt, setSecretPrompt] = useState<SecretPrompt>(null)
  const [passwdReady, setPasswdReady] = useState<"current" | "new" | null>(null)
  const [restoreOpen, setRestoreOpen] = useState(false)
  const [restoreReady, setRestoreReady] = useState(false)
  const [passwdCurrent, setPasswdCurrent] = useState("")
  const [passwdNext, setPasswdNext] = useState("")
  const idRef = useRef(1)
  const bottomRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)

  function push(text: string, kind?: Line["kind"]) {
    const id = idRef.current++
    setLines((prev) => [...prev.slice(-180), { id, text, kind }])
  }

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/server/session", { cache: "no-store" })
        if (!res.ok) {
          if (!cancelled) {
            setAuthenticated(false)
            setLines([
              { id: idRef.current++, text: "infusionjaba gateway", kind: "dim" },
              { id: idRef.current++, text: "operator access only", kind: "dim" },
              { id: idRef.current++, text: "" },
            ])
          }
          return
        }
        const data = await res.json()
        if (cancelled) return
        setAuthenticated(true)
        setOnline(data.online !== false)
        setMustChangePassword(data.mustChangePassword === true)
        const state = data.online !== false ? "ONLINE" : "OFFLINE"
        setLines([
          { id: idRef.current++, text: "session accepted", kind: "dim" },
          { id: idRef.current++, text: `public site ${state}` },
          { id: idRef.current++, text: "type help" , kind: "dim" },
        ])
        if (data.mustChangePassword) {
          setLines((prev) => [
            ...prev,
            { id: idRef.current++, text: "starting password still active. run: passwd open", kind: "warn" },
          ])
        }
      } catch {
        if (!cancelled) setAuthenticated(false)
      } finally {
        if (!cancelled) setReady(true)
      }
    })()
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: "end" })
    inputRef.current?.focus()
  }, [lines, ready, authenticated, loginStep, hidden])

  async function setSite(next: boolean) {
    setBusy(true)
    try {
      const res = await fetch("/api/server/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ online: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        push(data.error || "command rejected", "warn")
        return false
      }
      setOnline(data.online !== false)
      return true
    } catch {
      push("link to control plane failed", "warn")
      return false
    } finally {
      setBusy(false)
    }
  }

  function wipeSecrets() {
    setSecretPrompt(null)
    setHidden(false)
    setPasswdReady(null)
    setRestoreOpen(false)
    setRestoreReady(false)
    setPasswdCurrent("")
    setPasswdNext("")
  }

  async function finishRestore(currentPassword: string) {
    setBusy(true)
    try {
      const res = await fetch("/api/server/password/restore", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, phrase: "RESET-TO-EMAIL" }),
      })
      if (!res.ok) {
        push("restore rejected", "warn")
        return
      }
      setMustChangePassword(true)
      push("starting password restored")
      push("password is the email again", "dim")
    } catch {
      push("restore failed", "warn")
    } finally {
      setBusy(false)
    }
  }

  async function finishPassword(currentPassword: string, nextPassword: string) {
    setBusy(true)
    try {
      const res = await fetch("/api/server/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, nextPassword }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        push(data.error || "password rejected", "warn")
        return
      }
      setMustChangePassword(false)
      push("password updated. previous secret is dead.")
    } catch {
      push("password update failed", "warn")
    } finally {
      setBusy(false)
    }
  }

  async function onLogin(event: React.FormEvent) {
    event.preventDefault()
    const value = input.trim()
    setInput("")
    if (loginStep === "email") {
      push(`login: ${value || ""}`)
      if (!value) {
        push("email required", "warn")
        return
      }
      setLoginEmail(value)
      setLoginStep("password")
      setHidden(true)
      push("password:", "dim")
      return
    }
    push("password: ********")
    setHidden(false)
    setBusy(true)
    try {
      const res = await fetch("/api/server/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: loginEmail, password: value }),
      })
      if (!res.ok) {
        push("access denied", "warn")
        setLoginStep("email")
        setLoginEmail("")
        return
      }
      const session = await fetch("/api/server/session", { cache: "no-store" })
      const data = await session.json()
      setAuthenticated(true)
      setOnline(data.online !== false)
      setMustChangePassword(data.mustChangePassword === true)
      push("session accepted")
      push(`public site ${data.online !== false ? "ONLINE" : "OFFLINE"}`)
      if (data.mustChangePassword) push("starting password still active. run: passwd open", "warn")
    } catch {
      push("access denied", "warn")
      setLoginStep("email")
    } finally {
      setBusy(false)
    }
  }

  async function onCommand(event: React.FormEvent) {
    event.preventDefault()
    const raw = input
    const cmd = raw.trim().toLowerCase()
    setInput("")
    if (secretPrompt) {
      push("********")
      setHidden(false)
      setSecretPrompt(null)
      if (secretPrompt === "passwd-current") {
        setPasswdCurrent(raw)
        setPasswdReady("current")
        push("1/3  current password held")
        push("next: passwd new", "dim")
        return
      }
      if (secretPrompt === "passwd-new") {
        setPasswdNext(raw)
        setPasswdReady("new")
        push("2/3  new password held")
        push("next: passwd save", "dim")
        return
      }
      if (secretPrompt === "passwd-confirm") {
        if (raw !== passwdNext) {
          push("confirmation does not match", "warn")
          setPasswdCurrent("")
          setPasswdNext("")
          setPasswdReady(null)
          return
        }
        const current = passwdCurrent
        const next = passwdNext
        setPasswdCurrent("")
        setPasswdNext("")
        setPasswdReady(null)
        push("3/3  saving password")
        await finishPassword(current, next)
        return
      }
      const current = raw
      setRestoreReady(false)
      push("3/3  checking current password")
      await finishRestore(current)
      return
    }

    push(`root@infusionjaba:~# ${raw.trim()}`)
    if (!cmd) return
    if (busy) {
      push("busy", "warn")
      return
    }

    if (cmd === "help") {
      wipeSecrets()
      HELP.forEach((line) => push(line, "dim"))
      return
    }
    if (cmd === "clear") {
      wipeSecrets()
      setLines([])
      return
    }
    if (cmd === "status") {
      push(`public site ${online ? "ONLINE" : "OFFLINE"}`)
      push(linked ? `link open${arm ? `, armed ${arm}` : ""}` : "link closed", "dim")
      return
    }
    if (cmd === "logout" || cmd === "exit") {
      wipeSecrets()
      await fetch("/api/server/logout", { method: "POST" })
      setAuthenticated(false)
      setLinked(false)
      setArm(null)
      setLoginStep("email")
      setLoginEmail("")
      push("session closed")
      return
    }
    if (cmd === "passwd open") {
      wipeSecrets()
      setLinked(false)
      setArm(null)
      setSecretPrompt("passwd-current")
      setHidden(true)
      push("1/3  current password:", "dim")
      return
    }
    if (cmd === "passwd new") {
      if (passwdReady !== "current") {
        push("run passwd open first", "warn")
        wipeSecrets()
        return
      }
      setSecretPrompt("passwd-new")
      setHidden(true)
      push("2/3  new password:", "dim")
      return
    }
    if (cmd === "passwd save") {
      if (passwdReady !== "new") {
        push("run passwd new first", "warn")
        wipeSecrets()
        return
      }
      setSecretPrompt("passwd-confirm")
      setHidden(true)
      push("3/3  confirm new password:", "dim")
      return
    }
    if (cmd === "restore open") {
      wipeSecrets()
      setLinked(false)
      setArm(null)
      setRestoreOpen(true)
      push("1/3  this puts the password back to the email")
      push("next: restore confirm RESET-TO-EMAIL", "dim")
      return
    }
    if (cmd.startsWith("restore confirm ")) {
      const phrase = raw.trim().slice("restore confirm ".length).trim()
      if (!restoreOpen || phrase !== "RESET-TO-EMAIL") {
        push("restore phrase rejected", "warn")
        wipeSecrets()
        return
      }
      setRestoreReady(true)
      push("2/3  phrase accepted")
      push("next: restore apply", "dim")
      return
    }
    if (cmd === "restore apply") {
      if (!restoreReady) {
        push("run the restore commands in order", "warn")
        wipeSecrets()
        return
      }
      setSecretPrompt("restore-current")
      setHidden(true)
      push("3/3  current password:", "dim")
      return
    }
    if (cmd === "link core") {
      wipeSecrets()
      setLinked(true)
      setArm(null)
      push("1/3  link established")
      push(online ? "next: arm offline" : "next: arm online", "dim")
      return
    }
    if (cmd === "arm offline") {
      if (!linked) {
        push("run link core first", "warn")
        return
      }
      if (!online) {
        push("site is already offline", "warn")
        setArm(null)
        return
      }
      setArm("offline")
      push("2/3  gate armed for offline")
      push("next: drop site", "dim")
      return
    }
    if (cmd === "arm online") {
      if (!linked) {
        push("run link core first", "warn")
        return
      }
      if (online) {
        push("site is already online", "warn")
        setArm(null)
        return
      }
      setArm("online")
      push("2/3  gate armed for online")
      push("next: raise site", "dim")
      return
    }
    if (cmd === "drop site") {
      if (arm !== "offline") {
        push("sequence broken. start again: link core", "warn")
        setLinked(false)
        setArm(null)
        return
      }
      push("3/3  dropping public routes")
      const ok = await setSite(false)
      setLinked(false)
      setArm(null)
      if (!ok) return
      push("502 engaged")
      push("infusionjaba.co.ke  /catha  /jaba  /menu  unreachable")
      return
    }
    if (cmd === "raise site") {
      if (arm !== "online") {
        push("sequence broken. start again: link core", "warn")
        setLinked(false)
        setArm(null)
        return
      }
      push("3/3  restoring public routes")
      const ok = await setSite(true)
      setLinked(false)
      setArm(null)
      if (!ok) return
      push("routes restored")
      push("public site ONLINE")
      return
    }
    wipeSecrets()
    setLinked(false)
    setArm(null)
    push(`unknown command: ${cmd}`, "warn")
    push("type help", "dim")
  }

  const prompt = !authenticated
    ? loginStep === "email"
      ? "login:"
      : "password:"
    : "root@infusionjaba:~#"

  return (
    <div className="term-shell" onClick={() => inputRef.current?.focus()}>
      <div className="term-scan" />
      <div className="term-screen">
        <header className="term-bar">
          <span>infusionjaba</span>
          <span>{ready ? (authenticated ? (online ? "ONLINE" : "OFFLINE") : "LOCKED") : "..."}</span>
        </header>
        <div className="term-body">
          {lines.map((line) => (
            <div key={line.id} className={line.kind === "warn" ? "term-warn" : line.kind === "dim" ? "term-dim" : ""}>
              {line.text || "\u00a0"}
            </div>
          ))}
          {ready ? (
            <form onSubmit={authenticated ? onCommand : onLogin} className="term-form">
              <span className="term-prompt">{prompt}</span>
              <input
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                type={hidden ? "password" : "text"}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
                autoComplete={hidden ? "current-password" : "off"}
                disabled={busy}
                aria-label="terminal command"
              />
            </form>
          ) : (
            <div className="term-dim">connecting...</div>
          )}
          <div ref={bottomRef} />
        </div>
      </div>
      <style jsx>{`
        .term-shell {
          position: fixed;
          inset: 0;
          z-index: 50;
          background: #020602;
          color: #7dff6b;
          font-family: "Cascadia Mono", "Consolas", "Courier New", monospace;
        }
        .term-scan {
          pointer-events: none;
          position: absolute;
          inset: 0;
          background: repeating-linear-gradient(
            to bottom,
            rgba(0, 0, 0, 0.16) 0px,
            rgba(0, 0, 0, 0.16) 1px,
            transparent 2px,
            transparent 4px
          );
          mix-blend-mode: multiply;
        }
        .term-screen {
          position: relative;
          height: 100%;
          display: flex;
          flex-direction: column;
          text-shadow: 0 0 6px rgba(80, 255, 80, 0.35);
        }
        .term-bar {
          display: flex;
          justify-content: space-between;
          padding: 10px 16px;
          border-bottom: 1px solid #145214;
          color: #9dff86;
          letter-spacing: 0.08em;
          font-size: 12px;
        }
        .term-body {
          flex: 1;
          overflow: auto;
          padding: 18px 16px 28px;
          font-size: 15px;
          line-height: 1.55;
          white-space: pre-wrap;
        }
        .term-dim {
          color: #3f8f3a;
        }
        .term-warn {
          color: #d6ff4a;
        }
        .term-form {
          display: flex;
          gap: 10px;
          align-items: center;
          margin-top: 8px;
        }
        .term-prompt {
          color: #b6ff57;
          flex: none;
        }
        input {
          flex: 1;
          background: transparent;
          border: 0;
          outline: none;
          color: #7dff6b;
          font: inherit;
          text-shadow: inherit;
          caret-color: #b6ff57;
          min-width: 0;
        }
      `}</style>
    </div>
  )
}
