// ──────────────────────────────────────────────
// Storage Service Tests — Cloudinary upload/delete
// ──────────────────────────────────────────────

const cloudinary = require('cloudinary').v2;

// Mock Cloudinary SDK BEFORE requiring the service
jest.mock('cloudinary', () => ({
    v2: {
        config: jest.fn(),
        uploader: {
            upload: jest.fn(),
            destroy: jest.fn(),
        },
    },
}));

const fs = require('fs');

// Mock fs for local file cleanup tests
jest.mock('fs', () => ({
    existsSync: jest.fn(),
    unlinkSync: jest.fn(),
}));

const { uploadImage, deleteImage, validateBase64Image } = require('../services/storageService');

describe('storageService — validateBase64Image', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('debe aceptar una imagen JPG en base64 válida', () => {
        const result = validateBase64Image('data:image/jpeg;base64,/9j/4AAQSkZJRg=');
        expect(result.valid).toBe(true);
    });

    it('debe aceptar una imagen PNG en base64 válida', () => {
        const result = validateBase64Image('data:image/png;base64,iVBORw0KGgo=');
        expect(result.valid).toBe(true);
    });

    it('debe rechazar un formato que no sea JPG/PNG', () => {
        const result = validateBase64Image('data:image/gif;base64,R0lGODlh=');
        expect(result.valid).toBe(false);
        expect(result.message).toContain('JPG o PNG');
    });

    it('debe rechazar una imagen que supere los 5MB', () => {
        // 6MB aprox en base64 (~6_291_456 bytes)
        const largeBase64 = 'data:image/jpeg;base64,' + 'A'.repeat(8_400_000);
        const result = validateBase64Image(largeBase64);
        expect(result.valid).toBe(false);
        expect(result.message).toContain('5MB');
    });

    it('debe rechazar un string que no es data URI', () => {
        const result = validateBase64Image('no-es-base64');
        expect(result.valid).toBe(false);
    });
});

describe('storageService — uploadImage', () => {
    const OLD_ENV = process.env;

    beforeEach(() => {
        jest.clearAllMocks();
        process.env = { ...OLD_ENV };
        // Configurar Cloudinary como conectado
        process.env.CLOUD_NAME = 'mi-cloud';
        process.env.CLOUD_KEY = '123456';
        process.env.CLOUD_SECRET = 'secreto';
    });

    afterAll(() => {
        process.env = OLD_ENV;
    });

    it('debe subir una imagen en base64 a Cloudinary y retornar secure_url', async () => {
        const fakeUrl = 'https://res.cloudinary.com/mi-cloud/image/upload/v1/adopcion/mascota_123.jpg';
        cloudinary.uploader.upload.mockResolvedValue({ secure_url: fakeUrl });

        const result = await uploadImage('data:image/jpeg;base64,/9j/4AAQ==', 'adopcion');

        expect(cloudinary.uploader.upload).toHaveBeenCalledWith(
            'data:image/jpeg;base64,/9j/4AAQ==',
            expect.objectContaining({
                folder: 'adopcion',
                transformation: expect.any(Array),
            })
        );
        expect(result).toBe(fakeUrl);
    });

    it('debe subir una imagen desde ruta local y limpiar el archivo del disco', async () => {
        const fakeUrl = 'https://res.cloudinary.com/mi-cloud/image/upload/v1/adopcion/mascota_456.jpg';
        cloudinary.uploader.upload.mockResolvedValue({ secure_url: fakeUrl });
        fs.existsSync.mockReturnValue(true);

        const result = await uploadImage('/tmp/uploads/logo.jpg', 'adopcion');

        expect(cloudinary.uploader.upload).toHaveBeenCalled();
        expect(fs.existsSync).toHaveBeenCalledWith('/tmp/uploads/logo.jpg');
        expect(fs.unlinkSync).toHaveBeenCalledWith('/tmp/uploads/logo.jpg');
        expect(result).toBe(fakeUrl);
    });

    it('debe usar URL mock cuando Cloudinary no está configurado', async () => {
        process.env.CLOUD_NAME = 'tu_cloud_name';
        process.env.CLOUD_KEY = '';
        process.env.CLOUD_SECRET = '';

        const result = await uploadImage('data:image/jpeg;base64,/9j/4AAQ==', 'adopcion');

        expect(cloudinary.uploader.upload).not.toHaveBeenCalled();
        expect(result).toMatch(/^https:\/\/res\.cloudinary\.com\/demo\/image\/upload\/v1\/adopcion\/mock_/);
    });

    it('debe lanzar error si Cloudinary falla', async () => {
        cloudinary.uploader.upload.mockRejectedValue(new Error('Network error'));

        await expect(
            uploadImage('data:image/jpeg;base64,/9j/4AAQ==', 'adopcion')
        ).rejects.toThrow('Error al subir la imagen al servidor en la nube.');
    });
});

describe('storageService — deleteImage', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('debe extraer public_id de una URL simple y eliminar la imagen', async () => {
        cloudinary.uploader.destroy.mockResolvedValue({ result: 'ok' });

        await deleteImage('https://res.cloudinary.com/demo/image/upload/v1/adopcion/foto_123.jpg', 'adopcion');

        expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('adopcion/foto_123');
    });

    it('debe extraer el public_id completo cuando la URL contiene subfolders', async () => {
        cloudinary.uploader.destroy.mockResolvedValue({ result: 'ok' });

        // URL con subfolders: /v1/adopcion/mascotas/2026/04/foto_abc.jpg
        // El public_id real en Cloudinary es "adopcion/mascotas/2026/04/foto_abc"
        await deleteImage(
            'https://res.cloudinary.com/demo/image/upload/v1/adopcion/mascotas/2026/04/foto_abc.jpg',
            'adopcion/mascotas'
        );

        expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('adopcion/mascotas/2026/04/foto_abc');
    });

    it('debe extraer public_id de URLs sin versión (v omitido)', async () => {
        cloudinary.uploader.destroy.mockResolvedValue({ result: 'ok' });

        await deleteImage(
            'https://res.cloudinary.com/demo/image/upload/adopcion/mascotas/foto_sin_version.jpg',
            'adopcion/mascotas'
        );

        expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('adopcion/mascotas/foto_sin_version');
    });

    it('debe extraer public_id de URLs con resource type distinto (video, raw)', async () => {
        cloudinary.uploader.destroy.mockResolvedValue({ result: 'ok' });

        await deleteImage(
            'https://res.cloudinary.com/demo/video/upload/v1/adopcion/videos/clip.mp4',
            'adopcion/videos'
        );

        expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('adopcion/videos/clip');
    });

    it('debe usar fallback cuando no encuentra /upload/ en la URL', async () => {
        cloudinary.uploader.destroy.mockResolvedValue({ result: 'ok' });

        await deleteImage('https://otro-servidor.com/imagenes/foto.jpg', 'adopcion');

        expect(cloudinary.uploader.destroy).toHaveBeenCalledWith('adopcion/foto');
    });

    it('debe manejar errores sin lanzar excepción (solo warn)', async () => {
        cloudinary.uploader.destroy.mockRejectedValue(new Error('Not found'));

        // No debe lanzar — solo loguea warning
        await expect(
            deleteImage('https://res.cloudinary.com/demo/image/upload/v1/adopcion/foto.jpg', 'adopcion')
        ).resolves.toBeUndefined();
    });
});
