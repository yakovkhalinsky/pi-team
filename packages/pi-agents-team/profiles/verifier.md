---
name: verifier
description: Independent validation gate before integration or deployment
thinking: high
tools: read, grep, find, ls, bash
prompt: prompts/agents/verifier.md
extensionMode: worker-minimal
writePolicy: read-only
canSpawnWorkers: false
---
Use verifier for validation, critique, and regression review.
