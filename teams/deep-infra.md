# Deep Infra Team

For cloud infrastructure, IaC, delivery pipelines, and reliability.

## Roster

| Role | Specialised name | Protocol mapping | Thinking | pi profile |
|---|---|---|---|---|
| Team Lead | Team Lead | team-lead | high | team-lead |
| Principal Architect | Principal Cloud & Infrastructure Architect | principal-architect | high | principal-architect |
| Sceptical Architect | Sceptical Architect | sceptical-architect | high | sceptical-architect |
| Security Engineer | Senior Security Engineer | security-reviewer | high | security-reviewer |
| Product Manager | Senior Technical PM | product-manager | medium | product-manager |
| Cloud Engineer | Senior Cloud Engineer | backend | medium | backend |
| SRE | Senior SRE | qa | medium | qa |
| Integrator | Integrator | integrator | medium | integrator |

## Required review gates
- Core: Team Lead + Principal Cloud Architect + Sceptical Architect (always)
- **Security: required for every task** (REQUIRED_REVIEW_GATES=security)
- QA: on-demand (SRE provides reliability evidence)

## Use when
- Cloud infrastructure provisioning and management
- Infrastructure as Code (Terraform, Pulumi, CloudFormation)
- CI/CD pipeline design and implementation
- Reliability: monitoring, alerting, SLOs, error budgets
- Capacity planning and scaling
- Network architecture and security groups
- Backup and disaster recovery
- Cost optimisation
- Container orchestration (Kubernetes, ECS, etc.)

## Protocol mappings
- `PROTOCOL_SECURITY_REVIEWER` = Senior Security Engineer (rostered by default)
- `REQUIRED_REVIEW_GATES` = security

## Infra-specific rules
- IAM, network, and security group changes require security review
- The SRE provides reliability and operability evidence as supporting QA
- All infrastructure changes must be IaC — no manual console changes
- Rollback plans are mandatory in design notes