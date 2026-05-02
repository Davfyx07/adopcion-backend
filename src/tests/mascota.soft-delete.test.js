// ──────────────────────────────────────────────
// Mascota Soft Delete Tests
// ──────────────────────────────────────────────

jest.mock('../config/prisma', () => require('./__mocks__/prisma'));

const prisma = require('../config/prisma');
const { eliminarMascota } = require('../services/mascotaService');

describe('mascotaService — eliminarMascota (soft delete)', () => {
    const idAlbergue = 1;
    const idMascota = 42;
    const otraIdMascota = 99;
    const baseMascota = {
        id_mascota: idMascota,
        id_albergue: idAlbergue,
        nombre: 'Firulais',
        estado_adopcion: 'disponible',
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('debe hacer soft delete con motivo y registrar auditoría', async () => {
        // 1. findUnique → mascota encontrada
        prisma.mascota.findUnique.mockResolvedValueOnce(baseMascota);
        // 2. update → set deleted_at, motivo, estado
        prisma.mascota.update.mockResolvedValueOnce({});
        // 3. logAuditoria.create
        prisma.logAuditoria.create.mockResolvedValueOnce({});

        const result = await eliminarMascota(idMascota, idAlbergue, 'Adoptada fuera de la plataforma');

        expect(result.success).toBe(true);
        expect(result.message).toContain('eliminada exitosamente');

        // Verificar que se actualizó con deleted_at y motivo
        expect(prisma.mascota.update).toHaveBeenCalledWith(
            expect.objectContaining({
                where: { id_mascota: idMascota },
                data: expect.objectContaining({
                    deleted_at: expect.any(Date),
                    motivo_eliminacion: 'Adoptada fuera de la plataforma',
                    estado_adopcion: 'inactivo',
                }),
            })
        );

        // Verificar auditoría
        expect(prisma.logAuditoria.create).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    accion: 'ELIMINACION_MASCOTA',
                    id_registro_afectado: idMascota,
                }),
            })
        );
    });

    it('debe hacer soft delete sin motivo (motivo opcional)', async () => {
        prisma.mascota.findUnique.mockResolvedValueOnce(baseMascota);
        prisma.mascota.update.mockResolvedValueOnce({});
        prisma.logAuditoria.create.mockResolvedValueOnce({});

        const result = await eliminarMascota(idMascota, idAlbergue, undefined);

        expect(result.success).toBe(true);
        expect(prisma.mascota.update).toHaveBeenCalledWith(
            expect.objectContaining({
                data: expect.objectContaining({
                    motivo_eliminacion: null,
                }),
            })
        );
    });

    it('debe rechazar eliminación si la mascota no pertenece al albergue', async () => {
        const mascotaDeOtroAlbergue = {
            ...baseMascota,
            id_albergue: 999, // otro albergue
        };

        prisma.mascota.findUnique.mockResolvedValueOnce(mascotaDeOtroAlbergue);

        const result = await eliminarMascota(idMascota, idAlbergue, 'Motivo');

        expect(result.success).toBe(false);
        expect(result.status).toBe(403);
        expect(result.message).toContain('No tienes permiso');
        // No debe llamar a update ni auditoría
        expect(prisma.mascota.update).not.toHaveBeenCalled();
        expect(prisma.logAuditoria.create).not.toHaveBeenCalled();
    });

    it('debe retornar 404 si la mascota no existe', async () => {
        prisma.mascota.findUnique.mockResolvedValueOnce(null);

        const result = await eliminarMascota(idMascota, idAlbergue, 'Motivo');

        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
        expect(result.message).toContain('Mascota no encontrada');
        expect(prisma.mascota.update).not.toHaveBeenCalled();
    });

    it('debe verificar que deleted_at sea una fecha válida (no null)', async () => {
        prisma.mascota.findUnique.mockResolvedValueOnce(baseMascota);

        let capturedDeletedAt = null;
        prisma.mascota.update.mockImplementationOnce(({ data }) => {
            capturedDeletedAt = data.deleted_at;
            return Promise.resolve({});
        });
        prisma.logAuditoria.create.mockResolvedValueOnce({});

        await eliminarMascota(idMascota, idAlbergue, 'Razón X');

        expect(capturedDeletedAt).toBeInstanceOf(Date);
        expect(capturedDeletedAt.getTime()).toBeLessThanOrEqual(Date.now());
        // El deleted_at debe ser reciente (menos de 5 segundos de diferencia)
        expect(Date.now() - capturedDeletedAt.getTime()).toBeLessThan(5000);
    });

    it('debe actualizar estado_adopcion a inactivo tras el soft delete', async () => {
        prisma.mascota.findUnique.mockResolvedValueOnce(baseMascota);

        let capturedEstado = null;
        prisma.mascota.update.mockImplementationOnce(({ data }) => {
            capturedEstado = data.estado_adopcion;
            return Promise.resolve({});
        });
        prisma.logAuditoria.create.mockResolvedValueOnce({});

        await eliminarMascota(idMascota, idAlbergue, 'Motivo');

        expect(capturedEstado).toBe('inactivo');
    });

    it('debe incluir el motivo en el log de auditoría', async () => {
        prisma.mascota.findUnique.mockResolvedValueOnce(baseMascota);
        prisma.mascota.update.mockResolvedValueOnce({});

        let auditoriaData = null;
        prisma.logAuditoria.create.mockImplementationOnce(({ data }) => {
            auditoriaData = data;
            return Promise.resolve({});
        });

        await eliminarMascota(idMascota, idAlbergue, 'Mascota transferida');

        const valorNuevo = JSON.parse(auditoriaData.valor_nuevo);
        expect(valorNuevo.motivo).toBe('Mascota transferida');
        expect(valorNuevo.deleted_at).toBeDefined();
    });
});
