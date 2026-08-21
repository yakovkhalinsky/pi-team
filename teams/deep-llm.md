# Deep LLM Team

For LLM systems, data science, RAG, evaluation, inference services, and LLM product UX.

## Roster

| Role | Specialised name | Protocol mapping | Thinking | pi profile |
|---|---|---|---|---|
| Team Lead | Team Lead | team-lead | high | team-lead |
| Principal Architect | Principal LLM Architect | principal-architect | high | principal-architect |
| Sceptical Architect | Sceptical Principal LLM Architect | sceptical-architect | high | sceptical-architect |
| Product Manager | Senior Technical PM | product-manager | medium | product-manager |
| LLM Engineer | Senior LLM Engineer | backend | medium | backend |
| Staff Backend Engineer | Senior Staff Backend Engineer | backend | medium | backend |
| Full Stack Engineer | Senior Full Stack Engineer | frontend | medium | frontend |
| QA | Senior QA Engineer | qa | medium | qa |
| Integrator | Integrator | integrator | medium | integrator |

## Required review gates
- Core: Team Lead + Principal LLM Architect + Sceptical LLM Architect (always)
- Security: on-demand (especially for prompt injection, data leakage)
- QA: on-demand (especially for evaluation reproducibility)

## Dispatch lane
- `track: llm` routes model/data-science implementation tasks to the LLM Engineer
- The Staff Backend Engineer handles infrastructure and integration code
- The Full Stack Engineer handles LLM product UX

## Use when
- LLM-powered features (chat, summarisation, extraction, classification)
- RAG systems (embedding, retrieval, generation pipelines)
- Evaluation harnesses and reproducible eval pipelines
- Inference services and model serving
- Prompt engineering and prompt management
- LLM observability (drift, latency, cost monitoring)
- Fine-tuning pipelines
- LLM product UX (streaming, citations, feedback loops)

## LLM-specific design gate requirements
- Quality thresholds defined (accuracy, latency, cost)
- Safety thresholds defined (toxicity, PII, prompt injection)
- Evaluation plan in design note
- Fallback/graceful degradation strategy
- Cost envelope and rate limiting