# codex-modified resource provenance

Source: [codex-original/prompt.md](../codex-original/prompt.md), itself an
unmodified copy of the OpenAI Codex base prompt at commit
`970111f6cb62cc02fe36a82ea7d71b37a2889c97`
(`codex-rs/models-manager/prompt.md`, Apache-2.0).

This file is a minimal DSH adaptation of that text for the `codex-modified`
preset. It is a derivative work, not an upstream snapshot, and the original
`codex-original` resource remains byte-for-byte unchanged.

## Changes from the original

- Renamed the product identity from Codex CLI / Codex / OpenAI to DSH
  (DeepSeek Harness) / DeepSeek.
- Replaced the `update_plan` tool references with DSH's `todo_write` tool and
  adjusted the one sentence that mentioned its `explanation` argument.
- Replaced the `apply_patch` file-editing instruction with DSH's `edit` and
  `write` tools.
- Replaced user-facing CLI-rendering references with DSH.

No sections were added, removed, or reordered. The text still has no
`{{...}}` template markers.

Size and digest:

- Bytes: 20682
- Lines: 275
- Encoding: UTF-8
- Newlines: LF; no CR bytes
- SHA-256: aaba986523327e8177fd9032bac9a064f965b22c7d47cf3d33a68cd0549165d5

## License

The original Codex prompt is licensed under Apache-2.0. The upstream
[LICENSE](../codex-original/LICENSE) and [NOTICE](../codex-original/NOTICE)
are preserved in `resources/codex-original/`.
