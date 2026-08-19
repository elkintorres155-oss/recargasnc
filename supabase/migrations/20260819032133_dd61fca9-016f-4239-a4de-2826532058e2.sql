UPDATE public.store_settings
SET data = jsonb_set(
  data,
  '{catalog,0,items,0,packs}',
  '[
    {"id":"110-diamantes","label":"110 Diamantes","price":65,"sku":"TOPUP_FREE_FIRE_LATAM_110_DIAMONDS_542"},
    {"id":"341-diamantes","label":"341 Diamantes","price":185,"sku":"TOPUP_FREE_FIRE_LATAM_341_DIAMONDS_543"},
    {"id":"572-diamantes","label":"572 Diamantes","price":300,"sku":"TOPUP_FREE_FIRE_LATAM_572_DIAMONDS_544"},
    {"id":"1166-diamantes","label":"1166 Diamantes","price":590,"sku":"TOPUP_FREE_FIRE_LATAM_1166_DIAMONDS_545"},
    {"id":"2398-diamantes","label":"2398 Diamantes","price":1180,"sku":"TOPUP_FREE_FIRE_LATAM_2398_DIAMONDS_546"},
    {"id":"6160-diamantes","label":"6160 Diamantes","price":2950,"sku":"TOPUP_FREE_FIRE_LATAM_6160_DIAMONDS_547"}
  ]'::jsonb
)
WHERE id = 'default';

UPDATE public.store_settings
SET data = jsonb_set(
  data,
  '{catalog,0,items,1,packs}',
  '[
    {"id":"weekly-lite","label":"Weekly Lite","price":50,"sku":"TOPUP_FREE_FIRE_LATAM_WEEKLY_LITE_550"},
    {"id":"membresia-semanal","label":"Membresía Semanal","price":185,"sku":"TOPUP_FREE_FIRE_LATAM_WEEKLY_MEMBERSHIP_551"},
    {"id":"booyah-pass","label":"Booyah Pass","price":310,"sku":"TOPUP_FREE_FIRE_LATAM_BOOYAH_PASS_548"},
    {"id":"membresia-mensual","label":"Membresía Mensual","price":880,"sku":"TOPUP_FREE_FIRE_LATAM_MONTHLY_MEMBERSHIP_549"}
  ]'::jsonb
)
WHERE id = 'default';