/**
 * Detection of secrets and machine-local data in a preset about to leave the
 * machine.
 *
 * This is a warning system, never a redactor: the manager does not silently
 * modify a preset the user authored. It reports what it found and lets the
 * user decide, which is why every finding carries the exact path.
 */
import type { PresetDefinition, ValidationIssue } from '../shared/types.js'

interface Rule {
  readonly code: string
  readonly label: string
  readonly pattern: RegExp
}

/**
 * Credential shapes worth flagging.
 *
 * These are deliberately conservative: a false positive costs the user one
 * dismiss click, while a false negative leaks a live credential into a share
 * text the user may paste into a chat. Provider-prefixed keys are matched by
 * their documented prefix rather than by entropy, which keeps the check
 * explainable.
 */
const RULES: readonly Rule[] = [
  { code: 'secret.openai', label: 'OpenAI 风格密钥', pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/ },
  { code: 'secret.anthropic', label: 'Anthropic 风格密钥', pattern: /\bsk-ant-[A-Za-z0-9_-]{16,}\b/ },
  { code: 'secret.aws', label: 'AWS Access Key', pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { code: 'secret.github', label: 'GitHub Token', pattern: /\bgh[pousr]_[A-Za-z0-9]{20,}\b/ },
  { code: 'secret.slack', label: 'Slack Token', pattern: /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/ },
  { code: 'secret.google', label: 'Google API Key', pattern: /\bAIza[0-9A-Za-z_-]{35}\b/ },
  { code: 'secret.jwt', label: 'JWT', pattern: /\beyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\b/ },
  {
    code: 'secret.private-key',
    label: '私钥文件内容',
    pattern: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/,
  },
  {
    code: 'secret.bearer',
    label: '内联 Bearer Token',
    pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}/i,
  },
]

/**
 * Machine-local absolute paths.
 *
 * A share text carrying `C:\Users\<name>\...` or `/home/<name>/...` leaks the
 * author's machine layout and is almost always useless to the recipient, so it
 * is worth surfacing even though it is not a credential.
 */
const PATH_RULES: readonly Rule[] = [
  {
    code: 'path.windows-profile',
    label: '本机 Windows 用户目录路径',
    pattern: /\b[A-Za-z]:\\Users\\[^\\\s"']+/i,
  },
  { code: 'path.posix-home', label: '本机 POSIX 用户目录路径', pattern: /(?:^|[\s"'(])\/(?:home|Users)\/[^/\s"')]+/ },
  { code: 'path.tmp', label: '临时目录绝对路径', pattern: /\b[A-Za-z]:\\[^"'\s]*\\Temp\\/ },
]

function visitStrings(
  value: unknown,
  path: string,
  sink: (text: string, path: string) => void,
): void {
  if (typeof value === 'string') {
    sink(value, path)
    return
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => visitStrings(item, `${path}[${index}]`, sink))
    return
  }
  if (value === null || typeof value !== 'object') return
  for (const [key, nested] of Object.entries(value as Record<string, unknown>)) {
    visitStrings(nested, path === '' ? key : `${path}.${key}`, sink)
  }
}

/** One finding: which rule fired, where, and why it matters. */
export interface SensitiveFinding {
  readonly code: string
  readonly label: string
  readonly path: string
  /** A truncated excerpt; never the whole secret. */
  readonly excerpt: string
}

function excerptOf(text: string, index: number, length: number): string {
  const start = Math.max(0, index - 8)
  const end = Math.min(text.length, index + length + 8)
  const slice = text.slice(start, end).replace(/\s+/g, ' ')
  return start > 0 || end < text.length ? `…${slice}…` : slice
}

/**
 * Scan a definition for credentials and machine-local paths.
 *
 * @param definition - preset to scan.
 * @returns findings in document order, deduplicated by rule and path.
 */
export function findSensitiveData(definition: PresetDefinition): SensitiveFinding[] {
  const findings: SensitiveFinding[] = []
  const seen = new Set<string>()

  visitStrings(definition, '', (text, path) => {
    for (const rule of [...RULES, ...PATH_RULES]) {
      const match = rule.pattern.exec(text)
      if (match === null) continue
      const key = `${rule.code}@${path}`
      if (seen.has(key)) continue
      seen.add(key)
      findings.push({
        code: rule.code,
        label: rule.label,
        path,
        excerpt: excerptOf(text, match.index, match[0].length),
      })
    }
  })

  return findings
}

/** Project findings into the shared warning shape for the UI. */
export function sensitiveWarnings(definition: PresetDefinition): ValidationIssue[] {
  return findSensitiveData(definition).map((finding) => ({
    code: finding.code,
    message: `导出内容可能包含${finding.label}，请确认是否适合分享`,
    path: finding.path,
    detail: finding.excerpt,
  }))
}
