import { describe, expect, it } from "vitest"
import { dialableKenyaPhone, isLoginPlaceholderPhone } from "@/lib/phone-utils"

describe("dialableKenyaPhone", () => {
  it("keeps the number typed at checkout", () => {
    expect(dialableKenyaPhone("+254712345678")).toBe("+254712345678")
    expect(dialableKenyaPhone("0712345678")).toBe("+254712345678")
    expect(dialableKenyaPhone("712 345 678")).toBe("+254712345678")
  })

  it("drops a Google sign-in id", () => {
    expect(isLoginPlaceholderPhone("google:103164327740420194671")).toBe(true)
    expect(dialableKenyaPhone("google:103164327740420194671")).toBeNull()
  })
})
