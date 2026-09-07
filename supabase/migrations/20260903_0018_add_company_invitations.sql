-- ============================================================================
-- 20260903_0018_add_company_invitations.sql
--
-- Let a brokerage add its own people.
--
-- Until now a company had exactly one member: the account that signed up,
-- written as 'owner' by provision-workspace.ts. Every role check in the
-- codebase already reads company_members.role, and has_company_role() from
-- migration 0011 already answers questions about it, but nothing has ever
-- written a second row. A brokerage with a captain and someone doing
-- marketing had no way to give either of them an account.
--
-- WHY AN INVITATION TABLE RATHER THAN CREATING THE USER DIRECTLY
--
-- An owner could type a colleague's email and a temporary password, and the
-- colleague would be in immediately. That is fewer moving parts and it is
-- what a lot of small tools do. It is rejected here for two reasons.
--
-- The owner would know the colleague's password. For a product whose entire
-- claim is tenant isolation and auditable access to charter data, having the
-- CEO hold the captain's credentials undermines the thing being sold. Worse,
-- it makes every action in the audit trail deniable: "that was not me, the
-- office had my password" is unanswerable.
--
-- And a mailbox is the only evidence available that the person on the other
-- end is who the owner thinks they are. Requiring the invitee to open a link
-- sent to their own address is a weak check, but it is a real one, and it is
-- the same check the signup flow already relies on.
--
-- WHY THE TOKEN IS STORED AS A HASH
--
-- Same reasoning as contract and itinerary share tokens, and deliberately the
-- same shape: 32 random bytes, base64url, sha256 at rest. An invitation grants
-- membership of a company workspace, which is a larger prize than a share
-- link, so a leaked database must not yield a working invitation. The raw
-- token exists only in the email.
--
-- WHY EXPIRY IS A COLUMN AND NOT A CLEANUP JOB
--
-- A stale invitation is a standing offer of access to a tenant. Anything that
-- depends on a worker having run is an offer that stays open when the worker
-- fails. Acceptance checks the column, so an expired invitation is dead
-- whether or not anything has swept it up.
-- ============================================================================

begin;

-- ---------------------------------------------------------------- roles

/*
 * The five roles the application recognises. Declared here so the database
 * refuses a typo rather than creating a member whose role matches no branch
 * in any permission check and who therefore silently has nothing.
 *
 * Kept in sync with WorkspaceRole in lib/workspace/get-current-workspace.ts.
 *
 * 'crew' is a membership role and has nothing to do with the 'crew' value in
 * the concierge assignment columns. That one says who is responsible for a
 * task; this one says what a person may do in the workspace. They are
 * different axes that happen to share a word.
 */
/*
 * NOT VALID, and deliberately not preceded by a normalising UPDATE.
 *
 * The obvious way to make this constraint safe is to rewrite any row that
 * would fail it - set role = 'broker' where role is unrecognised - and only
 * then add the constraint. Only 'owner' has ever been written, so on this
 * database that statement touches nothing.
 *
 * It is still the wrong instinct. A migration that silently rewrites live
 * membership rows to make its own constraint pass will, on the one workspace
 * where someone did edit a role by hand, change a person's access with no
 * error, no record, and nobody watching. The failure mode of guessing wrong
 * is an access change nobody asked for.
 *
 * NOT VALID governs every future insert and update while leaving existing
 * rows unexamined, so this migration cannot fail on data it did not create
 * and cannot quietly alter it either. Once production membership rows have
 * been looked at:
 *
 *   alter table public.company_members
 *     validate constraint company_members_role_check;
 *
 * which takes a SHARE UPDATE EXCLUSIVE lock rather than blocking reads.
 */
alter table public.company_members
  drop constraint if exists company_members_role_check;

alter table public.company_members
  add constraint company_members_role_check
  check (role in ('owner', 'admin', 'broker', 'crew', 'viewer'))
  not valid;

/*
 * One membership row per person per company.
 *
 * acceptInvitation() checks for an existing row before inserting and treats
 * 23505 as success, which is correct but only holds while something can raise
 * 23505. Without this index two rows can exist, and getCurrentWorkspace reads
 * whichever the ordering happens to return first - a coin flip between
 * 'viewer' and 'owner' that changes between requests.
 */
create unique index if not exists company_members_one_per_user
  on public.company_members (company_id, user_id);

comment on column public.company_members.role is
  'Workspace permission tier: owner, admin, broker, crew or viewer. Not a job title - job titles live in the auth user metadata as role_title.';


-- ---------------------------------------------------------------- invitations

create table if not exists public.company_invitations (
  id uuid not null primary key default gen_random_uuid(),
  company_id uuid not null references public.companies (id) on delete cascade,

  /*
   * Stored lower-cased by the application. The unique index below also folds
   * case, so 'Captain@example.com' cannot be invited alongside
   * 'captain@example.com' and produce two live offers for one mailbox.
   */
  email text not null,

  role text not null
    check (role in ('admin', 'broker', 'crew', 'viewer')),

  token_hash text not null unique,

  /*
   * True when this invitation created the Supabase Auth user, so the invitee
   * arrives with a session but no password and the acceptance page must ask
   * for one.
   *
   * False when the address already had a Bahari OS account - a captain who
   * works with a second brokerage, say. That person already has a password
   * and must not be made to change it to accept an invitation.
   *
   * Recorded at invitation time rather than inferred later, because Supabase
   * exposes no reliable "this user has a password" signal and guessing wrong
   * either locks a new member out or forces a rotation on someone who did not
   * ask for one.
   */
  requires_password_setup boolean not null default true,

  invited_by uuid not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null,

  accepted_at timestamptz,
  accepted_by uuid,

  revoked_at timestamptz,
  revoked_by uuid
);

/*
 * 'owner' is absent from the role check on purpose. Ownership is not something
 * to hand out by email: it carries workspace deletion, which erases every
 * colleague's work. Transferring it should be its own deliberate action with
 * its own confirmation, not a dropdown value in an invite form.
 */
comment on table public.company_invitations is
  'Pending offers of membership in a company workspace. Consumed by /api/team/invitations/accept. Service-role access only - RLS grants no client policy.';

comment on column public.company_invitations.token_hash is
  'sha256 of the base64url invitation token. The raw token exists only in the invitation email and cannot be recovered from here.';


-- ---------------------------------------------------------------- indexes

/*
 * One live invitation per mailbox per company. Partial, so the same address
 * can be re-invited after an invitation is accepted, revoked or has expired,
 * while a second simultaneous offer raises 23505 and the API reports a
 * conflict instead of quietly creating a duplicate.
 *
 * Expiry is not in the predicate: a predicate cannot reference now() and stay
 * immutable. Re-inviting an expired address therefore has to revoke the dead
 * row first, which the API does.
 */
create unique index if not exists company_invitations_one_live_per_email
  on public.company_invitations (company_id, lower(email))
  where accepted_at is null and revoked_at is null;

create index if not exists company_invitations_company_created_idx
  on public.company_invitations (company_id, created_at desc);

/*
 * Acceptance arrives with a token and nothing else - no session, no company
 * context - so the hash lookup is the entry point and needs its own index.
 * The unique constraint above already provides one; named here only to record
 * that the lookup path is intentional.
 */


-- ---------------------------------------------------------------- rls

/*
 * Enabled with no policy, which denies every client-side read and write.
 *
 * This matches how company_members is handled in migration 0011 and for the
 * same reason: the invitation table is the boundary of the tenant graph. A
 * broker who could insert here could grant themselves membership of another
 * company, and a broker who could select here could enumerate which addresses
 * a competitor is onboarding.
 *
 * Every path that touches this table goes through createAdminClient() in an
 * API route that has already resolved the caller's workspace and checked
 * their role. Acceptance is unauthenticated by necessity and is gated on
 * possession of the token instead.
 */
alter table public.company_invitations enable row level security;

do $$
begin
  raise notice 'company_invitations: RLS enabled, no client policy - service role only';
end
$$;

commit;
