output "resource_group_name" {
	value       = azurerm_resource_group.rg.name
	description = "Resource group name."
}

output "service_plan_id" {
	value       = azurerm_service_plan.plan.id
	description = "App Service plan ID."
}

output "web_app_name" {
	value       = azurerm_linux_web_app.app.name
	description = "Linux Web App name."
}

output "web_app_default_hostname" {
	value       = azurerm_linux_web_app.app.default_hostname
	description = "Default host name for the deployed backend."
}

output "postgres_server_fqdn" {
	value       = azurerm_postgresql_flexible_server.postgres.fqdn
	description = "PostgreSQL Flexible Server FQDN."
}

output "postgres_database_name" {
	value       = azurerm_postgresql_flexible_server_database.appdb.name
	description = "Application database name."
}

output "web_app_identity_principal_id" {
	value       = azurerm_linux_web_app.app.identity[0].principal_id
	description = "System assigned managed identity principal ID for the app."
}
