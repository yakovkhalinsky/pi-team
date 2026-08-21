# Full-Stack Team

The default preset for features that cut through schema, API, and UI.

## Roster

| Role | Specialised name | Protocol mapping | Thinking | pi profile |
|---|---|---|---|---|
| Team Lead | Team Lead | team-lead | high | team-lead |
| Principal Architect | Principal Software Architect | principal-architect | high | principal-architect |
| Sceptical Architect | Sceptical Architect | sceptical-architect | high | sceptical-architect |
| Product Manager | Senior Technical PM | product-manager | medium | product-manager |
| Full Stack Engineer | Senior Full Stack Engineer | backend, frontend | medium | backend / frontend |
| QA | Senior QA Engineer | qa | medium | qa |
| Integrator | Integrator | integrator | medium | integrator |
| Reviewer | Reviewer | reviewer | medium | reviewer |

## Required review gates
- Core: Team Lead + Principal Architect + Sceptical Architect (always)
- Security: on-demand (when `review-gates: security` declared on task)
- QA: on-demand (when `review-gates: qa` declared on task)

## Execution
- Default: sequential
- Parallel: available with MAX_ACTIVE_IMPLEMENTERS (default 2)

## Use when
- Features involve both backend and frontend changes
- Full vertical slices from database to UI
- API endpoints plus their consuming components
- Schema changes that affect both server and client

## Protocol mappings
- `PROTOCOL_TEAM_LEAD` = Team Lead
- `PROTOCOL_PRINCIPAL_ARCHITECT` = Principal Software Architect
- `PROTOCOL_SCEPTICAL_ARCHITECT` = Sceptical Architect
- `PROTOCOL_SECURITY_REVIEWER` = Senior Security Engineer (not rostered by default; launched on-demand)
- `PROTOCOL_INTEGRATOR` = Integrator

## Full Stack Engineer note
The Full Stack Engineer maps to both `backend` and `frontend` protocol roles. When a task is primarily backend, it uses the `backend` profile; when primarily frontend, it uses the `frontend` profile. The orchestrator selects based on task declared files and resources.