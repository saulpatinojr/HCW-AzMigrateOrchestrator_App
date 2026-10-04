output "api_fqdn" {
  value = azurerm_container_app.api.ingress[0].fqdn
}
output "api_client_id" {
  value = azuread_application.api.client_id
}
output "managed_identity_principal_id" {
  value = azurerm_user_assigned_identity.app.principal_id
}
output "post_apply" {
  value = "1) Set identifier_uris = [\"api://<api_client_id>\"] and re-apply. 2) Assign app roles to users/groups in Entra. 3) For Resource Mover, grant the managed identity Contributor on the source and target resource groups per engagement, then remove it."
}
