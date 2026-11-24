export type ReceiptImageInput = {
  businessName: string
  orderId: string
  paidAt: string
  paymentText: string
  receiptNumber: string | null
  totalLabel: string
  items: Array<{ name: string; quantity: number; lineTotal: string }>
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter(Boolean)
  if (words.length === 0) return [""]
  const lines: string[] = []
  let line = ""
  for (const word of words) {
    const pieces = ctx.measureText(word).width > maxWidth ? chunk(ctx, word, maxWidth) : [word]
    for (const piece of pieces) {
      const next = line ? `${line} ${piece}` : piece
      if (ctx.measureText(next).width <= maxWidth) line = next
      else {
        if (line) lines.push(line)
        line = piece
      }
    }
  }
  if (line) lines.push(line)
  return lines
}

function chunk(ctx: CanvasRenderingContext2D, word: string, maxWidth: number): string[] {
  const parts: string[] = []
  let current = ""
  for (const char of word) {
    const next = current + char
    if (ctx.measureText(next).width <= maxWidth) current = next
    else {
      if (current) parts.push(current)
      current = char
    }
  }
  if (current) parts.push(current)
  return parts
}

function contentBottom(ctx: CanvasRenderingContext2D, input: ReceiptImageInput, width: number, pad: number): number {
  let y = 540
  const rowCount = 4 + (input.receiptNumber ? 1 : 0)
  y += rowCount * 58 + 76
  y += 52
  for (const item of input.items) {
    ctx.font = "500 32px sans-serif"
    const lines = wrap(ctx, `${item.quantity}× ${item.name}`, width - pad * 2 - 280)
    y += lines.length * 46 + 8
  }
  y += 96
  ctx.font = "500 30px Georgia, serif"
  const thanks = wrap(ctx, `Thank you for choosing ${input.businessName}. We look forward to serving you again.`, width - pad * 2)
  y += thanks.length * 42 + 80
  return y
}

export async function renderReceiptPng(input: ReceiptImageInput): Promise<Blob> {
  const width = 1080
  const pad = 72
  const canvas = document.createElement("canvas")
  const measure = canvas.getContext("2d")
  if (!measure) throw new Error("Could not prepare the receipt image")
  const height = contentBottom(measure, input, width, pad)

  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext("2d")
  if (!ctx) throw new Error("Could not prepare the receipt image")

  ctx.fillStyle = "#f7f3ea"
  ctx.fillRect(0, 0, width, height)

  ctx.fillStyle = "#1c1917"
  ctx.fillRect(0, 0, width, 460)

  ctx.fillStyle = "#f6d58a"
  ctx.font = "700 22px sans-serif"
  ctx.textAlign = "center"
  ctx.fillText("OFFICIAL RECEIPT", width / 2, 150)

  ctx.fillStyle = "#fff8e8"
  ctx.font = "700 64px Georgia, serif"
  ctx.fillText(input.businessName, width / 2, 230)

  ctx.fillStyle = "#f6d58a"
  ctx.font = "700 72px Georgia, serif"
  ctx.fillText("Payment received", width / 2, 330)
  ctx.font = "700 84px Georgia, serif"
  ctx.fillText(input.totalLabel, width / 2, 420)

  ctx.textAlign = "left"
  ctx.fillStyle = "#44403c"
  ctx.font = "500 32px sans-serif"
  let y = 540
  const rows: Array<[string, string]> = [
    ["Order", `#${input.orderId}`],
    ...(input.receiptNumber ? [["M-Pesa receipt", input.receiptNumber] as [string, string]] : []),
    ["Date", input.paidAt],
    ["Payment", input.paymentText],
    ["Status", "PAID"],
  ]
  for (const [label, value] of rows) {
    ctx.fillStyle = "#78716c"
    ctx.font = "500 30px sans-serif"
    ctx.textAlign = "left"
    ctx.fillText(label, pad, y)
    ctx.fillStyle = "#1c1917"
    ctx.font = "700 30px sans-serif"
    ctx.textAlign = "right"
    ctx.fillText(value, width - pad, y)
    y += 58
  }

  y += 20
  ctx.strokeStyle = "#d6d3d1"
  ctx.setLineDash([8, 8])
  ctx.beginPath()
  ctx.moveTo(pad, y)
  ctx.lineTo(width - pad, y)
  ctx.stroke()
  ctx.setLineDash([])
  y += 56

  ctx.fillStyle = "#78716c"
  ctx.font = "700 24px sans-serif"
  ctx.textAlign = "left"
  ctx.fillText("ORDER ITEMS", pad, y)
  y += 52

  input.items.forEach((item, index) => {
    ctx.font = "500 32px sans-serif"
    const lines = wrap(ctx, `${item.quantity}× ${item.name}`, width - pad * 2 - 260)
    lines.forEach((line, lineIndex) => {
      ctx.fillStyle = "#292524"
      ctx.textAlign = "left"
      ctx.fillText(line, pad, y)
      if (lineIndex === 0) {
        ctx.font = "700 32px sans-serif"
        ctx.textAlign = "right"
        ctx.fillText(item.lineTotal, width - pad, y)
        ctx.font = "500 32px sans-serif"
      }
      y += 46
    })
    if (index < input.items.length - 1) y += 8
  })

  y += 24
  ctx.strokeStyle = "#1c1917"
  ctx.lineWidth = 3
  ctx.beginPath()
  ctx.moveTo(pad, y)
  ctx.lineTo(width - pad, y)
  ctx.stroke()
  y += 72

  ctx.fillStyle = "#1c1917"
  ctx.font = "800 36px sans-serif"
  ctx.textAlign = "left"
  ctx.fillText("TOTAL PAID", pad, y)
  ctx.font = "700 52px Georgia, serif"
  ctx.textAlign = "right"
  ctx.fillText(input.totalLabel, width - pad, y)

  y += 90
  ctx.fillStyle = "#57534e"
  ctx.font = "500 30px Georgia, serif"
  ctx.textAlign = "center"
  const thanks = wrap(ctx, `Thank you for choosing ${input.businessName}. We look forward to serving you again.`, width - pad * 2)
  for (const line of thanks) {
    ctx.fillText(line, width / 2, y)
    y += 42
  }

  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/png"))
  if (!blob) throw new Error("Could not create the receipt image")
  return blob
}
