export function isLyrics(text: string): boolean {
  return text.trim().split(/\s+/).length >= 3;
}
