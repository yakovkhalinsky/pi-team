# Research

Open-ended design exploration. Each subdirectory is **one research thread** (a question we don't know the answer to yet) and contains one or more **prototypes** (cheap artefacts that test the question).

## Lifecycle

```
research/  ──multiple prototypes, open question, no shape agreed──┐
                                                                     │
                                                                     ▼
plans/      ──file-by-file plan, cost bounded, ready to implement──► code
                                                                     ▲
                                                                     │
references/ ──settled protocol facts (the paper, role contracts)────┘
bugs/       ──open defects with reproduction + proposed fix────────► fix
```

A research thread is **not** a plan. It is a log of what we have tried, what we learned, and what we are still uncertain about. A research thread graduates to a plan when:

- ≥ 2 prototypes point at the same answer, **or**
- A single prototype is decisive enough that we can write a file-by-file plan from it.

It does not graduate when a single prototype "looks right" — the prototype might be capturing the author's preference rather than testing the question. The graduation bar is cheap to set and cheap to clear; do not skip it.

## What goes here

- A HTML/CSS mockup testing a TUI shape (see `fleet-tui-prototypes/`).
- A recorded terminal session of a competitor's tool, with notes.
- A JSON file with realistic mock data, paired with a sketch of what the rendering would look like.
- A short TypeScript snippet exploring a new module's API surface.
- A transcript of a real session annotated with "what this proves, what it does not."

## What does not go here

- A proposed protocol change. That is a plan, an RFC, or a paper revision.
- A bug with a known reproduction. That is `bugs/`.
- A settled fact about the system. That is `reference/` (if it's a project doc) or `packages/pi-agents-team/src/...` (if it's code).
- A wish list. If the question is "should we do X?", the answer is research; if the question is "how do we do X?", the answer is a plan.

## File conventions

Each research subdirectory has:

- A `README.md` that names the question, lists the prototypes, and tracks "what we are still uncertain about."
- One or more prototype files, named `prototype-v<n>-YYYY-MM-DD.<ext>` with a date so multiple prototypes don't collide.

When a research thread graduates, the prototypes stay in `research/` (the dead ends are part of the record) and a new plan is created in `plans/` that points back at them.
