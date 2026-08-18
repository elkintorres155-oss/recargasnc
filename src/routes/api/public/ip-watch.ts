import { createFileRoute } from '@tanstack/react-router';
import { checkEgressIp } from '@/lib/ip-watch.server';

/**
 * Endpoint de monitoreo: revisa la IP pública de salida y avisa por Telegram
 * cuando cambia. Pensado para ejecutarse periódicamente (cron).
 */
export const Route = createFileRoute('/api/public/ip-watch')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const result = await checkEgressIp();
          return Response.json(result, {
            headers: { 'Cache-Control': 'no-store' },
          });
        } catch (err) {
          console.error('ip-watch failed', err);
          return Response.json({ error: 'No se pudo verificar la IP' }, { status: 500 });
        }
      },
    },
  },
});
