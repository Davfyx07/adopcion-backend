const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Directorio de subida local (desarrollo)
const UPLOAD_DIR = path.join(__dirname, '..', '..', 'uploads', 'logos');

// Crear directorio si no existe
if (!fs.existsSync(UPLOAD_DIR)) {
    fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

// Tipos MIME permitidos
const ALLOWED_MIMES = ['image/jpeg', 'image/png'];
const MAX_FILE_SIZE = 5 * 1024 * 1024; // 5MB

/**
 * Filtro de archivos: solo JPG y PNG
 */
const fileFilter = (req, file, cb) => {
    if (ALLOWED_MIMES.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Formato no permitido. Solo se aceptan archivos JPG y PNG.'), false);
    }
};

/**
 * Configuración de almacenamiento local
 * Nombre del archivo: logo_{userId}_{timestamp}.ext
 */
const storage = multer.diskStorage({
    destination: (req, file, cb) => {
        cb(null, UPLOAD_DIR);
    },
    filename: (req, file, cb) => {
        const ext = path.extname(file.originalname).toLowerCase();
        const userId = req.user ? req.user.id : 'unknown';
        const timestamp = Date.now();
        cb(null, `logo_${userId}_${timestamp}${ext}`);
    },
});

/**
 * Instancia de multer configurada para logos institucionales
 */
const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: MAX_FILE_SIZE,
    },
});

module.exports = { upload, UPLOAD_DIR, ALLOWED_MIMES, MAX_FILE_SIZE };
