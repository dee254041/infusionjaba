"use client"

import { useEffect, useState } from "react"

export function ServerControlPanel() {
  const [ready, setReady] = useState(false)
  const [authenticated, setAuthenticated] = useState(false)
  const [online, setOnline] = useState(true)
  const [mustChangePassword, setMustChangePassword] = useState(false)
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [currentPassword, setCurrentPassword] = useState("")
  const [nextPassword, setNextPassword] = useState("")
  const [confirmPassword, setConfirmPassword] = useState("")
  const [notice, setNotice] = useState("")
  const [error, setError] = useState("")
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let cancelled = false
    ;(async () => {
      try {
        const res = await fetch("/api/server/session", { cache: "no-store" })
        if (!res.ok) {
          if (!cancelled) setAuthenticated(false)
          return
        }
        const data = await res.json()
        if (cancelled) return
        setAuthenticated(true)
        setOnline(data.online !== false)
        setMustChangePassword(data.mustChangePassword === true)
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

  async function signIn(event: React.FormEvent) {
    event.preventDefault()
    setBusy(true)
    setError("")
    try {
      const res = await fetch("/api/server/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      })
      if (!res.ok) {
        setError("Invalid email or password")
        return
      }
      const session = await fetch("/api/server/session", { cache: "no-store" })
      const data = await session.json()
      setAuthenticated(true)
      setOnline(data.online !== false)
      setMustChangePassword(data.mustChangePassword === true)
      setPassword("")
    } catch {
      setError("Could not sign in")
    } finally {
      setBusy(false)
    }
  }

  async function setSite(next: boolean) {
    if (!next && !window.confirm("Take the public site offline?")) return
    setBusy(true)
    setError("")
    try {
      const res = await fetch("/api/server/toggle", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ online: next }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || "Could not update")
        return
      }
      setOnline(data.online !== false)
    } catch {
      setError("Could not update")
    } finally {
      setBusy(false)
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault()
    setError("")
    setNotice("")
    if (nextPassword !== confirmPassword) {
      setError("New password and confirmation do not match.")
      return
    }
    setBusy(true)
    try {
      const res = await fetch("/api/server/password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ currentPassword, nextPassword }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) {
        setError(data.error || "Could not change the password")
        return
      }
      setCurrentPassword("")
      setNextPassword("")
      setConfirmPassword("")
      setMustChangePassword(false)
      setNotice("Password updated. The previous password no longer works.")
    } catch {
      setError("Could not change the password")
    } finally {
      setBusy(false)
    }
  }

  async function signOut() {
    await fetch("/api/server/logout", { method: "POST" })
    setAuthenticated(false)
    setPassword("")
  }

  if (!ready) {
    return <p style={{ font: "14px/1.4 sans-serif", color: "#444" }}>Loading…</p>
  }

  if (!authenticated) {
    return (
      <form onSubmit={signIn} style={{ width: 320, font: "14px/1.4 sans-serif", color: "#222" }}>
        <h1 style={{ font: "600 18px sans-serif", margin: "0 0 16px" }}>Server</h1>
        <label style={{ display: "block", marginBottom: 10 }}>
          Email
          <input
            type="email"
            value={email}
            autoComplete="username"
            onChange={(e) => setEmail(e.target.value)}
            required
            style={{ display: "block", width: "100%", marginTop: 4, padding: "8px" }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 14 }}>
          Password
          <input
            type="password"
            value={password}
            autoComplete="current-password"
            onChange={(e) => setPassword(e.target.value)}
            required
            style={{ display: "block", width: "100%", marginTop: 4, padding: "8px" }}
          />
        </label>
        {error ? <p style={{ color: "#a40000", marginTop: 0 }}>{error}</p> : null}
        <button type="submit" disabled={busy} style={{ padding: "8px 14px" }}>
          {busy ? "Signing in…" : "Sign in"}
        </button>
      </form>
    )
  }

  return (
    <div style={{ width: 360, font: "14px/1.4 sans-serif", color: "#222" }}>
      <h1 style={{ font: "600 18px sans-serif", margin: "0 0 8px" }}>Server</h1>
      <p style={{ marginTop: 0 }}>
        Public site is <strong>{online ? "online" : "offline"}</strong>.
      </p>
      <button type="button" disabled={busy || online} onClick={() => setSite(true)} style={{ padding: "8px 14px", marginRight: 8 }}>
        Bring online
      </button>
      <button type="button" disabled={busy || !online} onClick={() => setSite(false)} style={{ padding: "8px 14px" }}>
        Take offline
      </button>
      {mustChangePassword ? (
        <p style={{ background: "#fff4d6", border: "1px solid #e6c200", padding: "8px 10px" }}>
          The starting password is still in use. Set a new password before leaving this page.
        </p>
      ) : null}
      <form onSubmit={changePassword} style={{ marginTop: 20 }}>
        <h2 style={{ font: "600 15px sans-serif" }}>Change password</h2>
        <label style={{ display: "block", marginBottom: 8 }}>
          Current password
          <input
            type="password"
            value={currentPassword}
            autoComplete="current-password"
            onChange={(e) => setCurrentPassword(e.target.value)}
            required
            style={{ display: "block", width: "100%", marginTop: 4, padding: "8px" }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 8 }}>
          New password
          <input
            type="password"
            value={nextPassword}
            autoComplete="new-password"
            onChange={(e) => setNextPassword(e.target.value)}
            required
            minLength={12}
            style={{ display: "block", width: "100%", marginTop: 4, padding: "8px" }}
          />
        </label>
        <label style={{ display: "block", marginBottom: 12 }}>
          Confirm new password
          <input
            type="password"
            value={confirmPassword}
            autoComplete="new-password"
            onChange={(e) => setConfirmPassword(e.target.value)}
            required
            minLength={12}
            style={{ display: "block", width: "100%", marginTop: 4, padding: "8px" }}
          />
        </label>
        <button type="submit" disabled={busy} style={{ padding: "8px 14px" }}>
          {busy ? "Saving…" : "Save password"}
        </button>
      </form>
      {notice ? <p>{notice}</p> : null}
      {error ? <p style={{ color: "#a40000" }}>{error}</p> : null}
      <p>
        <button type="button" onClick={signOut} style={{ padding: 0, border: 0, background: "none", color: "#0645ad", cursor: "pointer" }}>
          Sign out
        </button>
      </p>
    </div>
  )
}
