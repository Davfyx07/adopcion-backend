const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();

async function main() {
    const users = await prisma.usuario.findMany({ select: { correo: true, id_rol: true } });
    const roles = await prisma.rol.findMany();
    const roleMap = {};
    roles.forEach(r => roleMap[r.id_rol] = r.nombre_rol);
    
    console.table(users.map(u => ({
        Email: u.correo,
        Rol: roleMap[u.id_rol],
        Password: 'FurMatch2025!'
    })));
}

main().finally(() => prisma.$disconnect());
