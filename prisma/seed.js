// Cargar variables de entorno
require('dotenv').config();

// Debug: verificar que se cargaron
console.log('🔍 Environment check:', {
  NODE_ENV: process.env.NODE_ENV,
  SEED_PASSWORD: process.env.SEED_PASSWORD ? '✅ Set' : '❌ Missing',
  DATABASE_URL: process.env.DATABASE_URL ? '✅ Set' : '❌ Missing'
});

const bcrypt = require('bcrypt');
const prisma = require('../src/config/prisma');

// IMPORTANTE: Nunca commitear contraseñas reales.
// Usar variable de entorno SEED_PASSWORD. Si no está definida, fallar explícitamente.
if (!process.env.SEED_PASSWORD) {
  throw new Error('SEED_PASSWORD no está definida en el entorno. Creá un archivo .env con SEED_PASSWORD=tu_password_de_prueba');
}
const SEED_PASSWORD = process.env.SEED_PASSWORD;
const PASSWORD_HASH = bcrypt.hashSync(SEED_PASSWORD, 10);

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
// Catálogo unificado RF-US-01 + RF-MA-01: tags compartidos entre adoptante y mascota.
// El frontend filtra qué opciones mostrar según perfil.
// Pesos según RF-ADM-02 (0.0 = no influye, 1.0 = máxima influencia).
// es_filtro_absoluto: true = debe coincidir obligatoriamente en matching.
const tagsData = [
  {
    nombre_tag: 'Tipo de animal',
    categoria: 'Caracteristicas',
    peso_matching: 0,       // Filtro absoluto, no necesita peso
    es_filtro_absoluto: true, // RF-ADM-02: tipo de animal es requisito excluyente
    opciones: ['Perro', 'Gato', 'Sin preferencia'],
  },
  {
    nombre_tag: 'Raza',
    categoria: 'Caracteristicas',
    peso_matching: 0.3,
    opciones: ['Sin preferencia', 'Labrador', 'Bulldog', 'Golden Retriever', 'Mestizo', 'Poodle', 'Beagle', 'Siamés', 'Persa', 'Común', 'Otra'],
  },
  {
    nombre_tag: 'Edad',
    categoria: 'Caracteristicas',
    peso_matching: 0.7,
    opciones: ['Cachorro (0–1 año)', 'Joven (1–3 años)', 'Adulto (3–7 años)', 'Senior (+7 años)', 'Sin preferencia'],
  },
  {
    nombre_tag: 'Tamaño',
    categoria: 'Caracteristicas',
    peso_matching: 0.8,
    opciones: ['Pequeño', 'Mediano', 'Grande', 'Sin preferencia'],
  },
  {
    nombre_tag: 'Color',
    categoria: 'Físico',
    peso_matching: 0.1,
    opciones: ['Negro', 'Blanco', 'Café', 'Gris', 'Anaranjado', 'Multicolor', 'Sin preferencia'],
  },
  {
    nombre_tag: 'Sexo',
    categoria: 'Caracteristicas',
    peso_matching: 0.5,
    opciones: ['Macho', 'Hembra', 'Sin preferencia'],
  },
  {
    nombre_tag: 'Nivel de energía',
    categoria: 'Personalidad',
    peso_matching: 0.8,
    opciones: ['Tranquilo', 'Moderado', 'Muy activo', 'Sin preferencia'],
  },
  {
    nombre_tag: 'Compatibilidad',
    categoria: 'Compatibilidad',
    peso_matching: 0.9,
    opciones: ['Niños', 'Otros perros', 'Gatos', 'Adultos mayores', 'Personas con discapacidad', 'Ninguna'],
  },
  {
    nombre_tag: 'Entorno del adoptante',
    categoria: 'Entorno',
    peso_matching: 0.7,
    opciones: ['Apartamento sin balcón', 'Apartamento con balcón', 'Casa sin jardín', 'Casa con jardín'],
  },
  {
    nombre_tag: 'Experiencia previa',
    categoria: 'Experiencia',
    peso_matching: 0.6,
    opciones: ['Primera vez adoptando', 'Con experiencia en mascotas', 'Sin preferencia'],
  },
  {
    nombre_tag: 'Disponibilidad de tiempo',
    categoria: 'Disponibilidad',
    peso_matching: 0.6,
    opciones: ['Trabajo en casa', 'Trabajo fuera (tiempo completo)', 'Trabajo fuera (medio tiempo)'],
  },
  {
    nombre_tag: 'Aceptación de condición especial',
    categoria: 'Salud',
    peso_matching: 0.5,
    opciones: ['Acepto mascotas con discapacidad', 'Acepto mascotas en tratamiento médico', 'Solo mascotas sanas'],
  },
  {
    nombre_tag: 'Condición especial',
    categoria: 'Salud',
    peso_matching: 0,   // Peso 0: puramente descriptivo, combinable con checkboxes
    opciones: ['Sin condición', 'Con discapacidad', 'En tratamiento médico'],
  },
  {
    nombre_tag: 'Estado de salud',
    categoria: 'Salud',
    peso_matching: 0,   // Peso 0: puramente descriptivo, combinable con checkboxes
    opciones: ['Vacunado', 'Desparasitado', 'Esterilizado'],
  },
];

const opcionesMap = new Map(); // tagName -> [{valor, id_opcion}]

for (const t of tagsData) {
  const tag = await prisma.tag.upsert({
    where: { nombre_tag: t.nombre_tag },
    update: {
      peso_matching: t.peso_matching ?? 0,
      es_filtro_absoluto: t.es_filtro_absoluto ?? false,
      categoria: t.categoria,
    },
    create: {
      nombre_tag: t.nombre_tag,
      categoria: t.categoria,
      peso_matching: t.peso_matching ?? 0,
      es_filtro_absoluto: t.es_filtro_absoluto ?? false,
    },
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

  // ─── 3. USUARIOS BÁSICOS DE PRUEBA ────────────────────────────────
  // Estos usuarios se crean para que cualquiera que clone el repo
  // tenga credenciales inmediatas para probar la app.
  const usuariosBasicos = [
    {
      correo: 'admin@furmatch.local',
      rol: 'admin',
      estado: 'activo',
    },
    {
      correo: 'pruebas.adoptante@furmatch.local',
      rol: 'adoptante',
      estado: 'activo',
      perfil: {
        nombre_completo: 'Usuario Adoptante de Prueba',
        ciudad: 'Bogotá',
        direccion: 'Calle 123 # 45-67, Bogotá',
        whatsapp_adoptante: '+573001234567',
        foto_perfil: 'https://picsum.photos/seed/adoptante/200/200',
      },
    },
    {
      correo: 'pruebas.albergue@furmatch.local',
      rol: 'albergue',
      estado: 'activo',
      perfil: {
        nit: '900999888',
        nombre_albergue: 'Albergue de Prueba FurMatch',
        whatsapp_actual: '+573009876543',
        descripcion: 'Albergue de prueba para desarrollo y demos de FurMatch.',
        logo: 'https://picsum.photos/seed/albergue/200/200',
      },
    },
  ];

  for (const u of usuariosBasicos) {
    const usuario = await prisma.usuario.upsert({
      where: { correo: u.correo },
      update: {},
      create: {
        correo: u.correo,
        password_hash: PASSWORD_HASH,
        id_rol: rolMap[u.rol],
        estado_cuenta: u.estado,
      },
    });

    if (u.rol === 'adoptante' && u.perfil) {
      await prisma.adoptante.upsert({
        where: { id_usuario: usuario.id_usuario },
        update: {},
        create: { id_usuario: usuario.id_usuario, ...u.perfil },
      });
    }

    if (u.rol === 'albergue' && u.perfil) {
      await prisma.albergue.upsert({
        where: { id_usuario: usuario.id_usuario },
        update: {},
        create: { id_usuario: usuario.id_usuario, ...u.perfil },
      });
    }

    console.log(`👤 Usuario base creado: ${u.correo} (${u.rol})`);
  }

  // Asignar tags a adoptantes base (incluyendo pruebas.adoptante@furmatch.local)
  const adoptantesBase = await prisma.adoptante.findMany({
    where: { id_usuario: { lte: 12 } },
  });
  for (const adoptante of adoptantesBase) {
    const prefTags = [
      getOp('Tipo de animal', Math.floor(Math.random() * 3)),
      getOp('Edad', Math.floor(Math.random() * 5)),
      getOp('Tamaño', Math.floor(Math.random() * 4)),
      getOp('Color', Math.floor(Math.random() * 7)),
      getOp('Sexo', Math.floor(Math.random() * 3)),
      getOp('Nivel de energía', Math.floor(Math.random() * 4)),
      getOp('Compatibilidad', Math.floor(Math.random() * 6)),
      getOp('Experiencia previa', Math.floor(Math.random() * 3)),
    ];
    for (const op of prefTags) {
      await prisma.adoptanteTag.create({
        data: { id_usuario: adoptante.id_usuario, id_opcion: op.id_opcion },
      }).catch(() => {});
    }
    console.log(`🏷️  Tags asignados a adoptante ID ${adoptante.id_usuario}`);
  }

  // ─── 4. USUARIOS Y PERFILES DEMO ──────────────────────────────────
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

  // Asignar tags de preferencia a adoptantes (RF-US-01)
  for (const adoptante of adoptantesCreados) {
    const prefTags = [
      getOp('Tipo de animal', Math.floor(Math.random() * 3)),
      getOp('Edad', Math.floor(Math.random() * 5)),
      getOp('Tamaño', Math.floor(Math.random() * 4)),
      getOp('Color', Math.floor(Math.random() * 7)),
      getOp('Sexo', Math.floor(Math.random() * 3)),
      getOp('Nivel de energía', Math.floor(Math.random() * 4)),
      getOp('Compatibilidad', Math.floor(Math.random() * 6)),
      getOp('Experiencia previa', Math.floor(Math.random() * 3)),
    ];
    for (const op of prefTags) {
      await prisma.adoptanteTag.create({
        data: { id_usuario: adoptante.id_usuario, id_opcion: op.id_opcion },
      }).catch(() => {}); // ignorar duplicados
    }
  }

  // ─── 4. MASCOTAS ───────────────────────────────────────────────────
  // Cada mascota recibe tags descriptivos del nuevo catálogo unificado (RF-MA-01)
  const mascotasData = [
    {
      nombre: 'Max',
      descripcion: 'Max es un perrito juguetón que ama correr por el parque. Es muy cariñoso y se lleva bien con niños.',
      estado_adopcion: 'disponible',
      albergueIdx: 0,
      tags: [
        getOp('Tipo de animal', 0),    // Perro
        getOp('Raza', 3),              // Golden Retriever (las fotos son de labrador, pero usamos un índice descriptivo)
        getOp('Edad', 1),              // Joven (1–3 años)
        getOp('Tamaño', 1),            // Mediano
        getOp('Color', 2),             // Café
        getOp('Sexo', 0),              // Macho
        getOp('Nivel de energía', 1),  // Moderado
        getOp('Compatibilidad', 0),    // Niños
        getOp('Compatibilidad', 1),    // Otros perros
        getOp('Condición especial', 0),// Sin condición
        getOp('Estado de salud', 0),   // Vacunado
        getOp('Estado de salud', 1),   // Desparasitado
        getOp('Estado de salud', 2),   // Esterilizado
      ],
      fotos: ['https://images.dog.ceo/breeds/labrador/n02099712_1.jpg', 'https://images.dog.ceo/breeds/labrador/n02099712_2.jpg'],
    },
    {
      nombre: 'Luna',
      descripcion: 'Luna es una gatita tranquila que disfruta de las siestas al sol. Perfecta para un apartamento.',
      estado_adopcion: 'disponible',
      albergueIdx: 0,
      tags: [
        getOp('Tipo de animal', 1),    // Gato
        getOp('Raza', 9),              // Común
        getOp('Edad', 2),              // Adulto (3–7 años)
        getOp('Tamaño', 0),            // Pequeño
        getOp('Color', 1),             // Blanco
        getOp('Sexo', 1),              // Hembra
        getOp('Nivel de energía', 0),  // Tranquilo
        getOp('Compatibilidad', 2),    // Gatos
        getOp('Condición especial', 0),// Sin condición
        getOp('Estado de salud', 0),   // Vacunado
        getOp('Estado de salud', 1),   // Desparasitado
        getOp('Estado de salud', 2),   // Esterilizado
      ],
      fotos: ['https://cdn2.thecatapi.com/images/MTY3ODIyMQ.jpg'],
    },
    {
      nombre: 'Rocky',
      descripcion: 'Rocky es un perro grande y protector. Necesita un hogar con espacio y dueño experimentado.',
      estado_adopcion: 'disponible',
      albergueIdx: 1,
      tags: [
        getOp('Tipo de animal', 0),    // Perro
        getOp('Raza', 4),              // Mestizo
        getOp('Edad', 2),              // Adulto (3–7 años)
        getOp('Tamaño', 2),            // Grande
        getOp('Color', 3),             // Gris
        getOp('Sexo', 0),              // Macho
        getOp('Nivel de energía', 2),  // Muy activo
        getOp('Compatibilidad', 0),    // Niños
        getOp('Condición especial', 0),// Sin condición
        getOp('Estado de salud', 0),   // Vacunado
        getOp('Estado de salud', 1),   // Desparasitado
        getOp('Estado de salud', 2),   // Esterilizado
      ],
      fotos: ['https://images.dog.ceo/breeds/germanshepherd/n02106662_1.jpg', 'https://images.dog.ceo/breeds/germanshepherd/n02106662_2.jpg'],
    },
    {
      nombre: 'Bella',
      descripcion: 'Bella es una perrita mediana muy cariñosa. Le encanta jugar con pelotas y pasear.',
      estado_adopcion: 'disponible',
      albergueIdx: 1,
      tags: [
        getOp('Tipo de animal', 0),    // Perro
        getOp('Raza', 6),              // Beagle
        getOp('Edad', 0),              // Cachorro (0–1 año)
        getOp('Tamaño', 1),            // Mediano
        getOp('Color', 5),             // Multicolor
        getOp('Sexo', 1),              // Hembra
        getOp('Nivel de energía', 1),  // Moderado
        getOp('Compatibilidad', 0),    // Niños
        getOp('Compatibilidad', 1),    // Otros perros
        getOp('Condición especial', 0),// Sin condición
        getOp('Estado de salud', 0),   // Vacunado
        getOp('Estado de salud', 1),   // Desparasitado
      ],
      fotos: ['https://images.dog.ceo/breeds/beagle/n02088364_1.jpg'],
    },
    {
      nombre: 'Simba',
      descripcion: 'Simba es un gato joven y curioso. Le gusta explorar y jugar con juguetes interactivos.',
      estado_adopcion: 'disponible',
      albergueIdx: 2,
      tags: [
        getOp('Tipo de animal', 1),    // Gato
        getOp('Raza', 9),              // Común
        getOp('Edad', 1),              // Joven (1–3 años)
        getOp('Tamaño', 0),            // Pequeño
        getOp('Color', 4),             // Anaranjado
        getOp('Sexo', 0),              // Macho
        getOp('Nivel de energía', 1),  // Moderado
        getOp('Compatibilidad', 2),    // Gatos
        getOp('Condición especial', 0),// Sin condición
        getOp('Estado de salud', 0),   // Vacunado
        getOp('Estado de salud', 1),   // Desparasitado
        getOp('Estado de salud', 2),   // Esterilizado
      ],
      fotos: ['https://cdn2.thecatapi.com/images/MTc4NjIyNg.jpg', 'https://cdn2.thecatapi.com/images/MTc4NjIyNw.jpg'],
    },
    {
      nombre: 'Toby',
      descripcion: 'Toby es un perrito senior muy tranquilo. Busca un hogar cálido para sus últimos años.',
      estado_adopcion: 'disponible',
      albergueIdx: 2,
      tags: [
        getOp('Tipo de animal', 0),    // Perro
        getOp('Raza', 0),              // Sin preferencia
        getOp('Edad', 3),              // Senior (+7 años)
        getOp('Tamaño', 0),            // Pequeño
        getOp('Color', 2),             // Café
        getOp('Sexo', 0),              // Macho
        getOp('Nivel de energía', 0),  // Tranquilo
        getOp('Compatibilidad', 0),    // Niños
        getOp('Condición especial', 2),// En tratamiento médico
        getOp('Estado de salud', 0),   // Vacunado
        getOp('Estado de salud', 1),   // Desparasitado
      ],
      fotos: ['https://images.dog.ceo/breeds/pug/n02110958_1.jpg'],
    },
    {
      nombre: 'Nala',
      descripcion: 'Nala es una perrita energética que necesita mucho ejercicio. Ideal para personas activas.',
      estado_adopcion: 'disponible',
      albergueIdx: 3,
      tags: [
        getOp('Tipo de animal', 0),    // Perro
        getOp('Raza', 5),              // Poodle
        getOp('Edad', 1),              // Joven (1–3 años)
        getOp('Tamaño', 1),            // Mediano
        getOp('Color', 1),             // Blanco
        getOp('Sexo', 1),              // Hembra
        getOp('Nivel de energía', 2),  // Muy activo
        getOp('Compatibilidad', 1),    // Otros perros
        getOp('Condición especial', 0),// Sin condición
        getOp('Estado de salud', 0),   // Vacunado
        getOp('Estado de salud', 1),   // Desparasitado
        getOp('Estado de salud', 2),   // Esterilizado
      ],
      fotos: ['https://images.dog.ceo/breeds/husky/n02110185_1.jpg', 'https://images.dog.ceo/breeds/husky/n02110185_2.jpg'],
    },
    {
      nombre: 'Milo',
      descripcion: 'Milo es un gatito tímido que necesita paciencia. Una vez que confía, es muy dulce.',
      estado_adopcion: 'disponible',
      albergueIdx: 3,
      tags: [
        getOp('Tipo de animal', 1),    // Gato
        getOp('Raza', 9),              // Común
        getOp('Edad', 0),              // Cachorro (0–1 año)
        getOp('Tamaño', 0),            // Pequeño
        getOp('Color', 3),             // Gris
        getOp('Sexo', 0),              // Macho
        getOp('Nivel de energía', 1),  // Moderado
        getOp('Compatibilidad', 2),    // Gatos
        getOp('Condición especial', 0),// Sin condición
        getOp('Estado de salud', 0),   // Vacunado
        getOp('Estado de salud', 1),   // Desparasitado
      ],
      fotos: ['https://cdn2.thecatapi.com/images/MTY4NjIyNg.jpg'],
    },
    {
      nombre: 'Duke',
      descripcion: 'Duke es un perro grande y amigable. Le encanta nadar y jugar en el agua.',
      estado_adopcion: 'disponible',
      albergueIdx: 0,
      tags: [
        getOp('Tipo de animal', 0),    // Perro
        getOp('Raza', 3),              // Golden Retriever
        getOp('Edad', 2),              // Adulto (3–7 años)
        getOp('Tamaño', 2),            // Grande
        getOp('Color', 2),             // Café
        getOp('Sexo', 0),              // Macho
        getOp('Nivel de energía', 1),  // Moderado
        getOp('Compatibilidad', 0),    // Niños
        getOp('Compatibilidad', 1),    // Otros perros
        getOp('Condición especial', 0),// Sin condición
        getOp('Estado de salud', 0),   // Vacunado
        getOp('Estado de salud', 1),   // Desparasitado
        getOp('Estado de salud', 2),   // Esterilizado
      ],
      fotos: ['https://images.dog.ceo/breeds/goldenretriever/n02099601_1.jpg'],
    },
    {
      nombre: 'Coco',
      descripcion: 'Coco es una perrita pequeña con mucha personalidad. Le encanta estar en brazos.',
      estado_adopcion: 'disponible',
      albergueIdx: 1,
      tags: [
        getOp('Tipo de animal', 0),    // Perro
        getOp('Raza', 10),             // Otra
        getOp('Edad', 2),              // Adulto (3–7 años)
        getOp('Tamaño', 0),            // Pequeño
        getOp('Color', 2),             // Café
        getOp('Sexo', 1),              // Hembra
        getOp('Nivel de energía', 0),  // Tranquilo
        getOp('Compatibilidad', 0),    // Niños
        getOp('Compatibilidad', 2),    // Gatos
        getOp('Condición especial', 0),// Sin condición
        getOp('Estado de salud', 0),   // Vacunado
        getOp('Estado de salud', 1),   // Desparasitado
      ],
      fotos: ['https://images.dog.ceo/breeds/chihuahua/n02085620_1.jpg', 'https://images.dog.ceo/breeds/chihuahua/n02085620_2.jpg'],
    },
    {
      nombre: 'Oliver',
      descripcion: 'Oliver es un gato adulto muy relajado. Perfecto para alguien que busca compañía tranquila.',
      estado_adopcion: 'disponible',
      albergueIdx: 2,
      tags: [
        getOp('Tipo de animal', 1),    // Gato
        getOp('Raza', 9),              // Común
        getOp('Edad', 2),              // Adulto (3–7 años)
        getOp('Tamaño', 1),            // Mediano
        getOp('Color', 5),             // Multicolor
        getOp('Sexo', 0),              // Macho
        getOp('Nivel de energía', 0),  // Tranquilo
        getOp('Compatibilidad', 1),    // Otros perros
        getOp('Condición especial', 0),// Sin condición
        getOp('Estado de salud', 0),   // Vacunado
        getOp('Estado de salud', 1),   // Desparasitado
        getOp('Estado de salud', 2),   // Esterilizado
      ],
      fotos: ['https://cdn2.thecatapi.com/images/MTY3ODIyMg.jpg'],
    },
    {
      nombre: 'Bruno',
      descripcion: 'Bruno es un perro guardián leal. Necesita entrenamiento continuo pero es muy inteligente.',
      estado_adopcion: 'disponible',
      albergueIdx: 3,
      tags: [
        getOp('Tipo de animal', 0),    // Perro
        getOp('Raza', 4),              // Mestizo
        getOp('Edad', 2),              // Adulto (3–7 años)
        getOp('Tamaño', 2),            // Grande
        getOp('Color', 0),             // Negro
        getOp('Sexo', 0),              // Macho
        getOp('Nivel de energía', 2),  // Muy activo
        getOp('Compatibilidad', 0),    // Niños
        getOp('Condición especial', 0),// Sin condición
        getOp('Estado de salud', 0),   // Vacunado
        getOp('Estado de salud', 1),   // Desparasitado
        getOp('Estado de salud', 2),   // Esterilizado
      ],
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

  // ─── 4b. MASCOTAS PARA EL ALBERGUE DE PRUEBA ──────────────────────
  // El albergue de prueba (pruebas.albergue@furmatch.local) necesita
  // mascotas para que el usuario de prueba pueda ver su listado.
  const alberguePrueba = await prisma.albergue.findUnique({
    where: { id_usuario: (await prisma.usuario.findUnique({ where: { correo: 'pruebas.albergue@furmatch.local' } })).id_usuario },
  });

  if (alberguePrueba) {
    const mascotasPrueba = [
      {
        nombre: 'Thor',
        descripcion: 'Thor es un perro leal y protector. Ideal para familias con espacio.',
        estado_adopcion: 'disponible',
        tags: [
          getOp('Tipo de animal', 0),    // Perro
          getOp('Raza', 1),              // Labrador
          getOp('Edad', 1),              // Joven (1–3 años)
          getOp('Tamaño', 2),            // Grande
          getOp('Color', 0),             // Negro
          getOp('Sexo', 0),              // Macho
          getOp('Nivel de energía', 2),  // Muy activo
          getOp('Compatibilidad', 0),    // Niños
          getOp('Compatibilidad', 1),    // Otros perros
          getOp('Condición especial', 0),// Sin condición
          getOp('Estado de salud', 0),   // Vacunado
          getOp('Estado de salud', 1),   // Desparasitado
          getOp('Estado de salud', 2),   // Esterilizado
        ],
        fotos: ['https://images.dog.ceo/breeds/labrador/n02099712_3.jpg'],
      },
      {
        nombre: 'Mimi',
        descripcion: 'Mimi es una gatita cariñosa que busca un hogar tranquilo.',
        estado_adopcion: 'disponible',
        tags: [
          getOp('Tipo de animal', 1),    // Gato
          getOp('Raza', 9),              // Común
          getOp('Edad', 0),              // Cachorro (0–1 año)
          getOp('Tamaño', 0),            // Pequeño
          getOp('Color', 1),             // Blanco
          getOp('Sexo', 1),              // Hembra
          getOp('Nivel de energía', 1),  // Moderado
          getOp('Compatibilidad', 2),    // Gatos
          getOp('Condición especial', 0),// Sin condición
          getOp('Estado de salud', 0),   // Vacunado
          getOp('Estado de salud', 1),   // Desparasitado
        ],
        fotos: ['https://cdn2.thecatapi.com/images/MTY3ODIyMQ.jpg'],
      },
      {
        nombre: 'Rex',
        descripcion: 'Rex es un perro adulto muy tranquilo. Le encanta dormir y pasear despacio.',
        estado_adopcion: 'disponible',
        tags: [
          getOp('Tipo de animal', 0),    // Perro
          getOp('Raza', 4),              // Mestizo
          getOp('Edad', 2),              // Adulto (3–7 años)
          getOp('Tamaño', 1),            // Mediano
          getOp('Color', 2),             // Café
          getOp('Sexo', 0),              // Macho
          getOp('Nivel de energía', 0),  // Tranquilo
          getOp('Compatibilidad', 0),    // Niños
          getOp('Condición especial', 1),// Con discapacidad
          getOp('Estado de salud', 0),   // Vacunado
          getOp('Estado de salud', 1),   // Desparasitado
          getOp('Estado de salud', 2),   // Esterilizado
        ],
        fotos: ['https://images.dog.ceo/breeds/beagle/n02088364_2.jpg'],
      },
    ];

    for (const m of mascotasPrueba) {
      const mascota = await prisma.mascota.create({
        data: {
          id_albergue: alberguePrueba.id_usuario,
          nombre: m.nombre,
          descripcion: m.descripcion,
          estado_adopcion: m.estado_adopcion,
        },
      });

      for (let i = 0; i < m.fotos.length; i++) {
        await prisma.mascotaFoto.create({
          data: { id_mascota: mascota.id_mascota, url_foto: m.fotos[i], orden: i + 1 },
        });
      }

      for (const op of m.tags) {
        await prisma.mascotaTag.create({
          data: { id_mascota: mascota.id_mascota, id_opcion: op.id_opcion },
        }).catch(() => {});
      }

      console.log(`🐾 Mascota de prueba creada: ${m.nombre} (ID: ${mascota.id_mascota})`);
    }
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
  console.log(`   - ${usuariosBasicos.length} usuarios base (admin, adoptante, albergue)`);
  console.log(`   - ${alberguesCreados.length} albergues demo`);
  console.log(`   - ${adoptantesCreados.length} adoptantes demo`);
  console.log(`   - ${mascotasData.length} mascotas`);
  console.log(`   - ${tagsData.length} tags con opciones`);
  console.log('\n🔑 Usuarios base creados. Usar SEED_PASSWORD o variable de entorno.');
}

main()
  .catch((e) => {
    console.error('❌ Error en seed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
