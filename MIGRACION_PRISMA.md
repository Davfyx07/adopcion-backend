# Prisma ORM — FurMatch Backend

## Estado actual

El backend usa **Prisma ORM 7** como capa de acceso a datos. La conexión a PostgreSQL se maneja exclusivamente a través de Prisma con `DATABASE_URL` — una sola variable de entorno para toda la configuración de BD.

## Setup rápido

```bash
npm install
npx prisma generate
```

## Variable de entorno

Solo necesitás `DATABASE_URL` en `.env`:

```env
DATABASE_URL="postgresql://usuario:contraseña@host:5432/furmatch?schema=public"
```

Eso es todo. No hay variables separadas para host, puerto, usuario, etc.

## Comandos esenciales

```bash
npx prisma generate    # Generar el cliente (correr después de npm install o cambios en schema)
npx prisma db push     # Aplicar schema a la BD (crear/alterar tablas)
npx prisma db pull     # Si alguien modifica la BD directamente, reflejarlo en el schema
npx prisma studio      # Explorador visual de la BD en el navegador
npm run seed           # Cargar datos de prueba
npm test               # 81 tests, 12 suites
```

## Archivos clave

| Archivo | Propósito |
|---------|-----------|
| `prisma/schema.prisma` | Schema completo de la BD (fuente de verdad) |
| `prisma.config.ts` | Configuración de Prisma (lee DATABASE_URL) |
| `prisma/seed.js` | Datos iniciales y de prueba |
| `src/config/prisma.js` | Cliente Prisma con driver adapter + soft-delete middleware |
| `src/tests/__mocks__/prisma.js` | Mock de Prisma para tests |
