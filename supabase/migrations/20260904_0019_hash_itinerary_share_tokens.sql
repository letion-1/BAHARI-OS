-- ============================================================================
-- 20260904_0019_hash_itinerary_share_tokens.sql
--
-- Store itinerary share tokens as hashes, like every other token in this
-- schema.
--
-- Proposal share links and charter contract links both store only a SHA-256
-- hash: the raw token is shown to the broker once and cannot be recovered, so
-- a leaked database yields no working links. Itinerary shares were written
-- earlier and kept the plaintext token in `charter_itinerary_shares.token`.
--
-- That inconsistency matters more than it looks. An itinerary is the most
-- personal artifact in the product - it carries the guests' names, their
-- movements, and the dates a family is away from home - and its link is the
-- one handed to people outside the brokerage.
--
-- WHY THIS MIGRATION CAN KEEP EXISTING LINKS WORKING
--
-- Unlike a new feature, the plaintext tokens are sitting in the table right
-- now, so their hashes can be computed here. Every link already sent to a
-- guest keeps working. Had this been left until the plaintext was rotated
-- away, the only options would have been breaking live links or keeping the
-- weaker storage forever.
--
-- RUN THIS ONCE, AND DEPLOY THE CODE WITH IT
--
-- The column is dropped at the end, so the old code cannot read the table
-- afterwards. Deploy the matching application code in the same window.
-- ============================================================================

begin;

/*
 * pgcrypto for digest(). Supabase ships it; enabling is idempotent and it is
 * only needed for the backfill below, not at runtime.
 */
create extension if not exists pgcrypto with schema extensions;

alter table public.charter_itinerary_shares
  add column if not exists token_hash text;

/*
 * Backfill from the plaintext, so links already in guests' inboxes survive.
 *
 * Hex-encoded SHA-256 of the UTF-8 bytes, matching
 * createHash("sha256").update(token, "utf8").digest("hex") in the application
 * exactly. A different encoding here would produce hashes that never match a
 * lookup, and the failure would look like every existing link expiring at
 * once.
 */
update public.charter_itinerary_shares
set token_hash = encode(extensions.digest(token, 'sha256'), 'hex')
where token_hash is null
  and token is not null;

-- Nothing should be left unhashed. If this raises, stop and investigate
-- rather than dropping the plaintext column below.
do $$
declare
  missing integer;
begin
  select count(*) into missing
  from public.charter_itinerary_shares
  where token_hash is null;

  if missing > 0 then
    raise exception
      'Cannot drop the plaintext token: % rows have no hash.', missing;
  end if;
end $$;

alter table public.charter_itinerary_shares
  alter column token_hash set not null;

/*
 * Unique, because the public route looks a share up by this and two rows
 * sharing a hash would make which itinerary a guest sees depend on row order.
 */
create unique index if not exists charter_itinerary_shares_token_hash_idx
  on public.charter_itinerary_shares (token_hash);

/*
 * The plaintext goes. Keeping it "just in case" would defeat the entire
 * point: the value of hashing is that the raw token does not exist anywhere
 * after it is issued.
 */
alter table public.charter_itinerary_shares
  drop column if exists token;

comment on column public.charter_itinerary_shares.token_hash is
  'SHA-256 of the share token, hex encoded. The raw token is shown once at creation and is not recoverable.';

commit;