variable "prefix" {
  type    = string
  default = "amo"
}
variable "environment" {
  type    = string
  default = "prod"
}
variable "location" {
  type    = string
  default = "westus3"
}
variable "location_short" {
  type    = string
  default = "wus3"
}
variable "tenant_id" {
  type = string
}
variable "vnet_cidr" {
  type    = string
  default = "10.60.0.0/22"
}
variable "postgres_sku" {
  type    = string
  default = "B_Standard_B1ms"
}
variable "image_ref" {
  type    = string
  default = "ghcr.io/saulpatinojr/azure-migration-orchestrator-appliance:latest"
}
variable "assessment_scope_ids" {
  type        = list(string)
  description = "Subscriptions or management groups the appliance may discover (Reader). Execution RBAC is granted per engagement, never here."
  default     = []
}
variable "tags" {
  type    = map(string)
  default = {}
}
