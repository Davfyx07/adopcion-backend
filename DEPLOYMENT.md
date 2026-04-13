# 📦 Guía Completa de Despliegue e Infraestructura - Adopción Backend

## 📑 Tabla de Contenidos

1. [Visión General de la Arquitectura](#visión-general-de-la-arquitectura)
2. [Componentes de la Infraestructura](#componentes-de-la-infraestructura)
3. [Despliegue Local](#despliegue-local)
4. [Despliegue en Azure](#despliegue-en-azure)
5. [Variables de Entorno](#variables-de-entorno)
6. [Configuración de Terraform](#configuración-de-terraform)
7. [Seguridad y Mejores Prácticas](#seguridad-y-mejores-prácticas)
8. [Monitoreo y Logs](#monitoreo-y-logs)
9. [Troubleshooting](#troubleshooting)

---

## Visión General de la Arquitectura

### 🏗️ Arquitectura General

La aplicación **Adopción Backend** es una API REST construida con **Node.js + Express** que se comunica con una base de datos **PostgreSQL**. La arquitectura sigue el patrón de capas (layered architecture):

```
┌─────────────────────────────────────────────────────────────┐
│                    Cliente (Web/Mobile)                      │
└──────────────────────┬──────────────────────────────────────┘
                       │ HTTP/HTTPS
                       ▼
┌─────────────────────────────────────────────────────────────┐
│         Azure App Service (Node.js Runtime)                  │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │           Express Application                        │   │
│  │  ┌────────────────────────────────────────────────┐  │   │
│  │  │     Rutas (Routes)                             │  │   │
│  │  │  - GET /api/auth                               │  │   │
│  │  │  - POST /api/auth/register                     │  │   │
│  │  │  - POST /api/auth/login                        │  │   │
│  │  └────────────────────────────────────────────────┘  │   │
│  │  ┌────────────────────────────────────────────────┐  │   │
│  │  │  Middlewares                                   │  │   │
│  │  │  - Security (Helmet, CORS)                     │  │   │
│  │  │  - Validación de datos                         │  │   │
│  │  │  - Autenticación JWT                           │  │   │
│  │  │  - Rate Limiting                               │  │   │
│  │  └────────────────────────────────────────────────┘  │   │
│  │  ┌────────────────────────────────────────────────┐  │   │
│  │  │  Controladores (Controllers)                   │  │   │
│  │  │  - Manejan requests HTTP                       │  │   │
│  │  │  - Validan parámetros                          │  │   │
│  │  │  - Llamadas a servicios                        │  │   │
│  │  └────────────────────────────────────────────────┘  │   │
│  │  ┌────────────────────────────────────────────────┐  │   │
│  │  │  Servicios (Services)                          │  │   │
│  │  │  - Lógica de negocio                           │  │   │
│  │  │  - Queries a la BD                             │  │   │
│  │  │  - Integraciones externas (Email)              │  │   │
│  │  └────────────────────────────────────────────────┘  │   │
│  │  ┌────────────────────────────────────────────────┐  │   │
│  │  │  Pool de Conexiones PostgreSQL                 │  │   │
│  │  │  - Máximo 10 conexiones                        │  │   │
│  │  │  - Timeout: 30s                                │  │   │
│  │  └────────────────────────────────────────────────┘  │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
                       │ TCP/IP Port 5432
                       ▼
┌─────────────────────────────────────────────────────────────┐
│    Azure Database for PostgreSQL - Flexible Server           │
│                                                               │
│  ┌──────────────────────────────────────────────────────┐   │
│  │  PostgreSQL v14 - 32GB Storage                       │   │
│  │  - Usuarios (roles: adoptante, albergue)            │   │
│  │  - Mascotas                                          │   │
│  │  - Adopciones                                        │   │
│  │  - Datos de aplicación                              │   │
│  └──────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 📊 Stack Tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| **Runtime** | Node.js | 20-LTS (Alpine) |
| **Framework Web** | Express | 5.2.1 |
| **Base de Datos** | PostgreSQL | 14 |
| **ORM/Query Builder** | pg (node-postgres) | 8.20.0 |
| **Autenticación** | JWT (jsonwebtoken) | 9.0.3 |
| **Encriptación** | bcrypt | 6.0.0 |
| **Seguridad** | Helmet | 8.1.0 |
| **CORS** | cors | 2.8.6 |
| **Rate Limiting** | express-rate-limit | 8.3.2 |
| **Email** | Nodemailer | 8.0.4 |
| **API Docs** | Swagger/OpenAPI | 3.0.0 |
| **Validación** | Express Validator | Built-in |
| **Infraestructura** | Terraform | Latest |
| **Cloud Provider** | Microsoft Azure | - |

---

## Componentes de la Infraestructura

### 1️⃣ Azure App Service

**Descripción:** Servicio administrado de Azure que aloja la aplicación Node.js.

**Detalles Técnicos:**
- **Tipo:** Web App para Linux
- **Runtime Stack:** Node.js 20 LTS
- **Plan:** B1 (Básico - 1 vCPU, 1.75 GB RAM)
- **Puerto Interno:** 8080
- **Escala:** Manual (sin auto-scaling en plan B1)
- **Always On:** Desactivado (conserva recursos en plan B1)

**Configuración:**
```
- Nombre: {var.app_name}
- Grupo de Recursos: {var.resource_group_name}
- Región: {var.location}
```

**Ventajas:**
- ✅ Administrado completamente por Azure (sin VM management)
- ✅ Integración nativa con Azure DevOps y GitHub
- ✅ HTTPS automático con certificados
- ✅ Escalado automático disponible (en planes superiores)
- ✅ Built-in diagnostics y Application Insights

### 2️⃣ Azure Database for PostgreSQL - Flexible Server

**Descripción:** Base de datos postgresSQL administrada y escalable en Azure.

**Detalles Técnicos:**
- **Versión:** PostgreSQL 14
- **SKU:** B_Standard_B1ms (1 vCPU, 2 GB RAM)
- **Almacenamiento:** 32 GB
- **Tipo de Servidor:** Flexible Server
- **Autenticación:** Usuario/Contraseña Basic
- **SSL:** Soportado

**Configuración:**
```
- Nombre Servidor: server-postgres-adopcion-iac
- Acceso desde Azure: Habilitado (firewall rule 0.0.0.0 - 0.0.0.0)
- Backup Automático: Por defecto (7 días de retención)
```

**Ventajas:**
- ✅ Backups automáticos diarios
- ✅ Point-in-time restore
- ✅ Parches de seguridad automáticos
- ✅ Alta disponibilidad con replicas (planes superiores)
- ✅ Networking avanzado con Private Link

### 3️⃣ Resource Group

**Descripción:** Contenedor lógico que agrupa todos los recursos relacionados.

**Función:**
- Gestión centralizada de permisos (RBAC)
- Facturación por grupo
- Gestión del ciclo de vida (eliminar el RG elimina todos los recursos)

---

## Despliegue Local

### Prerequisitos

```bash
# Verificar instalaciones
node --version   # v20 o superior
npm --version    # v10 o superior
psql --version   # v14 o superior
```

### 1. Instalación Inicial

```bash
# Clonar repositorio
git clone <repo-url>
cd adopcion-backend

# Instalar dependencias
npm install

# Crear archivo .env (basado en .env.example)
cp .env.example .env
```

### 2. Configurar PostgreSQL Local

```bash
# Opción 1: Conectar con psql directamente
psql -U postgres

# Opción 2: Conectar con cliente gráfico (DBeaver/pgAdmin)
```

**SQL para crear base de datos:**
```sql
CREATE DATABASE adopcion_db;
CREATE USER adopcion_user WITH PASSWORD 'tu_contraseña';
ALTER ROLE adopcion_user WITH CREATEDB;
GRANT ALL PRIVILEGES ON DATABASE adopcion_db TO adopcion_user;
```

### 3. Actualizar Variables de Entorno

Editar `.env`:
```env
PORT=3000
DB_HOST=localhost
DB_PORT=5432
DB_NAME=adopcion_db
DB_USER=adopcion_user
DB_PASSWORD=tu_contraseña
JWT_SECRET=tu_jwt_secret_super_seguro_minimo_32_caracteres
JWT_EXPIRES_IN=24h
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu_email@gmail.com
SMTP_PASS=tu_app_password  # App password, no contraseña normal
```

### 4. Inicializar Base de Datos

```bash
# Script SQL (ejecutar en psql o cliente gráfico)
# Ver BD.md en el repositorio para el schema
psql -U adopcion_user -d adopcion_db -f ./scripts/schema.sql
psql -U adopcion_user -d adopcion_db -f ./scripts/initial-data.sql
```

### 5. Ejecutar en Desarrollo

**Con auto-reload:**
```bash
npm run dev
```

**Sin auto-reload:**
```bash
npm start
```

**Salida esperada:**
```
Server corriendo en http://localhost:3000
```

### 6. Verificar Operación

```bash
# Health check
curl http://localhost:3000/health

# Documentación Swagger
open http://localhost:3000/api-docs
```

---

## Despliegue en Azure

### Arquitectura en Azure

```
┌─────────────────────────────────────┐
│  Azure Subscription                 │
│  ┌─────────────────────────────────┤
│  │ Resource Group: adopcion-rg     │
│  │                                  │
│  │ ┌──────────────────────────────┐│
│  │ │ App Service Plan             ││
│  │ │ - Linux                       ││
│  │ │ - SKU: B1                     ││
│  │ └──────┬───────────────────────┘│
│  │        │                         │
│  │ ┌──────▼───────────────────────┐│
│  │ │ Web App (Node.js 20)         ││
│  │ │ - Runtime Stack              ││
│  │ │ - App Settings (Env Vars)    ││
│  │ │ - Networking                 ││
│  │ │ - Deployement Slot           ││
│  │ └──────────────────────────────┘│
│  │                                  │
│  │ ┌──────────────────────────────┐│
│  │ │ PostgreSQL Flexible Server   ││
│  │ │ - Version: 14                ││
│  │ │ - SKU: B Standard B1ms       ││
│  │ │ - 32GB Storage               ││
│  │ │ - Firewall Rules             ││
│  │ │ - Backups Automáticos        ││
│  │ └──────────────────────────────┘│
│  │                                  │
│  └─────────────────────────────────┘
└─────────────────────────────────────┘
```

### Prerequisitos para Azure

1. **Cuenta Azure activa** con suscripción
2. **Azure CLI instalado**
   ```bash
   # Verificar instalación
   az --version
   ```
3. **Terraform instalado** (v1.0+)
   ```bash
   # Verificar instalación
   terraform --version
   ```
4. **Credenciales configuradas**
   ```bash
   # Login en Azure
   az login
   
   # Verificar cuenta activa
   az account show
   ```

### Opción 1: Despliegue con Terraform (IaC)

#### Paso 1: Preparar Terraform

```bash
# Ir a la carpeta de infraestructura
cd infra

# Inicializar Terraform
terraform init

# Validar configuración
terraform validate

# Ver plan de cambios (DRY RUN)
terraform plan -out=tfplan
```

#### Paso 2: Completar Variables

Editar `terraform.tfvars` (crear si no existe):
```hcl
resource_group_name = "adopcion-rg"
location            = "eastus"
app_name            = "adopcion-app-prod"
db_user             = "adopcion_admin"
db_password         = "SuperPassword123!@#"  # Mínimo 32 caracteres, caracteres especiales
jwt_secret          = "your-super-secure-jwt-secret-min-32-chars"
smtp_user           = "your-email@gmail.com"
smtp_pass           = "your-app-specific-password"
db_url              = "postgresql://adopcion_admin:SuperPassword123!@#@server-postgres-adopcion-iac.postgres.database.azure.com:5432/adopcion_db"
```

#### Paso 3: Aplicar Infraestructura

```bash
# Aplicar cambios (crear recursos)
terraform apply tfplan

# Esperar a que se complete (5-10 minutos aprox.)
```

**Salida esperada:**
```
Apply complete! Resources: 5 added, 0 changed, 0 destroyed.

Outputs:
app_service_default_hostname = "adopcion-app-prod.azurewebsites.net"
database_fqdn = "server-postgres-adopcion-iac.postgres.database.azure.com"
```

#### Paso 4: Desplegar Código

```bash
# Opción A: Git Push (Automatic deployment)
git push origin main

# Opción B: Zip Deploy manualmente
npm install
zip -r deploy.zip . -x "infra/*" "node_modules/*"
az webapp deployment source config-zip \
  --resource-group adopcion-rg \
  --name adopcion-app-prod \
  --src-path ./deploy.zip
```

### Opción 2: Despliegue Manual con Azure Portal

### Paso 1: Crear Recursos Manualmente

1. **Crear Resource Group**
   - Azure Portal → Resource Groups → Create
   - Nombre: `adopcion-rg`
   - Región: `East US`

2. **Crear App Service Plan**
   - Portal → App Service Plans → Create
   - Plan Name: `adopcion-plan`
   - OS: `Linux`
   - SKU: `Basic B1`

3. **Crear Web App**
   - Portal → Web Apps → Create
   - App Name: `adopcion-app-prod`
   - Runtime Stack: `Node 20 LTS`
   - Plan: Seleccionar el creado arriba

4. **Crear PostgreSQL Flexible Server**
   - Portal → Azure Database for PostgreSQL → Create
   - Server Name: `adopcion-db-server`
   - Version: `14`
   - Admin User: `adopcion_admin`
   - Admin Password: Contraseña fuerte

### Paso 2: Configurar Firewall - PostgreSQL

```
Azure Portal → Database → Networking
- Add firewall rule: 0.0.0.0 - 0.0.0.0 (Allow Azure Services)
```

### Paso 3: Configurar Variables de Entorno

```bash
# En Azure Portal: Web App → Settings → Configuration
# Add App Settings:

PORT = 8080
DB_HOST = adopcion-db-server.postgres.database.azure.com
DB_PORT = 5432
DB_NAME = adopcion_db
DB_USER = adopcion_admin
DB_PASSWORD = [Tu contraseña]
JWT_SECRET = [Tu JWT secret]
JWT_EXPIRES_IN = 24h
SMTP_HOST = smtp.gmail.com
SMTP_PORT = 587
SMTP_USER = tu_email@gmail.com
SMTP_PASS = tu_app_specific_password
```

### Paso 4: Desplegar Código

```bash
# Opción A: Desde Git (Automatic CI/CD)
Web App → Deployment Center → GitHub
- Conectar repositorio
- Rama: main
- Build: Automático

# Opción B: Zip Deploy
npm install
zip -r deploy.zip . -x "node_modules/*"

az webapp deployment source config-zip \
  --resource-group adopcion-rg \
  --name adopcion-app-prod \
  --src-path ./deploy.zip
```

### Paso 5: Inicializar Base de Datos

```bash
# Conectarse a PostgreSQL en Azure
psql -h adopcion-db-server.postgres.database.azure.com \
     -U adopcion_admin \
     -d adopcion_db

# Ejecutar scripts SQL
\i schema.sql
\i initial-data.sql
```

### Paso 6: Verificar Despliegue

```bash
# Salud de la aplicación
curl https://adopcion-app-prod.azurewebsites.net/health

# Ver logs en tiempo real
az webapp log tail --resource-group adopcion-rg --name adopcion-app-prod

# Swagger en Azure
https://adopcion-app-prod.azurewebsites.net/api-docs
```

---

## Variables de Entorno

### Variables Requeridas

| Variable | Descripción | Ejemplo | Crítico |
|----------|-----------|---------|---------|
| `PORT` | Puerto que escucha la aplicación | `8080` (Azure), `3000` (Local) | ❌ |
| `DB_HOST` | Host del servidor PostgreSQL | `localhost` o `server.postgres.database.azure.com` | ✅ |
| `DB_PORT` | Puerto PostgreSQL | `5432` | ❌ |
| `DB_NAME` | Nombre de la base de datos | `adopcion_db` | ✅ |
| `DB_USER` | Usuario PostgreSQL | `adopcion_user` | ✅ |
| `DB_PASSWORD` | Contraseña PostgreSQL | `contraseña_fuerte` | ✅ |
| `JWT_SECRET` | Clave para firmar tokens JWT | Mínimo 32 caracteres aleatorios | ✅ |
| `JWT_EXPIRES_IN` | Expiración de tokens | `24h` | ❌ |
| `SMTP_HOST` | Servidor SMTP para emails | `smtp.gmail.com` | ✅ |
| `SMTP_PORT` | Puerto SMTP | `587` | ❌ |
| `SMTP_USER` | Email para enviar | `app@gmail.com` | ✅ |
| `SMTP_PASS` | Contraseña SMTP (App Password si es Gmail) | `xxxx xxxx xxxx xxxx` | ✅ |

### Prioridad de Carga

Las variables se cargan en este orden (la última prevalece):
1. Variables del sistema operativo
2. Archivo `.env` local
3. App Settings en Azure Portal
4. Variables hardcodeadas en código

**Recomendación:** Nunca subir `.env` a Git. Usar `.env.example` como template.

---

## Configuración de Terraform

### Estructura de Archivos

```
infra/
├── main.tf              # Declaración de proveedores y recursos principales
├── variables.tf         # Definición de variables (tipos, defaults)
├── outputs.tf          # Salidas que muestra después de terraform apply
├── terraform.tfvars    # Valores concretos para las variables
└── terraform.lock.hcl  # Lock de versiones (auto-generado)
```

### Componentes en main.tf

#### 1. Provider Azure

```hcl
provider "azurerm" {
  features {}
}
```

**Configura:**
- Autenticación con Azure CLI
- Versión del provider
- Características específicas

#### 2. Resource Group

```hcl
resource "azurerm_resource_group" "rg" {
  name     = var.resource_group_name
  location = var.location
}
```

**Función:** Contenedor lógico para todos los recursos.

#### 3. App Service Plan

```hcl
resource "azurerm_service_plan" "plan" {
  name                = "plan-adopcion-backend"
  resource_group_name = azurerm_resource_group.rg.name
  location            = azurerm_resource_group.rg.location
  os_type             = "Linux"
  sku_name            = "B1"
}
```

**Parámetros:**
- `os_type = "Linux"` → Soporta Node.js en Linux
- `sku_name = "B1"` → Plan Básico (1 vCPU, 1.75GB RAM)
  - Alternativas: `F1` (Free), `B2` (estándar), `P1V2` (premium)

#### 4. Linux Web App

```hcl
resource "azurerm_linux_web_app" "app" {
  name                = var.app_name
  resource_group_name = azurerm_resource_group.rg.name
  service_plan_id     = azurerm_service_plan.plan.id

  site_config {
    application_stack {
      node_version = "20-lts"
    }
    always_on = false
  }

  app_settings = {
    "PORT"       = "8080"
    "DB_URL"     = var.db_url
    # ... más variables
  }
}
```

**Parámetros clave:**
- `node_version = "20-lts"` → Node.js 20 LTS
- `always_on = false` → Para ahorrar costos en B1
- `app_settings` → Variables de entorno inyectadas

#### 5. PostgreSQL Flexible Server

```hcl
resource "azurerm_postgresql_flexible_server" "postgres" {
  name                   = "server-postgres-adopcion-iac"
  version                = "14"
  administrator_login    = var.db_user
  administrator_password = var.db_password
  storage_mb             = 32768
  sku_name               = "B_Standard_B1ms"
}
```

**Parámetros:**
- `version = "14"` → PostgreSQL 14
- `storage_mb = 32768` → 32 GB de almacenamiento
- `sku_name = "B_Standard_B1ms"` → Tier básico

#### 6. Firewall Rule

```hcl
resource "azurerm_postgresql_flexible_server_firewall_rule" "allow_azure" {
  name             = "allow-azure-services"
  server_id        = azurerm_postgresql_flexible_server.postgres.id
  start_ip_address = "0.0.0.0"
  end_ip_address   = "0.0.0.0"
}
```

**Función:** Permite que servicios de Azure (como App Service) accedan a la BD.

### Comandos Terraform Útiles

```bash
# Inicializar (descargar providers)
terraform init

# Validar sintaxis
terraform validate

# Ver plan de cambios (sin aplicar)
terraform plan

# Guardar plan en archivo
terraform plan -out=tfplan

# Aplicar cambios
terraform apply

# Aplicar un plan guardado
terraform apply tfplan

# Destruir todos los recursos
terraform destroy

# Ver estado actual
terraform state list
terraform state show azurerm_linux_web_app.app

# Refrescar estado desde Azure
terraform refresh
```

### Gestión de Estado

El archivo `terraform.state` guarda el estado de los recursos. **Nunca pushearlo a Git.**

**Mejor práctica:** Usar Azure Storage para estado remoto:

```hcl
# backend.tf
terraform {
  backend "azurerm" {
    resource_group_name  = "terraform-state"
    storage_account_name = "tfstate123456"
    container_name       = "tfstate"
    key                  = "prod.terraform.tfstate"
  }
}
```

---

## Seguridad y Mejores Prácticas

### 🔒 Seguridad de Código

#### 1. Helmet (Headers de Seguridad)

```javascript
app.use(helmet());  // Configurado en index.js
```

**Protege contra:**
- XSS (Cross-Site Scripting)
- Clickjacking
- MIME Type Sniffing
- Content Security Policy

#### 2. CORS (Cross-Origin Resource Sharing)

```javascript
app.use(cors());
```

**Configuración recomendada para producción:**
```javascript
app.use(cors({
  origin: process.env.ALLOWED_ORIGINS?.split(',') || ['https://adopcion.com'],
  credentials: true,
  optionsSuccessStatus: 200
}));
```

#### 3. Rate Limiting

Implementar en producción:
```javascript
const rateLimit = require('express-rate-limit');

const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutos
  max: 100 // límite de 100 requests por ventana
});

app.use('/api/', limiter);
```

#### 4. Autenticación JWT

```javascript
// En authService.js
const token = jwt.sign(
  { userId: user.id, role: user.role },
  process.env.JWT_SECRET,  // Variable segura
  { expiresIn: process.env.JWT_EXPIRES_IN }
);
```

**Recomendación:** Usar JWT_SECRET de mínimo 32 caracteres.

#### 5. Encriptación de Contraseñas

```javascript
// En authService.js
const hashedPassword = await bcrypt.hash(password, 10);  // Salt rounds: 10
```

### 🔐 Seguridad de Infraestructura

#### 1. Secretos en Azure

**Nunca hardcodear secretos.** Usar Azure Key Vault:

```bash
# Crear Key Vault
az keyvault create --resource-group adopcion-rg --name adopcion-kv

# Guardar secreto
az keyvault secret set --vault-name adopcion-kv \
  --name jwt-secret \
  --value "your-super-secure-secret"

# Leer en código
const secret = await keyVaultClient.getSecret('jwt-secret');
```

#### 2. Conexión a PostgreSQL Segura

**Azure PostgreSQL requiere SSL en producción:**

```javascript
// En config/db.js
const pool = new Pool({
  // ...
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false,
});
```

#### 3. Firewall en PostgreSQL

```hcl
# Terraform
resource "azurerm_postgresql_flexible_server" "postgres" {
  # ...
  
  # Solo IP específica (en producción)
  # start_ip_address = "203.0.113.1"
  # end_ip_address   = "203.0.113.1"
}
```

#### 4. HTTPS Obligatorio

```bash
# En Azure Portal: Web App → TLS/SSL settings
# Remitir tráfico HTTP a HTTPS → ON
```

### 📋 Checklist de Seguridad Pre-Producción

- [ ] Variables sensibles en Azure Key Vault, no en código
- [ ] JWT_SECRET de mínimo 32 caracteres aleatorios
- [ ] HTTPS obligatorio (TLS/SSL)
- [ ] CORS restringido a dominios específicos
- [ ] Rate limiting activo en endpoints públicos
- [ ] Validación de entrada en todos los endpoints
- [ ] Logs de acceso y errores monitoreados
- [ ] Backups automáticos configurados
- [ ] Database credentials con caracteres especiales
- [ ] Helmet middleware activo
- [ ] SQL Injection prevenido (usar parametrized queries)
- [ ] Dependencies actualizadas (npm audit fix)

---

## Monitoreo y Logs

### 📊 Logs en Development

```bash
# En terminal (cuando ejecutas npm run dev)
Server corriendo en http://localhost:3000
```

### 📊 Logs en Azure

#### 1. Application Insights

```bash
# Ver logs en tiempo real
az webapp log tail --resource-group adopcion-rg --name adopcion-app-prod

# Filtrar por error
az webapp log tail --resource-group adopcion-rg --name adopcion-app-prod | grep -i error
```

#### 2. Log Stream en Portal

```
Azure Portal → App Service → Monitoring → Log stream
```

**Muestra logs en tiempo real de:**
- Arranque de la app
- Requests HTTP
- Errores y excepciones
- Cambios de configuración

#### 3. Configurar Logs en la App

```javascript
// En src/index.js, mejorar logging
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

app.listen(PORT, () => {
  console.log(`[${new Date().toISOString()}] Server iniciado en puerto ${PORT}`);
});
```

### 📊 Métricas Importantes

**Monitorar en Azure:**

```
App Service → Metrics
- HTTP Server Errors (5xx)
- HTTP Client Errors (4xx)
- Response Time
- CPU Percentage
- Memory Percentage
```

### 🚨 Alertas Recomendadas

```bash
# Crear alerta para errores 5xx
az monitor metrics alert create \
  --resource-group adopcion-rg \
  --name "5xx-errors-alert" \
  --scopes /subscriptions/{id}/resourceGroups/adopcion-rg/providers/Microsoft.Web/sites/adopcion-app-prod \
  --condition "total Http5xx > 10 over 5 minutes"
```

---

## Troubleshooting

### ❌ Problemas Comunes

#### 1. "Cannot find module 'dotenv'"

```bash
# Solución
npm install

# Verificar en package.json
grep dotenv package.json
```

#### 2. "Database connection refused"

**Causas posibles:**
- PostgreSQL no está corriendo en local
- Credenciales incorrectas en .env
- Host incorrecto

**Soluciones:**
```bash
# Ver estado de PostgreSQL
pg_isready -h localhost

# Verificar variables en Azure
az webapp config appsettings list --resource-group adopcion-rg --name adopcion-app-prod

# Probar conexión manualmente
psql -h localhost -U adopcion_user -d adopcion_db
```

#### 3. "EADDRINUSE: address already in use :::3000"

```bash
# Matar proceso en puerto 3000
lsof -i :3000
kill -9 <PID>

# O cambiar puerto en .env
PORT=3001
```

#### 4. "JWT token expires"

**Verificar:**
```bash
# En .env
JWT_EXPIRES_IN=24h  # Aumentar si es necesario

# En Azure Portal (App Settings)
JWT_EXPIRES_IN = 24h
```

#### 5. "Swagger docs no visible en /api-docs"

```javascript
// Verificar en src/index.js
const swaggerOptions = {
    definition: {
        // ...
    },
    apis: ['./src/routes/*.js']  // Asegurar que las rutas están en src/routes/
};

app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocs));
```

#### 6. "Email no se envía"

```bash
# Verificar credenciales SMTP en .env
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu_email@gmail.com
SMTP_PASS=xxxx xxxx xxxx xxxx  # Debe ser App Password (Gmail)

# Nota: Si usas Gmail, requiere App Password
# Ver: https://myaccount.google.com/apppasswords
```

#### 7. "Terraform state lock"

```bash
# Si terraform se queda locked
terraform force-unlock <LOCK_ID>

# Ver lock
terraform state list
```

#### 8. "App Service en Azure tarda en iniciar"

```bash
# Verificar logs
az webapp log tail --resource-group adopcion-rg --name adopcion-app-prod

# Aumentar timeout en deployment
az webapp deployment source config-zip \
  --resource-group adopcion-rg \
  --name adopcion-app-prod \
  --src-path ./deploy.zip \
  --timeout 600  # 10 minutos
```

### 🔍 Comandos de Debugging

```bash
# Ver configuración actual de la app
az webapp config show --resource-group adopcion-rg --name adopcion-app-prod

# Ver app settings
az webapp config appsettings list --resource-group adopcion-rg --name adopcion-app-prod

# Ver estado del App Service
az webapp show --resource-group adopcion-rg --name adopcion-app-prod

# Ver estadísticas de uso
az monitor metrics list-definitions --resource-group adopcion-rg --namespace Microsoft.Web/sites

# Reiniciar app
az webapp restart --resource-group adopcion-rg --name adopcion-app-prod

# Ver histórico de deployments
az webapp deployment list-publishing-profiles --resource-group adopcion-rg --name adopcion-app-prod
```

---

## 📞 Soporte y Recursos

### Documentación Oficial

- [Azure App Service Docs](https://docs.microsoft.com/en-us/azure/app-service/)
- [Azure PostgreSQL](https://docs.microsoft.com/en-us/azure/postgresql/)
- [Terraform Azure Provider](https://registry.terraform.io/providers/hashicorp/azurerm/latest/docs)
- [Express.js Guide](https://expressjs.com/)
- [PostgreSQL Documentation](https://www.postgresql.org/docs/14/)
- [Node.js Best Practices](https://nodejs.org/en/docs/)

### Archivos Importantes en el Repo

```
adopcion-backend/
├── .env.example         # Template de variables
├── Dockerfile           # Imagen Docker multi-stage
├── package.json         # Dependencias y scripts
├── README.md            # Guía de desarrollo
├── DEPLOYMENT.md        # Este archivo
├── src/
│   ├── index.js         # Entry point
│   ├── config/db.js     # Pool de PostgreSQL
│   ├── routes/          # Definición de APIs
│   ├── controllers/      # Lógica HTTP
│   ├── services/        # Lógica de negocio
│   └── middlewares/     # Validación y seguridad
└── infra/               # Archivos Terraform
    ├── main.tf          # Recursos Azure
    └── variables.tf     # Definición de variables
```

### Contacto y Reportar Problemas

- **Issues en GitHub:** [adopcion-backend/issues](https://github.com/tu-repo/issues)
- **Documentación interna:** Ver README.md y BD.md
- **Logs:** Usa `az webapp log tail` para debugging

---

## 🎯 Resumen de Arquitectura

| Componente | Local | Azure |
|-----------|-------|-------|
| **Runtime** | Node 20 | Node 20 LTS |
| **Web Server** | localhost:3000 | App Service (adopcion-app-prod.azurewebsites.net) |
| **Database** | PostgreSQL 14 local | Azure PostgreSQL (Flexible Server) |
| **Storage** | Disco local | Azure Storage (backups automáticos) |
| **Logs** | Console | Application Insights / Log Stream |
| **Monitoreo** | Manual | Azure Metrics y Alerts |
| **Backups** | Manual | Automático (7 días retención) |
| **SSL/HTTPS** | No | Automático |
| **Escalabilidad** | No | Manual (cambiar SKU) |

---

**Última actualización:** Abril 2026  
**Versión:** 1.0.0  
**Para preguntas:** Ver README.md o documentación en BD.md
