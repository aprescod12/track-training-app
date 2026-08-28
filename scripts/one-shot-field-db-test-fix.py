from pathlib import Path

scope = Path("supabase/tests/database/coach_training_responsibility_scopes.test.sql")
text = scope.read_text()
old = """  array[2::bigint],
  'team creator coach starts with Track and Lift authority'
);"""
new = """  array[4::bigint],
  'team creator coach starts with Running, Jumps, Throws, and Lift authority'
);"""
if old not in text:
    raise SystemExit("scope default-authority assertion marker missing")
scope.write_text(text.replace(old, new, 1))

field = Path("supabase/tests/database/field_event_training_domains.test.sql")
text = field.read_text()
old = """select throws_ok(
  $$update public.field_attempts set mark_m = 6.60 where entry_id = current_setting('test.field_jump_entry_id')::uuid and attempt_number = 1$$,
  '42501', null,
  'coach cannot edit athlete-owned field attempt'
);"""
new = """select results_eq(
  $$
    with updated as (
      update public.field_attempts
      set mark_m = 6.60
      where entry_id = current_setting('test.field_jump_entry_id')::uuid
        and attempt_number = 1
      returning 1
    )
    select count(*) from updated
  $$,
  array[0::bigint],
  'coach cannot edit athlete-owned field attempt'
);"""
if old not in text:
    raise SystemExit("field coach update assertion marker missing")
field.write_text(text.replace(old, new, 1))
