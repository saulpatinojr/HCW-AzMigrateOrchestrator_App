# Appliance on Azure: Container Apps + user-assigned managed identity + PostgreSQL Flexible Server (Entra auth, private)
# + Key Vault (config references) + Log Analytics / Application Insights. No client secrets anywhere (ADR-0022).
terraform {
  required_version = ">= 1.9.0"
  required_providers {
    azurerm = { source = "hashicorp/azurerm", version = "~> 4.0" }
    azuread = { source = "hashicorp/azuread", version = "~> 3.0" }
  }
}

provider "azurerm" {
  features {}
}
provider "azuread" {}

locals {
  name = "${var.prefix}-${var.environment}-${var.location_short}"
  tags = merge({ application = "azure-migration-orchestrator", component = "appliance", environment = var.environment }, var.tags)
}

resource "azurerm_resource_group" "app" {
  name     = "rg-${local.name}-01"
  location = var.location
  tags     = local.tags
}

resource "azurerm_user_assigned_identity" "app" {
  name                = "id-${local.name}-01"
  location            = var.location
  resource_group_name = azurerm_resource_group.app.name
  tags                = local.tags
}

# Reader on each assessment scope: discovery is read-only by default (§3.9).
resource "azurerm_role_assignment" "reader" {
  for_each             = toset(var.assessment_scope_ids)
  scope                = each.value
  role_definition_name = "Reader"
  principal_id         = azurerm_user_assigned_identity.app.principal_id
}

resource "azurerm_log_analytics_workspace" "app" {
  name                = "log-${local.name}-01"
  location            = var.location
  resource_group_name = azurerm_resource_group.app.name
  sku                 = "PerGB2018"
  retention_in_days   = 30
  tags                = local.tags
}

resource "azurerm_application_insights" "app" {
  name                = "appi-${local.name}-01"
  location            = var.location
  resource_group_name = azurerm_resource_group.app.name
  workspace_id        = azurerm_log_analytics_workspace.app.id
  application_type    = "web"
  tags                = local.tags
}

resource "azurerm_virtual_network" "app" {
  name                = "vnet-${local.name}-01"
  location            = var.location
  resource_group_name = azurerm_resource_group.app.name
  address_space       = [var.vnet_cidr]
  tags                = local.tags
}

resource "azurerm_subnet" "aca" {
  name                 = "snet-aca"
  resource_group_name  = azurerm_resource_group.app.name
  virtual_network_name = azurerm_virtual_network.app.name
  address_prefixes     = [cidrsubnet(var.vnet_cidr, 4, 0)]
  delegation {
    name = "aca"
    service_delegation {
      name    = "Microsoft.App/environments"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

resource "azurerm_subnet" "db" {
  name                 = "snet-db"
  resource_group_name  = azurerm_resource_group.app.name
  virtual_network_name = azurerm_virtual_network.app.name
  address_prefixes     = [cidrsubnet(var.vnet_cidr, 4, 1)]
  delegation {
    name = "pg"
    service_delegation {
      name    = "Microsoft.DBforPostgreSQL/flexibleServers"
      actions = ["Microsoft.Network/virtualNetworks/subnets/join/action"]
    }
  }
}

resource "azurerm_private_dns_zone" "pg" {
  name                = "${local.name}.postgres.database.azure.com"
  resource_group_name = azurerm_resource_group.app.name
  tags                = local.tags
}

resource "azurerm_private_dns_zone_virtual_network_link" "pg" {
  name                  = "pg-link"
  resource_group_name   = azurerm_resource_group.app.name
  private_dns_zone_name = azurerm_private_dns_zone.pg.name
  virtual_network_id    = azurerm_virtual_network.app.id
}

# PostgreSQL with Entra-only authentication; the app's managed identity is the database principal.
resource "azurerm_postgresql_flexible_server" "db" {
  name                          = "psql-${local.name}-01"
  location                      = var.location
  resource_group_name           = azurerm_resource_group.app.name
  version                       = "16"
  sku_name                      = var.postgres_sku
  storage_mb                    = 32768
  delegated_subnet_id           = azurerm_subnet.db.id
  private_dns_zone_id           = azurerm_private_dns_zone.pg.id
  public_network_access_enabled = false
  authentication {
    active_directory_auth_enabled = true
    password_auth_enabled         = false
    tenant_id                     = var.tenant_id
  }
  tags       = local.tags
  depends_on = [azurerm_private_dns_zone_virtual_network_link.pg]
}

resource "azurerm_postgresql_flexible_server_active_directory_administrator" "app" {
  server_name         = azurerm_postgresql_flexible_server.db.name
  resource_group_name = azurerm_resource_group.app.name
  tenant_id           = var.tenant_id
  object_id           = azurerm_user_assigned_identity.app.principal_id
  principal_name      = azurerm_user_assigned_identity.app.name
  principal_type      = "ServicePrincipal"
}

resource "azurerm_postgresql_flexible_server_database" "amo" {
  name      = "amo"
  server_id = azurerm_postgresql_flexible_server.db.id
}

resource "azurerm_container_app_environment" "app" {
  name                       = "cae-${local.name}-01"
  location                   = var.location
  resource_group_name        = azurerm_resource_group.app.name
  log_analytics_workspace_id = azurerm_log_analytics_workspace.app.id
  infrastructure_subnet_id   = azurerm_subnet.aca.id
  tags                       = local.tags
}

resource "azurerm_container_app" "api" {
  name                         = "ca-${local.name}-api"
  container_app_environment_id = azurerm_container_app_environment.app.id
  resource_group_name          = azurerm_resource_group.app.name
  revision_mode                = "Single"
  tags                         = local.tags
  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.app.id]
  }
  ingress {
    external_enabled = true
    target_port      = 8081
    traffic_weight {
      latest_revision = true
      percentage      = 100
    }
  }
  template {
    min_replicas = 1
    max_replicas = 3
    container {
      name   = "appliance-api"
      image  = var.image_ref
      cpu    = 0.5
      memory = "1Gi"
      env {
        name  = "AMO_ENTRA_TENANT_ID"
        value = var.tenant_id
      }
      env {
        name  = "AMO_ENTRA_CLIENT_ID"
        value = azuread_application.api.client_id
      }
      env {
        name  = "AMO_ENTRA_AUDIENCE"
        value = "api://${azuread_application.api.client_id}"
      }
      env {
        name  = "AMO_CREDENTIAL_KIND"
        value = "managed-identity"
      }
      env {
        name  = "AZURE_CLIENT_ID"
        value = azurerm_user_assigned_identity.app.client_id
      }
      env {
        # Entra token auth to PostgreSQL: the app exchanges its managed identity for a DB token at connect time (no password).
        name  = "DATABASE_URL"
        value = "postgres://${azurerm_user_assigned_identity.app.name}@${azurerm_postgresql_flexible_server.db.fqdn}:5432/amo?sslmode=require"
      }
      env {
        name  = "APPLICATIONINSIGHTS_CONNECTION_STRING"
        value = azurerm_application_insights.app.connection_string
      }
    }
  }
}

# Entra app registration for the appliance API with app roles mapped to authorization levels.
resource "azuread_application" "api" {
  display_name     = "Azure Migration Orchestrator (${var.environment})"
  sign_in_audience = "AzureADMyOrg"
  identifier_uris  = [] # set to ["api://<client_id>"] after creation (azuread requires the ID first)

  dynamic "app_role" {
    for_each = {
      "Migration.Plan"                = "Plan migrations (read-only discovery and planning)"
      "Migration.Execute"             = "Record approvals and run gated, reversible execution (Resource Mover prepare/initiate/discard)"
      "Migration.Execute.Destructive" = "Commit cutovers and destructive operations"
    }
    content {
      allowed_member_types = ["User", "Application"]
      description          = app_role.value
      display_name         = app_role.key
      enabled              = true
      id                   = uuidv5("url", "amo-role-${app_role.key}")
      value                = app_role.key
    }
  }
}

# Worker: same image, different command; polls Azure long-running operations and updates the repository (ADR-0026).
resource "azurerm_container_app" "worker" {
  name                         = "ca-${local.name}-worker"
  container_app_environment_id = azurerm_container_app_environment.app.id
  resource_group_name          = azurerm_resource_group.app.name
  revision_mode                = "Single"
  tags                         = local.tags
  identity {
    type         = "UserAssigned"
    identity_ids = [azurerm_user_assigned_identity.app.id]
  }
  template {
    min_replicas = 1
    max_replicas = 1
    container {
      name    = "worker"
      image   = var.image_ref
      command = ["node", "apps/worker/dist/main.js"]
      cpu     = 0.25
      memory  = "0.5Gi"
      env {
        name  = "AMO_ENTRA_TENANT_ID"
        value = var.tenant_id
      }
      env {
        name  = "AMO_CREDENTIAL_KIND"
        value = "managed-identity"
      }
      env {
        name  = "AZURE_CLIENT_ID"
        value = azurerm_user_assigned_identity.app.client_id
      }
      env {
        name  = "DATABASE_URL"
        value = "postgres://${azurerm_user_assigned_identity.app.name}@${azurerm_postgresql_flexible_server.db.fqdn}:5432/amo?sslmode=require"
      }
    }
  }
}
