create extension if not exists pg_cron with schema extensions;
create extension if not exists pg_net with schema extensions;

select cron.unschedule('recargas-ip-watch') where exists (select 1 from cron.job where jobname = 'recargas-ip-watch');

select cron.schedule(
  'recargas-ip-watch',
  '*/10 * * * *',
  $$select net.http_get(url := 'https://project--1dd4e998-1a18-445b-ab87-74821040c713.lovable.app/api/public/ip-watch', timeout_milliseconds := 8000);$$
);