variable "subscription_id" {
	description = "Azure subscription ID where resources are deployed."
	type        = string
}

variable "resource_group_name" {
	description = "Resource group name. Import existing RG if already created in Azure."
	type        = string
}

variable "location" {
	description = "Azure region for resources."
	type        = string
}

variable "service_plan_name" {
	description = "Name of the App Service plan."
	type        = string
}

variable "service_plan_sku" {
	description = "App Service plan SKU (B1, S1, P1v3, etc.)."
	type        = string
	default     = "B1"
}

variable "app_name" {
	description = "Name of the Linux Web App."
	type        = string
}

variable "app_port" {
	description = "Container port exposed by the Node.js application."
	type        = number
	default     = 8080
}

variable "app_always_on" {
	description = "Enable Always On in App Service (recommended for production plans)."
	type        = bool
	default     = true
}

variable "docker_image_repository" {
	description = "Container image repository path in ACR, e.g. myregistry.azurecr.io/adopcion-backend."
	type        = string
}

variable "docker_image_tag" {
	description = "Container image tag to deploy. CI/CD updates this value."
	type        = string
	default     = "latest"
}

variable "acr_name" {
	description = "Azure Container Registry name."
	type        = string
}

variable "acr_resource_group_name" {
	description = "Resource group where ACR exists."
	type        = string
}

variable "acr_login_server" {
	description = "ACR login server, e.g. myregistry.azurecr.io."
	type        = string
}

variable "postgres_server_name" {
	description = "PostgreSQL Flexible Server name."
	type        = string
}

variable "db_name" {
	description = "Application database name."
	type        = string
}

variable "db_admin_user" {
	description = "PostgreSQL administrator username."
	type        = string
}

variable "db_admin_password" {
	description = "PostgreSQL administrator password."
	type        = string
	sensitive   = true
}

variable "postgres_storage_mb" {
	description = "PostgreSQL storage size in MB."
	type        = number
	default     = 32768
}

variable "postgres_sku" {
	description = "PostgreSQL sku, e.g. B_Standard_B1ms."
	type        = string
	default     = "B_Standard_B1ms"
}

variable "postgres_zone" {
	description = "Availability zone for PostgreSQL server."
	type        = string
	default     = "1"
}

variable "postgres_public_network_access_enabled" {
	description = "Enable public network access for PostgreSQL server."
	type        = bool
	default     = true
}

variable "allow_azure_services_to_postgres" {
	description = "Create firewall rule 0.0.0.0 for Azure services."
	type        = bool
	default     = true
}

variable "jwt_secret" {
	description = "JWT signing secret."
	type        = string
	sensitive   = true
}

variable "jwt_expires_in" {
	description = "JWT expiration value consumed by the application."
	type        = string
	default     = "24h"
}

variable "smtp_host" {
	description = "SMTP host used by backend notifications."
	type        = string
	default     = "smtp.gmail.com"
}

variable "smtp_port" {
	description = "SMTP port used by backend notifications."
	type        = number
	default     = 587
}

variable "smtp_user" {
	description = "SMTP username."
	type        = string
}

variable "smtp_pass" {
	description = "SMTP password or app password."
	type        = string
	sensitive   = true
}

variable "frontend_url" {
	description = "Frontend URL used in generated links."
	type        = string
}

variable "node_env" {
	description = "NODE_ENV runtime value for the application."
	type        = string
	default     = "production"
}

variable "extra_app_settings" {
	description = "Optional additional app settings to merge into the web app configuration."
	type        = map(string)
	default     = {}
}
