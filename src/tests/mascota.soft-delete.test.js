/**
 * Tests para mascotaService.eliminarMascota — HU-MA-04
 *
 * Cambios respecto a versión anterior:
 * - motivo es ahora OBLIGATORIO con mínimo 10 caracteres
 * - mascota con estado 'adoptado' no puede eliminarse
 * - cancela matches activos (pendiente/contactado) y notifica adoptantes
 */
jest.mock('../config/prisma', () => require('./__mocks__/prisma'));

const prisma = require('../config/prisma');
const { eliminarMascota } = require('../services/mascotaService');

describe('mascotaService — eliminarMascota (HU-MA-04)', () => {
    const idAlbergue = 1;
    const idMascota = 42;
    const baseMascota = {
        id_mascota: idMascota,
        id_albergue: idAlbergue,
        nombre: 'Firulais',
        estado_adopcion: 'disponible',
    };

    beforeEach(() => {
        jest.clearAllMocks();
    });

    // ── Validaciones de entrada ──────────────────────────────
    it('rechaza si el motivo está ausente', async () => {
        const result = await eliminarMascota(idMascota, idAlbergue, undefined);
        expect(result.success).toBe(false);
        expect(result.status).toBe(400);
        expect(result.message).toContain('motivo');
    });

    it('rechaza si el motivo tiene menos de 10 caracteres', async () => {
        const result = await eliminarMascota(idMascota, idAlbergue, 'corto');
        expect(result.success).toBe(false);
        expect(result.status).toBe(400);
        expect(result.message).toContain('10 caracteres');
    });

    it('rechaza si la mascota no existe (404)', async () => {
        prisma.mascota.findUnique.mockResolvedValueOnce(null);
        const result = await eliminarMascota(idMascota, idAlbergue, 'Motivo suficientemente largo');
        expect(result.success).toBe(false);
        expect(result.status).toBe(404);
        expect(prisma.mascota.update).not.toHaveBeenCalled();
    });

    it('rechaza si la mascota no pertenece al albergue (403)', async () => {
        prisma.mascota.findUnique.mockResolvedValueOnce({ ...baseMascota, id_albergue: 999 });
        const result = await eliminarMascota(idMascota, idAlbergue, 'Motivo suficientemente largo');
        expect(result.success).toBe(false);
        expect(result.status).toBe(403);
        expect(prisma.mascota.update).not.toHaveBeenCalled();
    });

    it('rechaza si la mascota está adoptada (400)', async () => {
        prisma.mascota.findUnique.mockResolvedValueOnce({ ...baseMascota, estado_adopcion: 'adoptado' });
        const result = await eliminarMascota(idMascota, idAlbergue, 'Motivo suficientemente largo');
        expect(result.success).toBe(false);
        expect(result.status).toBe(400);
        expect(result.message).toContain('adoptada');
        expect(prisma.mascota.update).not.toHaveBeenCalled();
    });

    // ── Soft delete exitoso sin matches activos ───────────────
    it('realiza soft delete con motivo y registra auditoría', async () => {
        prisma.mascota.findUnique.mockResolvedValueOnce(baseMascota);
        prisma.match.findMany.mockResolvedValueOnce([]); // sin matches activos
        prisma.mascota.update.mockResolvedValueOnce({});
        prisma.logAuditoria.create.mockResolvedValueOnce({});

        const result = await eliminarMascota(idMascota, idAlbergue, 'Adoptada fuera de la plataforma');

        expect(result.success).toBe(true);
        expect(prisma.mascota.update).toHaveBeenCalledWith(expect.objectContaining({
            where: { id_mascota: idMascota },
            data: expect.objectContaining({
                deleted_at: expect.any(Date),
                motivo_eliminacion: 'Adoptada fuera de la plataforma',
                estado_adopcion: 'inactivo',
            }),
        }));
        expect(prisma.logAuditoria.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({ accion: 'ELIMINACION_MASCOTA' }),
        }));
    });

    it('el deleted_at es una fecha reciente (menos de 5 segundos)', async () => {
        prisma.mascota.findUnique.mockResolvedValueOnce(baseMascota);
        prisma.match.findMany.mockResolvedValueOnce([]);
        let capturedDate = null;
        prisma.mascota.update.mockImplementationOnce(({ data }) => {
            capturedDate = data.deleted_at;
            return Promise.resolve({});
        });
        prisma.logAuditoria.create.mockResolvedValueOnce({});

        await eliminarMascota(idMascota, idAlbergue, 'Motivo suficientemente largo');

        expect(capturedDate).toBeInstanceOf(Date);
        expect(Date.now() - capturedDate.getTime()).toBeLessThan(5000);
    });

    // ── Cancelación de matches activos y notificaciones ──────
    it('cancela matches pendientes y contactados, notifica adoptantes', async () => {
        prisma.mascota.findUnique.mockResolvedValueOnce(baseMascota);
        prisma.match.findMany.mockResolvedValueOnce([
            { id_match: 1, id_adoptante: 10 },
            { id_match: 2, id_adoptante: 20 },
        ]);
        prisma.match.updateMany.mockResolvedValueOnce({ count: 2 });
        prisma.notificacion.create.mockResolvedValue({});
        prisma.mascota.update.mockResolvedValueOnce({});
        prisma.logAuditoria.create.mockResolvedValueOnce({});

        const result = await eliminarMascota(idMascota, idAlbergue, 'Motivo suficientemente largo');

        expect(result.success).toBe(true);
        expect(result.data.matches_cancelados).toBe(2);

        expect(prisma.match.updateMany).toHaveBeenCalledWith({
            where: {
                id_mascota: idMascota,
                estado: { in: ['pendiente', 'contactado'] },
            },
            data: { estado: 'cancelado' },
        });

        // Notificaciones para ambos adoptantes
        expect(prisma.notificacion.create).toHaveBeenCalledTimes(2);
        expect(prisma.notificacion.create).toHaveBeenCalledWith(expect.objectContaining({
            data: expect.objectContaining({
                id_usuario: 10,
                tipo_notificacion: 'mascota_no_disponible',
                mensaje: expect.stringContaining('Firulais'),
            }),
        }));
    });

    it('incluye matches_cancelados en el log de auditoría', async () => {
        prisma.mascota.findUnique.mockResolvedValueOnce(baseMascota);
        prisma.match.findMany.mockResolvedValueOnce([{ id_match: 1, id_adoptante: 10 }]);
        prisma.match.updateMany.mockResolvedValueOnce({ count: 1 });
        prisma.notificacion.create.mockResolvedValue({});
        prisma.mascota.update.mockResolvedValueOnce({});

        let auditoriaData = null;
        prisma.logAuditoria.create.mockImplementationOnce(({ data }) => {
            auditoriaData = data;
            return Promise.resolve({});
        });

        await eliminarMascota(idMascota, idAlbergue, 'Motivo suficientemente largo');

        const valorNuevo = JSON.parse(auditoriaData.valor_nuevo);
        expect(valorNuevo.matches_cancelados).toBe(1);
        expect(valorNuevo.motivo).toBe('Motivo suficientemente largo');
    });
});
