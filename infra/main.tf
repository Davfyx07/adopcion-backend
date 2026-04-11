# 1. Proveedor de Azure
provider "azurerm" {
  features {}
}

# 2. Grupo de Recursos
resource "azurerm_resource_group" "rg" {
  name     = var.resource_group_name
  location = var.location
}

# 3. Plan de Servicio (Linux)
resource "azurerm_service_plan" "plan" {
  name                = "plan-adopcion-backend"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  os_type             = "Linux"
  sku_name            = "B1" # Cambiar a F1 si es estrictamente gratuito
}

# 4. Web App para Node.js
resource "azurerm_linux_web_app" "app" {
  name                = var.app_name
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_service_plan.plan.location
  service_plan_id     = azurerm_service_plan.plan.id

  site_config {
    application_stack {
      node_version = "20-lts"
    }
    always_on = false # Requerido para planes F1/B1
  }

  app_settings = {
    "PORT"                           = "8080"
    "SCM_DO_BUILD_DURING_DEPLOYMENT" = "true"
    "DB_URL"                         = var.db_url
    "JWT_SECRET"                     = var.jwt_secret
    "SMTP_HOST"                      = "smtp.gmail.com"
    "SMTP_USER"                      = var.smtp_user
    "SMTP_PASS"                      = var.smtp_pass
  }
}

# 5. Base de Datos PostgreSQL (Flexible Server)
resource "azurerm_postgresql_flexible_server" "postgres" {
  name                   = "server-postgres-adopcion-iac"
  resource_group_name    = azurerm_resource_group.rg.name
  location               = azurerm_resource_group.rg.location
  version                = "14"
  administrator_login    = var.db_user
  administrator_password = var.db_password
  storage_mb             = 32768
  sku_name               = "B_Standard_B1ms" # Tier básico
}

# Regla de Firewall para permitir servicios de Azure
resource "azurerm_postgresql_flexible_server_firewall_rule" "allow_azure" {
  name             = "allow-azure-services"
  server_id        = azurerm_postgresql_flexible_server.postgres.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}