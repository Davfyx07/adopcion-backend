# Migración a Prisma ORM — FurMatch Backend

## Estado actual

El backend usa **Prisma ORM** como capa de acceso a datos principal. Se migró desde `pg` Pool directo a Prisma Client.

## Dependencias

```bash
# Instalar dependencias (incluye Prisma)
npm install
```

## Generar el cliente Prisma

```bash
npx prisma generate
```

Esto lee `prisma/schema.prisma` y genera el cliente en `node_modules/@prisma/client`.

## Variables de entorno

Asegurate de tener `DATABASE_URL` en `.env`:

```env
DATABASE_URL="postgresql://usuario:contraseña@host:5432/nombre_base_datos?schema=public"
```

Las variables legacy (`DB_HOST`, `DB_PORT`, `DB_NAME`, etc.) solo las usa `src/config/db.js` (pool de `pg`, mantenido para rollback).

## Correr tests

```bash
npm test
```

32 tests en 7 suites. Todos deben pasar.

## Si la BD cambia (schema drift)

Si alguien modifica la BD directamente y necesitás reflejar los cambios en Prisma:

```bash
npx prisma db pull
npx prisma generate
```

Esto actualiza `prisma/schema.prisma` con los cambios detectados en la BD.

## Nota sobre `src/config/db.js`

Se mantiene exclusivamente como **fallback para rollback**. No se usa en ningún servicio productivo. Cuando la migración esté establecida y no haya planes de revertir, se puede eliminar junto con la dependencia `pg` del `package.json`.

## Archivos clave

| Archivo | Propósito |
|---------|-----------|
| `prisma/schema.prisma` | Schema completo de la BD |
| `src/config/prisma.js` | Cliente Prisma con soft-delete middleware |
| `src/config/db.js` | Pool legacy de `pg` (solo rollback) |
| `src/tests/__mocks__/prisma.js` | Mock de Prisma para tests |
