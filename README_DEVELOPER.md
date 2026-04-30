# 🚀 Guía Rápida para Desarrolladores

## Requisitos Previos

- Node.js 18+
- PostgreSQL 14+ (local o cloud)
- Cuenta en Cloudinary (gratuita)

---

## ⚡ Setup en 5 minutos

### 1. Clonar e instalar

```bash
git clone <repo-backend>
cd App/adopcion-backend
npm install
```

### 2. Configurar variables de entorno

```bash
cp .env.example .env
```

Editar `.env` con tus credenciales:

**Base de datos (PostgreSQL local):**
```env
DB_HOST=localhost
DB_PORT=5432
DB_NAME=furmatch
DB_USER=postgres
DB_PASSWORD=tu_password
DATABASE_URL="postgresql://postgres:tu_password@localhost:5432/furmatch?schema=public"
```

**Cloudinary (cada uno usa su cuenta):**
1. Registrarse en https://cloudinary.com/users/register_free
2. Ir al Dashboard → "Product Environment Credentials"
3. Copiar y pegar en `.env`:
```env
CLOUD_NAME=tu_cloud_name
CLOUD_KEY=tu_api_key
CLOUD_SECRET=tu_api_secret
```

> 💡 **Tip:** Si no configurás Cloudinary, las fotos se guardan como URLs mock y la app funciona igual para desarrollo.

### 3. Crear base de datos y correr seed

```bash
# Crear BD (si no existe)
createdb furmatch

# Aplicar schema de Prisma
npx prisma migrate dev

# Cargar datos de prueba
npm run seed
```

### 4. Levantar servidor

```bash
npm run dev
```

Backend corriendo en **http://localhost:3002**

---

## 🧪 Credenciales de Prueba (después de correr seed)

```
admin@furmatch.local          → password: FurMatch2025!
pruebas.adoptante@furmatch.local  → password: FurMatch2025!
pruebas.albergue@furmatch.local   → password: FurMatch2025!
```

---

## 📁 Estructura del Proyecto

```
src/
├── config/          # Configuración (DB, JWT, etc.)
├── controllers/     # Handlers HTTP
├── middlewares/     # Auth, validación, rate-limit
├── routes/          # Definición de endpoints
├── services/        # Lógica de negocio
├── tests/           # Tests Jest
└── utils/           # Helpers

prisma/
├── schema.prisma    # Schema único fuente de verdad
└── seed.js          # Datos de prueba
```

---

## 🧪 Correr Tests

```bash
npm test              # Todos los tests
npm test -- auth      # Tests de auth
npm test -- mascota   # Tests de mascotas
```

---

## 🔧 Troubleshooting

**Error: "Cannot find module './config/...'"**
→ Asegurate de estar en la carpeta `App/adopcion-backend` al correr los comandos.

**Error de conexión a PostgreSQL**
→ Verificar que PostgreSQL esté corriendo: `pg_isready`

**Login falla con "Password incorrecto" después del seed**
→ El seed usa `SEED_PASSWORD` del `.env` o fallback `FurMatch2025!`. Si cambiaste el `.env`, corré `npm run seed` de nuevo.

---

## 📝 Convenciones

- Commits en **español**, formato: `feat:`, `fix:`, `refactor:`
- Cada feature en su propia rama: `feature/HU-XXX`
- Antes de pushear: `npm test` debe pasar
- **Nunca commitear** `.env`, `config/*.json`, ni credenciales
