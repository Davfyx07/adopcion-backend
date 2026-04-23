terraform {
  required_version = ">= 1.6.0"

  required_providers {
    azurerm = {
      source  = "hashicorp/azurerm"
      version = "~> 4.0"
    }
  }

  # Recommended for team/production usage. Configure per environment.
  # backend "azurerm" {
  #   resource_group_name  = "rg-tfstate-prod"
  #   storage_account_name = "sttfstateprod001"
  #   container_name       = "tfstate"
  #   key                  = "adopcion-backend-prod.tfstate"
  # }
}

provider "azurerm" {
  features {}
  subscription_id = var.subscription_id
}

resource "azurerm_resource_group" "rg" {
  name     = var.resource_group_name
  location = var.location
}

resource "azurerm_service_plan" "plan" {
  name                = var.service_plan_name
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  os_type             = "Linux"
  sku_name            = var.service_plan_sku
}

resource "azurerm_postgresql_flexible_server" "postgres" {
  name                          = var.postgres_server_name
  resource_group_name           = azurerm_resource_group.rg.name
  location                      = azurerm_resource_group.rg.location
  version                       = "14"
  administrator_login           = var.db_admin_user
  administrator_password        = var.db_admin_password
  storage_mb                    = var.postgres_storage_mb
  sku_name                      = var.postgres_sku
  zone                          = var.postgres_zone
  public_network_access_enabled = var.postgres_public_network_access_enabled
}

resource "azurerm_postgresql_flexible_server_database" "appdb" {
  name      = var.db_name
  server_id = azurerm_postgresql_flexible_server.postgres.id
  charset   = "UTF8"
  collation = "en_US.utf8"
}

resource "azurerm_postgresql_flexible_server_firewall_rule" "allow_azure" {
  count            = var.allow_azure_services_to_postgres ? 1 : 0
  name             = "allow-azure-services"
  server_id        = azurerm_postgresql_flexible_server.postgres.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}

locals {
  base_app_settings = {
    PORT                     = tostring(var.app_port)
    WEBSITES_PORT            = tostring(var.app_port)
    WEBSITES_ENABLE_APP_SERVICE_STORAGE = "false"
    JWT_SECRET               = var.jwt_secret
    JWT_EXPIRES_IN           = var.jwt_expires_in
    DB_HOST                  = azurerm_postgresql_flexible_server.postgres.fqdn
    DB_PORT                  = "5432"
    DB_NAME                  = azurerm_postgresql_flexible_server_database.appdb.name
    DB_USER                  = "${var.db_admin_user}@${azurerm_postgresql_flexible_server.postgres.name}"
    DB_PASSWORD              = var.db_admin_password
    SMTP_HOST                = var.smtp_host
    SMTP_PORT                = tostring(var.smtp_port)
    SMTP_USER                = var.smtp_user
    SMTP_PASS                = var.smtp_pass
    FRONTEND_URL             = var.frontend_url
    NODE_ENV                 = var.node_env
  }
}

resource "azurerm_linux_web_app" "app" {
  name                = var.app_name
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_service_plan.plan.location
  service_plan_id     = azurerm_service_plan.plan.id
  https_only          = true

  identity {
    type = "SystemAssigned"
  }

  site_config {
    always_on = var.app_always_on

    application_stack {
      docker_image_name   = "${var.docker_image_repository}:${var.docker_image_tag}"
      docker_registry_url = "https://${var.acr_login_server}"
    }

    health_check_path = "/health"
  }

  app_settings = merge(local.base_app_settings, var.extra_app_settings)
}

data "azurerm_container_registry" "acr" {
  name                = var.acr_name
  resource_group_name = var.acr_resource_group_name
}

resource "azurerm_role_assignment" "app_acr_pull" {
  scope                = data.azurerm_container_registry.acr.id
  role_definition_name = "AcrPull"
  principal_id         = azurerm_linux_web_app.app.identity[0].principal_id
}