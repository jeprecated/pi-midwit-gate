# pi-midwit-gate

A [Pi](https://pi.dev/) package and extension that blocks the main agent until the user's initial request has passed a cold-read clarity review.

## Install

From git:

```sh
pi install git:github.com:ohare93/pi-midwit-gate
```

For local development:

```sh
pi -e /home/jmo/Development/projects/pi-midwit-gate
```

Or add it to Pi settings:

```json
{
  "packages": [
    "/home/jmo/Development/projects/pi-midwit-gate"
  ]
}
```

## Overview

The gate is intended to catch vague or under-specified session-start prompts before the main agent starts doing real work. It does this by making a short standalone plan/pitch, sending that pitch to several fresh reviewer agents, and requiring a reviewer quorum before the prompt is released to the main agent.

## Default behavior

By default, Midwit Gate is **off**.

To enable it for one project, add a local `.pi/midwit-gate.json` file with `gate.enabled: true`. If you enable it, the default mode is **initial normal prompt only**.

This is intentional. Follow-up prompts often rely on conversation context, e.g.:

> Assistant: "If you want, I can update the parser next."
>
> User: "Yes, do that."

A fresh midwit reviewer does not have the chat context needed to understand "that", so the extension skips normal follow-ups unless you explicitly switch it to all-prompt mode or arm it once.

## Flow

1. User submits a normal prompt.
2. The extension intercepts it before the main agent starts.
3. A smart planner subprocess writes a standalone pitch containing outcome, execution plan, assumptions, success criteria, and risk controls.
4. Five fresh midwit reviewer subprocesses review the pitch independently.
5. Reviewer blocking issues and missing decisions are merged into one clarification round for the user.
6. The user answers every merged clarification question directly.
7. Those answers are fed back into the planner as authoritative clarification history.
8. The planner rewrites the pitch and the same reviewers review the revised pitch again.
9. The loop repeats until quorum passes cleanly, the gate stalls, or the max-iteration stop condition is reached.
10. If the gate stops without convergence, the user gets an explicit escalation choice: manual override or cancel.
11. If the user decides the gate is being too strict, `/midwit override` explicitly bypasses the block and continues with the original blocked prompt.
12. When quorum passes, a final chat summary shows the vote table and the final plan is shown to the user for approval/editing before it is passed back into Pi as the actual prompt.

Each child subprocess is run isolated with:

```sh
pi --mode json -p --no-session --no-tools --no-extensions
```

This prevents child planner/reviewer calls from using tools, saving sessions, or recursively invoking extensions.

## Reviewer profiles

The default panel has five reviewers:

| Reviewer | Default thinking | Focus |
|----------|------------------|-------|
| Scope checker | off | Scope, sequence, and completion criteria are explicit. |
| Intent checker | minimal | The plan preserves the user's actual request. |
| Risk checker | low | Risks, safety checks, and validation are clear. |
| Clarity checker | off | A competent fresh reader can retell the plan after one read. |
| Ambiguity checker | medium | Remaining ambiguity is harmless and non-material. |

## UI

Midwit Gate now uses progressive disclosure through a single live gate card while the main agent is waiting. The card updates in place instead of spamming the chat with every lifecycle event:

- current phase and elapsed time,
- what the planner/reviewers are doing now,
- reviewer status lines for all five reviewers,
- pass/error counts and quorum target,
- the current pitch summary,
- what happens next,
- cancel/report shortcuts.

When quorum passes, Midwit Gate emits one compact final chat summary with a vote table:

```text
Midwit Gate · Quorum passed 4/5 in 38s. Review the plan editor to continue.

✓ Scope checker      0.91  Clear scope and completion criteria
✓ Intent checker     0.84  Preserves the user's request
✓ Risk checker       0.78  Validation is adequate
✓ Clarity checker    0.88  Easy to retell
✗ Ambiguity checker  0.62  Wants explicit rollback plan
```

Expand a Midwit Gate chat summary to see deeper details such as the pitch under review, reviewer stance/model/thinking, full understanding, blocking issues, missing decisions, notes, and aggregate reports. These expanded details are stored in message metadata for rendering. The extension filters Midwit Gate chat messages out of LLM context before provider calls, so the main agent receives the approved prompt without progress chatter.

Pi also still shows a Midwit Gate status line with the current phase:

- `Midwit Gate: drafting 1/5`
- `Midwit Gate: reviewing 1/5`
- `Midwit Gate: passed 4/5`

During review, the widget tells you that the main agent is waiting and points to the live report shortcut. You can toggle Midwit Gate on/off with `Ctrl+Shift+G` by default, cancel an active gate with `Ctrl+Shift+X`, or use `/midwit cancel`; the original prompt will not be sent unless you then explicitly run `/midwit override`. If a gate run is active, pressing `Ctrl+C` also cancels that run while still behaving like Pi's normal clear-editor key.

Set `MIDWIT_GATE_CHAT_UPDATES=false` if you want no final/intervention chat summaries and prefer the live card plus report command only.

### Live/final reviewer report

Open reviewer results with either:

- `Ctrl+Shift+M`
- `/midwit-report`
- `/midwit report`

During a gate run, this shows a **live report**:

- which reviewers are still running,
- which reviewers passed or failed,
- reviewer model/thinking/stance,
- each reviewer's understanding,
- blocking issues,
- missing decisions,
- non-blocking notes,
- reviewer errors.

After a gate run, the same command shows the latest persisted report from the session.

### Clarification requests

If the planner or reviewers still have material questions, Midwit Gate now opens a merged clarification round instead of immediately handing the answer to the main agent.

The clarification round:

- collects blocking issues and missing decisions from the current reviewer pass,
- first does exact/rule-based deduplication,
- then runs a prompt-based semantic dedupe pass to merge equivalent questions,
- opens one editable answer sheet for the whole round,
- lets you revise earlier answers before submit,
- records the answers as clarification history,
- sends those answers back into the planner,
- re-runs the same reviewers on the revised pitch.

Only after a later reviewer pass agrees the task is clear enough does the approved plan go to the main agent. If the loop stalls or hits its stop condition first, the user gets an explicit manual-override-or-cancel escalation path.

## Commands

| Command | Behavior |
|---------|----------|
| `/midwit on` | Enable initial-prompt mode. Same as `/midwit initial`. |
| `/midwit initial` | Gate only the first normal prompt in a session. This is the default mode when the gate is enabled. |
| `/midwit all` | Gate every normal prompt. Useful for strict workflows, but bad for contextual replies like "yes, do that". |
| `/midwit once` | Gate the next normal prompt only, then turn off. |
| `/midwit off` | Disable the gate. If a gate is running, cancel it too. |
| `/midwit cancel` | Cancel the active gate run without disabling future gates. |
| `/midwit override` | Explicitly continue with the current or last blocked prompt, bypassing Midwit Gate for that prompt only. |
| `/midwit models` | Show the effective planner/reviewer model and thinking configuration. Same as `/midwit config`. |
| `/midwit set planner model <model\|default>` | Override or reset the smart planner model. |
| `/midwit set planner thinking <level\|default>` | Override or reset the smart planner thinking level. |
| `/midwit set <1-5\|reviewer-id> model <model\|default>` | Override or reset one reviewer model. |
| `/midwit set <1-5\|reviewer-id> thinking <level\|default>` | Override or reset one reviewer thinking level. |
| `/midwit status` | Show current mode, quorum, iteration settings, and links to models/report/override/cancel commands. |
| `/midwit report` | Show the latest/live reviewer report. |
| `/midwit-report` | Show the latest/live reviewer report. |
| `/midwit continue` | Alias for `/midwit override`. |

Keyboard shortcuts:

- `Ctrl+Shift+G` — toggle Midwit Gate on/off (default; override with `MIDWIT_GATE_TOGGLE_SHORTCUT`)
- `Ctrl+Shift+M` — show latest/live reviewer report
- `Ctrl+Shift+X` — cancel the active gate run

Slash commands themselves are not gated.

## Configuration

Configure defaults with JSON files or environment variables before starting Pi. JSON files are the intended agent-editable config: ask an agent to edit them, then the extension will reload them on session start and before each gated prompt. You can also override planner/reviewer models and thinking levels at runtime with `/midwit set ...`; runtime command overrides are persisted in the session state and take precedence over JSON files.

### Agent-editable JSON config

Global default path:

```text
~/.config/pi/midwit-gate.json
```

If `XDG_CONFIG_HOME` is set, the global path is:

```text
$XDG_CONFIG_HOME/pi/midwit-gate.json
```

Project-local override path:

```text
.pi/midwit-gate.json
```

To opt a project in, set `gate.enabled` in the local file:

```json
{
  "gate": {
    "enabled": true,
    "mode": "initial"
  }
}
```

Schema:

```json
{
  "gate": {
    "enabled": true,
    "mode": "initial",
    "failureMode": "fail-open",
    "confidencePolicy": "threshold",
    "strongNoAction": "ask-user",
    "strongNoMinConfidence": 0.9,
    "strongNoMinCount": 1,
    "maxStalledIterations": 2,
    "stagnationSimilarityThreshold": 0.98,
    "earlyExit": true,
    "subprocessParseRetries": 1
  },
  "planner": {
    "model": "anthropic/claude-sonnet-4-5",
    "thinking": "high"
  },
  "reviewers": [
    {
      "id": "security-reviewer",
      "label": "Security reviewer",
      "focus": "checking security, secret handling, and destructive operations",
      "stance": "Pass only if security and data-loss risks are explicit and mitigated.",
      "model": "openai/gpt-5.4-mini",
      "thinking": "medium"
    }
  ],
  "prompts": {
    "planner": "Planner prompt template. Uses {{userPrompt}}, {{clarificationBlock}}, {{previousPlanBlock}}, {{feedbackBlock}}, {{maxPitchWords}}.",
    "reviewer": "Reviewer prompt template. Uses {{userPrompt}}, {{plan}}, {{reviewer.label}}, {{reviewer.focus}}, {{reviewer.stance}}.",
    "questionDeduper": "Question deduper prompt template. Uses {{userPrompt}}, {{questions}}.",
    "approvedPrompt": "Main-agent prompt after approval. Uses {{userPrompt}}, {{approvalSource}}, {{approvedPlan}}.",
    "clarifiedPrompt": "Main-agent prompt after human clarification. Uses {{userPrompt}}, {{clarification}}, {{question}}, {{plan}}, {{report}}."
  }
}
```

Notes:

- On session start, Midwit Gate creates the global config if it is missing, with the default planner, reviewer panel, and prompt templates.
- The gate is off unless the project-local `.pi/midwit-gate.json` opts in with `gate.enabled: true`, or you enable it manually with `/midwit ...` during the session.
- The local `.pi/midwit-gate.json` file is optional. If present, it overrides the global config.
- `gate`, `planner`, and `prompts` merge shallowly: local keys override global keys, and omitted local keys continue to come from the global file.
- `reviewers` is an array, so it overrides as a panel: if local `reviewers` is present and non-empty, it replaces the global reviewer panel.
- If the global file is missing `prompts` or individual prompt templates on session start, the missing prompt defaults are inserted into the global file so there is no hidden prompt text.
- Local override files are not auto-expanded with missing prompt keys; omitted local prompt keys continue to inherit from the global file.
- Once prompt templates exist in global JSON, they are intentionally pinned there. Future extension updates will not overwrite edited or previously seeded prompt text; ask an agent to edit the JSON file, or remove a global prompt key to have the current default reinserted on the next session start.
- `planner.model` and each reviewer `model` are optional. If omitted, the extension falls back to environment defaults when present, otherwise the child Pi process uses its default model.
- `thinking` is optional; valid values are `off`, `minimal`, `low`, `medium`, `high`, and `xhigh`. If omitted, the extension falls back to environment/built-in defaults.
- If `reviewers` is present and non-empty, it replaces the built-in reviewer panel. You can add or remove reviewers by editing the array.
- Reviewer `id`, `label`, `focus`, and `stance` are all configurable. The default reviewer prompt includes both `focus` and `stance`; if you change the reviewer prompt template, include whichever reviewer fields you want the model to see.
- Missing reviewer fields fall back to the built-in reviewer at the same array index, or a generic reviewer when there is no built-in fallback.
- `enabled` and `mode` are intended to be project-local settings in `.pi/midwit-gate.json`. `enabled` defaults to `false`; `mode` defaults to `initial`.
- `failureMode` controls what happens if the gate itself crashes: `fail-open` sends the original prompt through, `fail-closed` blocks it.
- `confidencePolicy` is `threshold` or `verdict-only`. `threshold` requires both `pass=true` and confidence `>= MIDWIT_GATE_MIN_CONFIDENCE`; `verdict-only` uses confidence for reporting/escalation only.
- `strongNoAction` is `ignore`, `ask-user`, or `revise`. A strong no is a failing review with at least one blocking issue or missing decision and confidence `>= strongNoMinConfidence`.
- The planner prompt now also receives `clarificationBlock`, which contains the full answered clarification history from prior rounds and should be treated as authoritative.
- The question deduper prompt receives `questions`, a keyed list of candidate reviewer/planner clarification questions, and should merge only those that truly share the same required user answer.
- `maxStalledIterations` and `stagnationSimilarityThreshold` control stop-condition escalation when the clarification/re-review loop is no longer converging.
- `earlyExit` lets the gate stop remaining reviewer subprocesses once quorum has already passed or become impossible.
- `subprocessParseRetries` reruns a child planner/reviewer call when it returns malformed JSON.
- `MIDWIT_GATE_REQUIRED_PASSES` is clamped to the effective reviewer count at runtime.

### Environment variables

Environment variables are still useful for process-wide defaults or secrets-free deployment config.

| Variable | Default | Notes |
|----------|---------|-------|
| `MIDWIT_GATE_MODE` | `initial` | Default mode used when the gate is enabled: `initial` or `all`. |
| `MIDWIT_GATE_CHAT_UPDATES` | `true` | Show final/intervention Midwit Gate summaries in chat. Accepts `true/false`, `on/off`, `yes/no`, or `1/0`. |
| `MIDWIT_GATE_TOGGLE_SHORTCUT` | `ctrl+shift+g` | Keyboard shortcut for toggling Midwit Gate on/off. |
| `MIDWIT_GATE_MAX_ITERATIONS` | `5` | Clamped to `1..20`. |
| `MIDWIT_GATE_REQUIRED_PASSES` | `4` | Clamped to `1..reviewer_count`. |
| `MIDWIT_GATE_MIN_CONFIDENCE` | `0.7` | Reviewer pass must have at least this confidence. |
| `MIDWIT_GATE_MAX_PITCH_WORDS` | `220` | Clamped to `50..1000`. |
| `MIDWIT_GATE_SUBPROCESS_TIMEOUT_MS` | `120000` | Per planner/reviewer subprocess timeout; clamped to `10000..900000`. |
| `MIDWIT_GATE_SUBPROCESS_PARSE_RETRIES` | `1` | Retries planner/reviewer subprocesses that return malformed JSON; clamped to `0..10`. |
| `MIDWIT_GATE_FAILURE_MODE` | `fail-open` | `fail-open` or `fail-closed`. |
| `MIDWIT_GATE_CONFIDENCE_POLICY` | `threshold` | `threshold` or `verdict-only`. |
| `MIDWIT_GATE_STRONG_NO_ACTION` | `ask-user` | `ignore`, `ask-user`, or `revise`. |
| `MIDWIT_GATE_STRONG_NO_MIN_CONFIDENCE` | `0.9` | Confidence floor for strong-concern escalation. |
| `MIDWIT_GATE_STRONG_NO_MIN_COUNT` | `1` | How many strong no votes trigger escalation. |
| `MIDWIT_GATE_MAX_STALLED_ITERATIONS` | `2` | Consecutive stagnant iterations before asking for human review. |
| `MIDWIT_GATE_STAGNATION_SIMILARITY` | `0.98` | Word-set similarity threshold used by stall detection. |
| `MIDWIT_GATE_EARLY_EXIT` | `true` | Stop remaining reviewer subprocesses once outcome is decided. |
| `MIDWIT_GATE_SMART_MODEL` | unset | Model pattern for the planner. If unset, child Pi uses its default model. |
| `MIDWIT_GATE_SMART_THINKING` | `medium` | Planner thinking level. |
| `MIDWIT_GATE_REVIEWER_MODEL` | unset | Shared reviewer model override. |
| `MIDWIT_GATE_REVIEWER_THINKING` | per-profile | Shared reviewer thinking override. |
| `MIDWIT_GATE_REVIEWER_1_MODEL` ... `MIDWIT_GATE_REVIEWER_5_MODEL` | unset | Per-reviewer model override. |
| `MIDWIT_GATE_REVIEWER_1_THINKING` ... `MIDWIT_GATE_REVIEWER_5_THINKING` | per-profile | Per-reviewer thinking override. |

Valid thinking levels are `off`, `minimal`, `low`, `medium`, `high`, and `xhigh`.

Environment example:

```sh
MIDWIT_GATE_MODE=initial \
MIDWIT_GATE_REQUIRED_PASSES=4 \
MIDWIT_GATE_REVIEWER_MODEL='openai/gpt-5.4-mini' \
MIDWIT_GATE_REVIEWER_5_THINKING=medium \
pi
```

Runtime examples:

```text
/midwit models
/midwit set planner model anthropic/claude-sonnet-4-5
/midwit set planner thinking high
/midwit set 1 model openai/gpt-5.4-mini
/midwit set ambiguity-checker thinking medium
/midwit set 1 model default
```

## Persistence

The extension appends custom session entries for:

- current Midwit Gate state (`midwit-gate-state`), including runtime command overrides,
- each completed review iteration (`midwit-gate-iteration`).

The global `~/.config/pi/midwit-gate.json` and optional local `.pi/midwit-gate.json` files are normal config and can be edited by agents directly. They contain the planner/reviewer prompt templates under `prompts`; those templates are the source of the extra instructions sent to child agents.

This allows `/midwit-report` to show the latest report after reload/resume.

## Failure and fallback behavior

- Reviewer errors count as failed votes, not fatal gate failures.
- Malformed child JSON can be retried automatically with `MIDWIT_GATE_SUBPROCESS_PARSE_RETRIES` / `gate.subprocessParseRetries`.
- If quorum passes, the approved prompt is returned as an input transform so print/JSON modes wait for the actual answer.
- If the gate itself fails, `failureMode=fail-open` sends the original prompt and `failureMode=fail-closed` blocks it.
- If the gate cannot proceed in non-UI mode because it needs human clarification or hits a stop-condition escalation, it follows `failureMode`: `fail-open` sends the original prompt and `fail-closed` blocks it.
- Child subprocesses are killed on timeout and on Pi session shutdown.

## When to use each mode

Use `initial` for normal sessions. It catches unclear kickoff prompts while avoiding follow-up context problems.

Use `once` when you want a later large or risky prompt reviewed, e.g. before a big refactor request.

Use `all` only when each user prompt is expected to be self-contained.

## Known limitations

- Reviewers only see the standalone pitch and original gated prompt, not full conversation context.
- Attached images are preserved for the main agent, but the planner/reviewer subprocesses see only a text note that images were attached.
- The live card updates by lifecycle/status events; child model tokens are not streamed token-by-token.
- Built-in environment variable overrides target the default five reviewer slots. Use `.pi/midwit-gate.json` when you want to add/remove reviewers or configure reviewer identities/personas.
- The gate adds latency and model/API cost: one planner call plus up to five reviewer calls per iteration.

## Development

```sh
npm install
npm run typecheck
pi -e ./
```

## Package manifest

This repository is a Pi package. `package.json` declares:

```json
{
  "pi": {
    "extensions": ["./extensions"]
  }
}
```

## License

MIT
