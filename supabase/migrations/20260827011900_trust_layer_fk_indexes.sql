-- Migration C follow-up: cover trust-layer foreign keys used by review/history lookups.
-- These indexes resolve Supabase advisor warnings introduced by the trust-layer tables.

create index verification_requests_reviewed_by_idx
  on public.verification_requests (reviewed_by)
  where reviewed_by is not null;

create index entity_claims_verification_request_id_idx
  on public.entity_claims (verification_request_id)
  where verification_request_id is not null;

create index entity_claims_resolved_by_idx
  on public.entity_claims (resolved_by)
  where resolved_by is not null;

create index organization_affiliation_requests_approved_by_idx
  on public.organization_affiliation_requests (approved_by)
  where approved_by is not null;
