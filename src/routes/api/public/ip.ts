import { createFileRoute } from '@tanstack/react-router';

export const Route = createFileRoute('/api/public/ip')({
  server: {
    handlers: {
      GET: async () => {
        try {
          const res = await fetch('https://api.ipify.org?format=json');
          const { ip } = (await res.json()) as { ip: string };
          return Response.json({ ip, source: 'ipify' });
        } catch (e) {
          return Response.json({ error: 'No se pudo obtener la IP' }, { status: 500 });
        }
      },
    },
  },
});
