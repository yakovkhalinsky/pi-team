---
name: builder
description: Produce durable artefacts and self-validate before handing to the Verifier
thinking: medium
tools: read, bash, edit, write
prompt: prompts/agents/builder.md
extensionMode: worker-minimal
writePolicy: scoped-write
canSpawnWorkers: false
---
Use builder for scoped implementation work with explicit path ownership.
