/**
 * Reads a Server-Sent-Events stream from a fetch Response and invokes
 * `onData` for every `data:` payload (excluding `[DONE]`).
 */
export async function readSseEvents(
  response: Response,
  onData: (data: string) => void,
): Promise<void> {
  if (!response.body) throw new Error("Empty response body")
  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ""
  while (true) {
    const { value, done } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    while (true) {
      const sep = buffer.indexOf("\n\n")
      if (sep === -1) break
      const event = buffer.slice(0, sep)
      buffer = buffer.slice(sep + 2)
      const dataLine = event.split("\n").find((l) => l.startsWith("data:"))
      if (!dataLine) continue
      const data = dataLine.slice(5).trim()
      if (!data || data === "[DONE]") continue
      onData(data)
    }
  }
}
