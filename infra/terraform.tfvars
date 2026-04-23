subscription_id = "00000000-0000-0000-0000-000000000000"

resource_group_name = "rg-adopcion-backend-prod"
location            = "eastus"

service_plan_name = "plan-adopcion-backend-prod"
service_plan_sku  = "S1"

app_name      = "app-adopcion-backend-prod"
app_port      = 8080
app_always_on = true

acr_name                = "acradopcionprod"
acr_resource_group_name = "rg-shared-prod"
acr_login_server        = "acradopcionprod.azurecr.io"

docker_image_repository = "acradopcionprod.azurecr.io/adopcion-backend"
docker_image_tag        = "latest"

postgres_server_name                  = "pg-adopcion-backend-prod"
db_name                               = "adopcion"
db_admin_user                         = "adopcion_admin"
db_admin_password                     = "REPLACE_WITH_SECURE_PASSWORD"
postgres_storage_mb                   = 32768
postgres_sku                          = "B_Standard_B1ms"
postgres_zone                         = "1"
postgres_public_network_access_enabled = true
allow_azure_services_to_postgres      = true

jwt_secret    = "REPLACE_WITH_LONG_RANDOM_SECRET"
jwt_expires_in = "24h"

smtp_host = "smtp.gmail.com"
smtp_port = 587
smtp_user = "no-reply@example.com"
smtp_pass = "REPLACE_WITH_SMTP_SECRET"

frontend_url = "https://app-adopcion.example.com"
node_env     = "production"

extra_app_settings = {}
