# Deep Security Team

For security features and hardening on your own codebase.

## Roster

| Role | Specialised name | Protocol mapping | Thinking | pi profile |
|---|---|---|---|---|
| Team Lead | Team Lead | team-lead | high | team-lead |
| Principal Architect | Principal Security Architect | principal-architect | high | principal-architect |
| Sceptical Architect | Sceptical Architect | sceptical-architect | high | sceptical-architect |
| Security Engineer | Senior Security Engineer | security-reviewer | high | security-reviewer |
| Product Manager | Senior Technical PM | product-manager | medium | product-manager |
| Security Implementer | Senior Security Implementation Engineer | backend | medium | backend |
| Penetration Tester | Senior Penetration Tester | reviewer | medium | reviewer |
| QA | Senior QA Engineer | qa | medium | qa |
| Integrator | Integrator | integrator | medium | integrator |

## Required review gates
- Core: Team Lead + Principal Security Architect + Sceptical Architect (always)
- **Security: required for every task** (REQUIRED_REVIEW_GATES=security)
- QA: on-demand

## Use when
- Security features (auth, authz, encryption, audit logging)
- Hardening existing codebase against vulnerabilities
- OWASP compliance work
- Security architecture review and redesign
- Vulnerability remediation
- Penetration testing automation
- Supply chain security
- Secrets management implementation

## Protocol mappings
- `PROTOCOL_SECURITY_REVIEWER` = Senior Security Engineer (rostered by default, not on-demand)
- `REQUIRED_REVIEW_GATES` = security

## Security-specific rules
- The Security Engineer is rostered by default (unlike other presets)
- Every task requires security approval before integration
- The Penetration Tester provides adversarial supporting evidence
- Threat modelling is mandatory in the design gate