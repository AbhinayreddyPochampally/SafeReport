# docs/agents/

Agent definitions for SafeReport. The master catalogue with cadence,
ownership, and when-to-dispatch lives in [`../Agents.md`](../Agents.md).

This directory contains the individual `.md` agent files. The frontmatter
`name:` is what the Task tool matches on.

## Wiring into Claude Code

```bash
mkdir -p .claude/agents
cp docs/agents/*.md .claude/agents/
```
