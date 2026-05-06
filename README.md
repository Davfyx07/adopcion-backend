# API Adopción Mascotas - Backend

Este repositorio contiene el backend para la plataforma de adopción de mascotas, desarrollado en **Node.js** con **Express** y **PostgreSQL** (vía **Prisma ORM**). Sigue principios de arquitectura limpia, validaciones estrictas y respuestas estandarizadas.

## 🧰 Requisitos Previos

Antes de comenzar, asegúrate de tener instalado:
- **Node.js** (v18 o superior recomendado)
- **PostgreSQL** (v14 o superior)

---

## 🚀 Instalación y Configuración

Sigue estos pasos para levantar el entorno de desarrollo en tu máquina local:

### 1. Clonar e Instalar Dependencias

```bash
git clone https://github.com/Davfyx07/adopcion-backend.git
cd adopcion-backend
git checkout develop
npm install
npx prisma generate
```

### 2. Configurar Variables de Entorno

Crea un archivo `.env` en la raíz del proyecto (al mismo nivel que `package.json`) basándote en `.env.example`:

```bash
cp .env.example .env
```

Variables que necesitás:

```env
# Servidor
PORT=3000

# Base de datos — UNA sola variable para toda la conexión
DATABASE_URL="postgresql://postgres:tu_password@localhost:5432/furmatch?schema=public"

# Seguridad
JWT_SECRET=tu_secreto_jwt_seguro
JWT_EXPIRES_IN=24h
SEED_PASSWORD=FurMatch2025!

# SMTP (opcional — solo para recuperar contraseña)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=tu_correo@gmail.com
SMTP_PASS=tu_app_password

# Cloudinary (opcional — si no configurás, usa URLs mock)
CLOUD_NAME=tu_cloud_name
CLOUD_KEY=tu_api_key
CLOUD_SECRET=tu_api_secret
```

> **IMPORTANTE:** Nunca commitees el archivo `.env`. Ya está en `.gitignore`.

### 3. Crear la Base de Datos y Cargar Datos

```bash
# Crear la BD
createdb furmatch

# Aplicar schema (crea las 21 tablas)
npx prisma db push

# Cargar datos de prueba
npm run seed
```

### 4. Levantar el Servidor

```bash
npm run dev
```

La consola debería mostrarte: `Server corriendo en http://localhost:3000`

### 5. Ejecutar con Docker
Si prefieres correr el backend en un contenedor, puedes construir la imagen y exponerla en un puerto libre del host. El contenedor escucha en el puerto `8080` internamente:

```bash
docker build -t adopcion-backend-local .
docker run --rm -p 8081:8080 --env-file .env --name adopcion-backend-local adopcion-backend-local
```

Luego puedes probar la API en:

```bash
http://localhost:8081/health
```

Si el puerto `8081` también está ocupado en tu máquina, cámbialo por otro libre del host manteniendo el `8080` del contenedor.

---

## 🔑 Credenciales de Prueba (después de correr seed)

| Rol | Correo | Password |
|-----|--------|----------|
| Admin | `admin@furmatch.local` | `FurMatch2025!` |
| Adoptante | `pruebas.adoptante@furmatch.local` | `FurMatch2025!` |
| Albergue | `pruebas.albergue@furmatch.local` | `FurMatch2025!` |

Más usuarios demo en `GUIA_CONFIGURACION.md` (raíz del proyecto).

---

## 📖 Documentación de la API (Swagger)

Una vez que el servidor esté corriendo:

👉 **http://localhost:3000/api-docs**

---

## 🧪 Tests

```bash
npm test              # Todos los tests (81 tests, 12 suites)
npm test -- auth      # Tests de autenticación
npm test -- mascota   # Tests de mascotas
```

---

## 📂 Estructura del Proyecto

```text
adopcion-backend/
├── prisma/
│   ├── schema.prisma        ← Modelo de datos (fuente de verdad)
│   └── seed.js              ← Datos iniciales
├── prisma.config.ts         ← Configuración de Prisma
├── src/
│   ├── config/
│   │   └── prisma.js        ← Cliente Prisma + soft-delete middleware
│   ├── controllers/         ← Handlers HTTP
│   ├── middlewares/          ← Validación, auth, rate-limit
│   ├── routes/               ← Endpoints
│   ├── services/             ← Lógica de negocio
│   ├── tests/                ← Tests Jest
│   └── index.js              ← Entry point
├── .env.example              ← Template de variables
└── package.json
```

---

## 📂 Git — Convenciones

```bash
git checkout -b feat/HU-AUTH-01-registro-usuario
git add .
git commit -m "feat: HU-AUTH-01 registro de usuario"
git push -u origin feat/HU-AUTH-01-registro-usuario
```

- Commits en español, formato: `feat:`, `fix:`, `docs:`
- Cada feature en su propia rama: `tipo/HU-ID-descripcion`
- Antes de pushear: `npm test` debe pasar
