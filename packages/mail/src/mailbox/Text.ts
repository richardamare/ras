const entities: Record<string, string> = { amp: "&", lt: "<", gt: ">", quot: '"', apos: "'", nbsp: " " }

const decodeEntities = (text: string) =>
  text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (whole, name: string) =>
    name.startsWith("#x") || name.startsWith("#X")
      ? String.fromCodePoint(Number.parseInt(name.slice(2), 16))
      : name.startsWith("#")
        ? String.fromCodePoint(Number.parseInt(name.slice(1), 10))
        : (entities[name.toLowerCase()] ?? whole)
  )

/** Mail's HTML as plain text: hidden parts dropped, blocks on their own lines, runs of blank lines folded. */
export const fromHtml = (html: string) =>
  decodeEntities(
    html
      .replace(/<!--[\s\S]*?-->|<(script|style|head)\b[^>]*>[\s\S]*?<\/\1\s*>/gi, " ")
      .replace(/<br\b[^>]*>|<\/?(?:p|div|tr|li|ul|ol|h[1-6]|table|blockquote)\b[^>]*>/gi, "\n")
      .replace(/<\/t[dh]\s*>/gi, " ")
      .replace(/<[^>]*>/g, "")
  )
    .split("\n")
    .map((line) => line.replace(/[ \t\r\f\v]+/g, " ").trim())
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim()

/** The start of the text on one line, at most `length` characters. */
export const snippet = (text: string, length: number) => {
  const flat = text.replace(/\s+/g, " ").trim()
  return flat.length <= length ? flat : `${flat.slice(0, length - 1)}…`
}
