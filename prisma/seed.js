const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

const PASSWORD_HASH = bcrypt.hashSync('FurMatch2025!', 10);

async function main() {
  console.log('🌱 Iniciando seed de datos demo...\n');

  // ─── 1. ROLES (asegurar que existan) ───────────────────────────────
  const roles = await Promise.all([
    prisma.rol.upsert({ where: { nombre_rol: 'admin' }, update: {}, create: { nombre_rol: 'admin' } }),
    prisma.rol.upsert({ where: { nombre_rol: 'adoptante' }, update: {}, create: { nombre_rol: 'adoptante' } }),
    prisma.rol.upsert({ where: { nombre_rol: 'albergue' }, update: {}, create: { nombre_rol: 'albergue' } }),
  ]);
  const rolMap = Object.fromEntries(roles.map(r => [r.nombre_rol, r.id_rol]));

  // ─── 2. TAGS Y OPCIONES ────────────────────────────────────────────
  const tagsData = [
    {
      nombre_tag: 'Tamaño',
      categoria: 'Caracteristicas',
      opciones: ['Pequeño', 'Mediano', 'Grande', 'Muy Grande'],
    },
    {
      nombre_tag: 'Edad',
      categoria: 'Caracteristicas',
      opciones: ['Cachorro', 'Joven', 'Adulto', 'Senior'],
    },
    {
      nombre_tag: 'Nivel de Energía',
      categoria: 'Personalidad',
      opciones: ['Tranquilo', 'Moderado', 'Energético', 'Muy Energético'],
    },
    {
      nombre_tag: 'Sociabilidad',
      categoria: 'Personalidad',
      opciones: ['Tímido', 'Amigable', 'Muy Sociable'],
    },
    {
      nombre_tag: 'Compatible con Niños',
      categoria: 'Compatibilidad',
      opciones: ['Sí', 'No', 'Con supervisión'],
    },
    {
      nombre_tag: 'Compatible con Perros',
      categoria: 'Compatibilidad',
      opciones: ['Sí', 'No', 'Con presentación lenta'],
    },
    {
      nombre_tag: 'Compatible con Gatos',
      categoria: 'Compatibilidad',
      opciones: ['Sí', 'No', 'Desconocido'],
    },
    {
      nombre_tag: 'Nivel de Entrenamiento',
      categoria: 'Conducta',
      opciones: ['Básico', 'Intermedio', 'Avanzado'],
    },
    {
      nombre_tag: 'Necesidades Especiales',
      categoria: 'Salud',
      opciones: ['Ninguna', 'Medicación diaria', 'Dieta especial', 'Movilidad reducida'],
    },
    {
      nombre_tag: 'Tipo de Pelaje',
      categoria: 'Físico',
      opciones: ['Corto', 'Medio', 'Largo', 'Sin pelo'],
    },
  ];

  const opcionesMap = new Map(); // tagName -> [{valor, id_opcion}]

  for (const t of tagsData) {
    const tag = await prisma.tag.upsert({
      where: { nombre_tag: t.nombre_tag },
      update: {},
      create: { nombre_tag: t.nombre_tag, categoria: t.categoria },
    });

    const opciones = [];
    for (const valor of t.opciones) {
      let op = await prisma.opcionTag.findFirst({ where: { id_tag: tag.id_tag, valor } });
      if (!op) {
        op = await prisma.opcionTag.create({ data: { id_tag: tag.id_tag, valor } });
      }
      opciones.push({ valor: op.valor, id_opcion: op.id_opcion });
    }
    opcionesMap.set(t.nombre_tag, opciones);
  }

  // Helper para obtener id_opcion aleatorio
  const getOp = (tagName, idx) => opcionesMap.get(tagName)[idx];

  // ─── 3. USUARIOS Y PERFILES ────────────────────────────────────────
  // Usuarios existentes (ya creados en setup) no se tocan

  // Nuevos Albergues
  const alberguesData = [
    { correo: 'albergue.felices@demo.local', nombre_albergue: 'Colitas Felices', nit: '900123456' },
    { correo: 'albergue.huellas@demo.local', nombre_albergue: 'Huellas de Amor', nit: '900234567' },
    { correo: 'albergue.patitas@demo.local', nombre_albergue: 'Patitas Unidas', nit: '900345678' },
    { correo: 'albergue.refugio@demo.local', nombre_albergue: 'El Refugio Callejero', nit: '900456789' },
  ];

  const alberguesCreados = [];
  for (const a of alberguesData) {
    const usuario = await prisma.usuario.create({
      data: {
        correo: a.correo,
        password_hash: PASSWORD_HASH,
        id_rol: rolMap.albergue,
        estado_cuenta: 'activo',
      },
    });
    const albergue = await prisma.albergue.create({
      data: {
        id_usuario: usuario.id_usuario,
        nit: a.nit,
        nombre_albergue: a.nombre_albergue,
        whatsapp_actual: `+57${Math.floor(3000000000 + Math.random() * 999999999)}`,
        descripcion: `${a.nombre_albergue} es una fundación sin ánimo de lucro dedicada al rescate y adopción responsable de mascotas en situación de calle.`,
        logo: `https://picsum.photos/seed/${a.nit}/200/200`,
      },
    });
    alberguesCreados.push(albergue);
    console.log(`🏠 Albergue creado: ${a.nombre_albergue} (ID: ${usuario.id_usuario})`);
  }

  // Nuevos Adoptantes
  const adoptantesData = [
    { correo: 'maria.garcia@demo.local', nombre_completo: 'María García', ciudad: 'Bogotá' },
    { correo: 'carlos.lopez@demo.local', nombre_completo: 'Carlos López', ciudad: 'Medellín' },
    { correo: 'laura.martinez@demo.local', nombre_completo: 'Laura Martínez', ciudad: 'Cali' },
    { correo: 'andres.rodriguez@demo.local', nombre_completo: 'Andrés Rodríguez', ciudad: 'Barranquilla' },
    { correo: 'sofia.perez@demo.local', nombre_completo: 'Sofía Pérez', ciudad: 'Cartagena' },
  ];

  const adoptantesCreados = [];
  for (const a of adoptantesData) {
    const usuario = await prisma.usuario.create({
      data: {
        correo: a.correo,
        password_hash: PASSWORD_HASH,
        id_rol: rolMap.adoptante,
        estado_cuenta: 'activo',
      },
    });
    const adoptante = await prisma.adoptante.create({
      data: {
        id_usuario: usuario.id_usuario,
        nombre_completo: a.nombre_completo,
        ciudad: a.ciudad,
        direccion: `Calle ${Math.floor(Math.random() * 100)} # ${Math.floor(Math.random() * 50)} - ${Math.floor(Math.random() * 20)}, ${a.ciudad}`,
        whatsapp_adoptante: `+57${Math.floor(3000000000 + Math.random() * 999999999)}`,
        foto_perfil: `https://picsum.photos/seed/${usuario.id_usuario}/200/200`,
      },
    });
    adoptantesCreados.push(adoptante);
    console.log(`👤 Adoptante creado: ${a.nombre_completo} (ID: ${usuario.id_usuario})`);
  }

  // Asignar tags de preferencia a adoptantes
  for (const adoptante of adoptantesCreados) {
    const prefTags = [
      getOp('Tamaño', Math.floor(Math.random() * 4)),
      getOp('Edad', Math.floor(Math.random() * 4)),
      getOp('Nivel de Energía', Math.floor(Math.random() * 4)),
      getOp('Sociabilidad', Math.floor(Math.random() * 3)),
      getOp('Compatible con Niños', Math.floor(Math.random() * 3)),
      getOp('Compatible con Perros', Math.floor(Math.random() * 3)),
      getOp('Nivel de Entrenamiento', Math.floor(Math.random() * 3)),
    ];
    for (const op of prefTags) {
      await prisma.adoptanteTag.create({
        data: { id_usuario: adoptante.id_usuario, id_opcion: op.id_opcion },
      }).catch(() => {}); // ignorar duplicados
    }
  }

  // ─── 4. MASCOTAS ───────────────────────────────────────────────────
  const mascotasData = [
    {
      nombre: 'Max',
      descripcion: 'Max es un perrito juguetón que ama correr por el parque. Es muy cariñoso y se lleva bien con niños.',
      estado_adopcion: 'disponible',
      albergueIdx: 0,
      tags: [getOp('Tamaño', 1), getOp('Edad', 1), getOp('Nivel de Energía', 2), getOp('Sociabilidad', 1), getOp('Compatible con Niños', 0), getOp('Compatible con Perros', 0)],
      fotos: ['https://images.dog.ceo/breeds/labrador/n02099712_1.jpg', 'https://images.dog.ceo/breeds/labrador/n02099712_2.jpg'],
    },
    {
      nombre: 'Luna',
      descripcion: 'Luna es una gatita tranquila que disfruta de las siestas al sol. Perfecta para un apartamento.',
      estado_adopcion: 'disponible',
      albergueIdx: 0,
      tags: [getOp('Tamaño', 0), getOp('Edad', 2), getOp('Nivel de Energía', 0), getOp('Sociabilidad', 0), getOp('Compatible con Niños', 2), getOp('Compatible con Gatos', 0)],
      fotos: ['https://cdn2.thecatapi.com/images/MTY3ODIyMQ.jpg'],
    },
    {
      nombre: 'Rocky',
      descripcion: 'Rocky es un perro grande y protector. Necesita un hogar con espacio y dueño experimentado.',
      estado_adopcion: 'disponible',
      albergueIdx: 1,
      tags: [getOp('Tamaño', 2), getOp('Edad', 2), getOp('Nivel de Energía', 3), getOp('Sociabilidad', 0), getOp('Compatible con Niños', 1), getOp('Nivel de Entrenamiento', 2)],
      fotos: ['https://images.dog.ceo/breeds/germanshepherd/n02106662_1.jpg', 'https://images.dog.ceo/breeds/germanshepherd/n02106662_2.jpg'],
    },
    {
      nombre: 'Bella',
      descripcion: 'Bella es una perrita mediana muy cariñosa. Le encanta jugar con pelotas y pasear.',
      estado_adopcion: 'disponible',
      albergueIdx: 1,
      tags: [getOp('Tamaño', 1), getOp('Edad', 0), getOp('Nivel de Energía', 2), getOp('Sociabilidad', 2), getOp('Compatible con Niños', 0), getOp('Compatible con Perros', 0)],
      fotos: ['https://images.dog.ceo/breeds/beagle/n02088364_1.jpg'],
    },
    {
      nombre: 'Simba',
      descripcion: 'Simba es un gato joven y curioso. Le gusta explorar y jugar con juguetes interactivos.',
      estado_adopcion: 'disponible',
      albergueIdx: 2,
      tags: [getOp('Tamaño', 0), getOp('Edad', 1), getOp('Nivel de Energía', 2), getOp('Sociabilidad', 1), getOp('Compatible con Gatos', 0), getOp('Tipo de Pelaje', 1)],
      fotos: ['https://cdn2.thecatapi.com/images/MTc4NjIyNg.jpg', 'https://cdn2.thecatapi.com/images/MTc4NjIyNw.jpg'],
    },
    {
      nombre: 'Toby',
      descripcion: 'Toby es un perrito senior muy tranquilo. Busca un hogar cálido para sus últimos años.',
      estado_adopcion: 'disponible',
      albergueIdx: 2,
      tags: [getOp('Tamaño', 0), getOp('Edad', 3), getOp('Nivel de Energía', 0), getOp('Sociabilidad', 1), getOp('Compatible con Niños', 0), getOp('Necesidades Especiales', 0)],
      fotos: ['https://images.dog.ceo/breeds/pug/n02110958_1.jpg'],
    },
    {
      nombre: 'Nala',
      descripcion: 'Nala es una perrita energética que necesita mucho ejercicio. Ideal para personas activas.',
      estado_adopcion: 'disponible',
      albergueIdx: 3,
      tags: [getOp('Tamaño', 1), getOp('Edad', 1), getOp('Nivel de Energía', 3), getOp('Sociabilidad', 2), getOp('Compatible con Perros', 0), getOp('Nivel de Entrenamiento', 1)],
      fotos: ['https://images.dog.ceo/breeds/husky/n02110185_1.jpg', 'https://images.dog.ceo/breeds/husky/n02110185_2.jpg'],
    },
    {
      nombre: 'Milo',
      descripcion: 'Milo es un gatito tímido que necesita paciencia. Una vez que confía, es muy dulce.',
      estado_adopcion: 'disponible',
      albergueIdx: 3,
      tags: [getOp('Tamaño', 0), getOp('Edad', 0), getOp('Nivel de Energía', 1), getOp('Sociabilidad', 0), getOp('Compatible con Gatos', 2), getOp('Tipo de Pelaje', 0)],
      fotos: ['https://cdn2.thecatapi.com/images/MTY4NjIyNg.jpg'],
    },
    {
      nombre: 'Duke',
      descripcion: 'Duke es un perro grande y amigable. Le encanta nadar y jugar en el agua.',
      estado_adopcion: 'disponible',
      albergueIdx: 0,
      tags: [getOp('Tamaño', 3), getOp('Edad', 2), getOp('Nivel de Energía', 2), getOp('Sociabilidad', 2), getOp('Compatible con Niños', 0), getOp('Compatible con Perros', 0)],
      fotos: ['https://images.dog.ceo/breeds/goldenretriever/n02099601_1.jpg'],
    },
    {
      nombre: 'Coco',
      descripcion: 'Coco es una perrita pequeña con mucha personalidad. Le encanta estar en brazos.',
      estado_adopcion: 'disponible',
      albergueIdx: 1,
      tags: [getOp('Tamaño', 0), getOp('Edad', 2), getOp('Nivel de Energía', 1), getOp('Sociabilidad', 1), getOp('Compatible con Niños', 0), getOp('Compatible con Gatos', 0)],
      fotos: ['https://images.dog.ceo/breeds/chihuahua/n02085620_1.jpg', 'https://images.dog.ceo/breeds/chihuahua/n02085620_2.jpg'],
    },
    {
      nombre: 'Oliver',
      descripcion: 'Oliver es un gato adulto muy relajado. Perfecto para alguien que busca compañía tranquila.',
      estado_adopcion: 'disponible',
      albergueIdx: 2,
      tags: [getOp('Tamaño', 1), getOp('Edad', 2), getOp('Nivel de Energía', 0), getOp('Sociabilidad', 1), getOp('Compatible con Perros', 0), getOp('Tipo de Pelaje', 2)],
      fotos: ['https://cdn2.thecatapi.com/images/MTY3ODIyMg.jpg'],
    },
    {
      nombre: 'Bruno',
      descripcion: 'Bruno es un perro guardián leal. Necesita entrenamiento continuo pero es muy inteligente.',
      estado_adopcion: 'disponible',
      albergueIdx: 3,
      tags: [getOp('Tamaño', 2), getOp('Edad', 2), getOp('Nivel de Energía', 2), getOp('Sociabilidad', 0), getOp('Compatible con Niños', 1), getOp('Nivel de Entrenamiento', 2)],
      fotos: ['https://images.dog.ceo/breeds/rottweiler/n02106550_1.jpg'],
    },
  ];

  for (const m of mascotasData) {
    const albergue = alberguesCreados[m.albergueIdx];
    const mascota = await prisma.mascota.create({
      data: {
        id_albergue: albergue.id_usuario,
        nombre: m.nombre,
        descripcion: m.descripcion,
        estado_adopcion: m.estado_adopcion,
      },
    });

    // Fotos
    for (let i = 0; i < m.fotos.length; i++) {
      await prisma.mascotaFoto.create({
        data: { id_mascota: mascota.id_mascota, url_foto: m.fotos[i], orden: i + 1 },
      });
    }

    // Tags
    for (const op of m.tags) {
      await prisma.mascotaTag.create({
        data: { id_mascota: mascota.id_mascota, id_opcion: op.id_opcion },
      }).catch(() => {});
    }

    console.log(`🐾 Mascota creada: ${m.nombre} (ID: ${mascota.id_mascota})`);
  }

  // ─── 5. MATCHES Y ADOPCIONES DE EJEMPLO ───────────────────────────
  // Crear algunos matches para que el feed tenga historial
  const mascotasExistentes = await prisma.mascota.findMany({ where: { estado_adopcion: 'disponible' }, take: 5 });
  for (let i = 0; i < Math.min(3, mascotasExistentes.length); i++) {
    const adoptante = adoptantesCreados[i];
    const mascota = mascotasExistentes[i];
    await prisma.match.create({
      data: {
        id_adoptante: adoptante.id_usuario,
        id_mascota: mascota.id_mascota,
        puntaje: (70 + Math.random() * 25).toFixed(2),
        estado: 'pendiente',
      },
    });
    console.log(`❤️ Match creado: Adoptante ${adoptante.id_usuario} + Mascota ${mascota.id_mascota}`);
  }

  console.log('\n✅ Seed completado exitosamente.');
  console.log(`   - ${alberguesCreados.length} albergues`);
  console.log(`   - ${adoptantesCreados.length} adoptantes`);
  console.log(`   - ${mascotasData.length} mascotas`);
  console.log(`   - ${tagsData.length} tags con opciones`);
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
