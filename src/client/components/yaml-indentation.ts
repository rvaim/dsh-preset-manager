function leadingColumns(line: string, tabSize: number): number {
  let columns = 0
  for (const character of line) {
    if (character === ' ') columns += 1
    else if (character === '\t') columns += tabSize - (columns % tabSize)
    else break
  }
  return columns
}

/**
 * Return indentation columns for a zero-based line, without parsing its text.
 * Blank lines inherit the smaller indentation of their nearest nonblank neighbors.
 * Invalid tab widths fall back to the default width of two columns.
 */
export function indentGuideColumns(lines: readonly string[], index: number, tabSize = 2): number {
  if (!Number.isInteger(index) || index < 0 || index >= lines.length) return 0

  const width = Number.isInteger(tabSize) && tabSize > 0 ? tabSize : 2
  const line = lines[index]!
  if (line.trim().length > 0) return leadingColumns(line, width)

  let previous = index - 1
  while (previous >= 0 && lines[previous]!.trim().length === 0) previous -= 1

  let next = index + 1
  while (next < lines.length && lines[next]!.trim().length === 0) next += 1

  if (previous < 0) return next < lines.length ? leadingColumns(lines[next]!, width) : 0
  if (next >= lines.length) return leadingColumns(lines[previous]!, width)
  return Math.min(leadingColumns(lines[previous]!, width), leadingColumns(lines[next]!, width))
}
