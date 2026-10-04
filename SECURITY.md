# Security policy

Report vulnerabilities privately to security@hybridcloudworks.com (or via GitHub private vulnerability reporting). Please do not open public issues for security findings. Expect an acknowledgement within 3 business days.

Scope highlights: the appliance authenticates every request with Entra ID, uses managed identity or workload identity federation (never client secrets), discovers through Azure Resource Graph with Reader-only RBAC, and ships with execution disabled in the project profile. Assessments are session-only in the first release. The shared core it consumes is `saulpatinojr/HCW-AzMigrateOrchestrator_Addon`; report core issues there. Supported version: `main`.
