-- #224 — chi muc tra lich su theo mot aggregate (don hang...)
-- ════════════════════════════════════════════════════════════════════
-- Man chi tiet don nay doc lich su vong doi tu domain_events theo
-- aggregate_id. Truoc ban nay KHONG co chi muc nao theo aggregate_id
-- (attribution_idx chi phu 3 event_type contact/deal), nen moi lan mo don
-- phai SEQ SCAN ca bang domain_events — da do 103.913 dong va tang dan
-- (~3-4 su kien moi don). aggregate_id la uuid, loc theo no rat chon loc.
--
-- ⚠️ AP TAY (CONCURRENTLY) — KHONG qua transaction cua ap-migration: bang nay
-- co traffic ghi THAT (PostgREST) chay song song; `create index` thuong can
-- ACCESS EXCLUSIVE va da bi lock_timeout (55P03) khi thu. `concurrently` xay
-- chi muc KHONG chan writer. Ap thang roi ghi so bang `--ghi-so`.
create index concurrently if not exists domain_events_aggregate_idx
  on public.domain_events (aggregate_id, created_at);
