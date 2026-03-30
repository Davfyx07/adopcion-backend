# API Adopción Mascotas - Backend

Este repositorio contiene el backend para la plataforma de adopción de mascotas, desarrollado en **Node.js** con **Express** y **PostgreSQL**. Sigue principios de arquitectura limpia, validaciones estrictas y respuestas estandarizadas.

## 🧰 Requisitos Previos

Antes de comenzar, asegúrate de tener instalado:
- **Node.js** (v18 o superior recomendado)
- **PostgreSQL** (v14 o superior)
- Un gestor de base de datos como pgAdmin o DBeaver (opcional pero recomendado).

---

## 🚀 Instalación y Configuración

Sigue estos pasos para levantar el entorno de desarrollo en tu máquina local:

### 1. Clonar e Instalar Dependencias
Clona el repositorio e instala los paquetes necesarios de NPM:
```bash
npm install
```

### 2. Configurar Variables de Entorno
Crea un archivo `.env` en la raíz del proyecto (al mismo nivel que `package.json`) basándote en la siguiente configuración (ajusta las variables según tu entorno de despliegue). En el archivo `.env.example` encontrarás la estructura base:

```env
PORT=
DB_HOST=
DB_PORT=
DB_NAME=
DB_USER=
DB_PASSWORD=
```

### 3. Configurar la Base de Datos
1. Crea una base de datos en PostgreSQL.
2. El administrador de la BD deberá correr el script SQL del diseño maestro (`BD.md`) para crear el esquema.
3. **⚠️ IMPORTANTE - Script de Datos Iniciales:** Antes de probar la API, debes correr el script de datos iniciales para poblar los roles básicos (`adoptante` y `albergue`). De lo contrario, los endpoints de registro lanzarán un error 400:


### 4. Levantar el Servidor
Para correr el proyecto en modo desarrollo con auto-recarga (Nodemon):
```bash
npm run dev
```
La consola debería mostrarte: `Server corriendo en http://localhost:3000`

---

## 📖 Documentación de la API (Swagger)

Toda la documentación interactiva de la API está integrada directamente en el código usando **Swagger OpenAPI**. 

Una vez que el servidor esté corriendo, puedes explorar los endpoints, ver qué campos requiere cada JSON y probar las peticiones directamente desde tu navegador ingresando a:

👉 **http://localhost:3000/api-docs**

---
## 📂 Git cambiar y crear rama

```bash
# Cambiar a la rama develop
git checkout develop

# Crear una nueva rama
git checkout -b nombre-de-la-rama #(tipo/HU-ID-descripcion-breve)
#tipos: 
#feat: Nuevas funcionalidades (ej. Registro).
#fix: Corrección de errores.
#docs: Cambios en documentación.
#Ej: git checkout -b feat/HU-AUTH-01-registro-usuario

#agregar y relizar commit Ejemplo
git add .
git commit -m "feat: HU-AUTH-01 registro de usuario"

# Subir la nueva rama a GitHub
git push -u origin nombre-de-la-rama
```


## 📂 Estructura del Proyecto

```text
📦 adopcion-backend
 ┣ 📂 src
 ┃ ┣ 📂 config           # Configuración de conexiones (ej: db.js para el Pool de Postgres)
 ┃ ┣ 📂 controllers      # Controladores HTTP: Extraen params/body y devuelven respuestas JSON
 ┃ ┣ 📂 middlewares      # Validadores e interceptores (ej: reglas de registro, auth tokens)
 ┃ ┣ 📂 routes           # Definición de rutas y mapeo con Swagger JSDoc
 ┃ ┣ 📂 services         # Lógica pura de negocio y consultas pesadas a la BD (Patrón Servicio)
 ┃ ┗ 📜 index.js         # Punto de entrada principal (Entry point) y setups de seguridad
 ┣ 📜 .env               # Variables de entorno (¡No subir a Git!)
 ┣ 📜 package.json       # Dependencias y scripts del proyecto
 ┗ 📜 README.md          # Este archivo
```

