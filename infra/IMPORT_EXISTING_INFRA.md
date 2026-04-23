# Importar Infraestructura Azure Existente a Terraform

Esta guia te permite sincronizar recursos ya creados en Azure con el estado de Terraform sin recrearlos.

## 1) Prerrequisitos

- Haber ejecutado `terraform init` en la carpeta `infra`.
- Estar autenticado en Azure (`az login`).
- Tener definidos los mismos nombres de recursos en `terraform.tfvars`.

## 2) Inicializar y validar

```bash
cd infra
terraform init
terraform validate
```

## 3) Importar recursos (ajusta IDs reales)

```bash
# Resource Group
terraform import azurerm_resource_group.rg \
  "/subscriptions/<SUBSCRIPTION_ID>/resourceGroups/<RG_NAME>"

# Service Plan
terraform import azurerm_service_plan.plan \
  "/subscriptions/<SUBSCRIPTION_ID>/resourceGroups/<RG_NAME>/providers/Microsoft.Web/serverfarms/<PLAN_NAME>"

# Linux Web App
terraform import azurerm_linux_web_app.app \
  "/subscriptions/<SUBSCRIPTION_ID>/resourceGroups/<RG_NAME>/providers/Microsoft.Web/sites/<APP_NAME>"

# PostgreSQL Flexible Server
terraform import azurerm_postgresql_flexible_server.postgres \
  "/subscriptions/<SUBSCRIPTION_ID>/resourceGroups/<RG_NAME>/providers/Microsoft.DBforPostgreSQL/flexibleServers/<POSTGRES_SERVER_NAME>"

# PostgreSQL Database
terraform import azurerm_postgresql_flexible_server_database.appdb \
  "/subscriptions/<SUBSCRIPTION_ID>/resourceGroups/<RG_NAME>/providers/Microsoft.DBforPostgreSQL/flexibleServers/<POSTGRES_SERVER_NAME>/databases/<DB_NAME>"

# Firewall rule (solo si existe y la habilitas en variables)
terraform import 'azurerm_postgresql_flexible_server_firewall_rule.allow_azure[0]' \
  "/subscriptions/<SUBSCRIPTION_ID>/resourceGroups/<RG_NAME>/providers/Microsoft.DBforPostgreSQL/flexibleServers/<POSTGRES_SERVER_NAME>/firewallRules/allow-azure-services"
```

## 4) Revisar drift

```bash
terraform plan -var-file=terraform.tfvars
```

Si el plan muestra cambios no deseados:
- Revisa `terraform.tfvars` y alinea SKUs, nombres, flags y settings.
- Evita editar manualmente recursos en portal fuera de Terraform.

## 5) Recomendaciones para produccion

- Usar backend remoto de Terraform (Azure Storage) para estado compartido.
- Activar revision/aprobacion para `apply` (GitHub Environments).
- Mantener secretos fuera del repo (GitHub Secrets o Key Vault).
