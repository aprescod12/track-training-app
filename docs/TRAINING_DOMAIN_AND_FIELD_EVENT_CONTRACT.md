# Track Training App — Training Domain & Field Event Contract

**Status:** Implemented in repository; hosted Supabase deployment pending  
**Target repository:** `aprescod12/track-training-app`  
**Target branch:** `main`

## 1. Product Training Domains

Track & field training is represented by four first-class domains:

- **Running**
- **Jumps**
- **Throws**
- **Lift**

The historical `track` database value is migrated to `running`. `track` is no longer the authorization or logging umbrella for all non-lift training.

Coach prescription/review authority is granted independently for these four domains. Team membership, team-group membership, athlete visibility, and training-domain authority remain independent concepts.

## 2. Running

Running keeps the existing rep/set-oriented model. Typical performance fields include:

- exercise / drill;
- distance;
- sets and reps;
- rep time;
- recovery;
- notes.

The existing fastest-time PR system remains the Running performance-best mechanism for this phase.

## 3. Jumps

Supported events:

- Long Jump
- Triple Jump
- High Jump
- Pole Vault

### Horizontal jumps

Long Jump and Triple Jump use attempt-level performance records.

Each attempt stores:

- attempt number;
- optional measured mark in meters;
- outcome: `valid`, `foul`, or `unmeasured`;
- optional notes.

A `valid` attempt requires a measured mark. An `unmeasured` attempt stores no mark.

### Vertical jumps

High Jump and Pole Vault use height-attempt records.

Each attempt stores:

- attempt number;
- bar height in meters;
- outcome: `clear`, `miss`, or `pass`;
- optional notes.

The first field-event implementation intentionally records individual attempts rather than forcing vertical jumps into the Running/Lift set model.

## 4. Throws

Supported events:

- Shot Put
- Discus
- Hammer
- Javelin

Each throwing workout entry stores an implement weight in kilograms. Each attempt stores:

- attempt number;
- optional measured mark in meters;
- outcome: `valid`, `foul`, or `unmeasured`;
- optional notes.

Implement weight is required for athlete Throws logging so performances with different implements are not treated as directly equivalent.

Training bests for throws are grouped by event and implement weight.

## 5. Wind Is Deferred

Wind readings are deliberately **not part of the first field-event schema or logging UI**.

This phase is focused on low-friction practice logging. Wind may be added later for competition marks and advanced performance validation without changing the core attempt ownership model.

## 6. Field Prescription Model

Coach-authored Jumps and Throws templates may prescribe:

- event;
- number of attempts;
- optional target mark;
- optional technical notes;
- optional implement weight for Throws prescriptions.

Field attempts themselves remain athlete-owned performance records. Coaches prescribe the work; athletes record what happened.

## 7. Privacy and Ownership

`field_attempts` inherits visibility from its parent workout.

- The athlete can read and mutate their own attempts.
- An accepted friend may read a personal workout through the existing friendship visibility rule.
- A coach-athlete relationship alone does not expose a personal workout.
- An explicitly assigned coach may read attempts only when the parent workout is in that team context.
- Coaches may never edit athlete-owned field attempts through coaching authority.

This preserves the existing separation between athlete performance and coach prescription.

## 8. Assignment Attachment

An athlete may attach a personally logged workout to an assignment only when the workout and assignment share the same training domain, in addition to the existing ownership, date, membership, and team-context checks.

Examples:

- Running assignment → Running workout: allowed when all other checks pass.
- Jumps assignment → Jumps workout: allowed when all other checks pass.
- Throws assignment → Running workout: rejected.
- Lift assignment → Jumps workout: rejected.

Attaching the workout intentionally moves it into the assignment's team context, after which the explicitly assigned coach may read it.

## 9. Field Training Bests

The first field-event performance surface tracks training bests from valid performance attempts:

- Long/Triple Jump: greatest `valid` measured mark.
- High Jump/Pole Vault: greatest height with outcome `clear`.
- Throws: greatest `valid` measured mark, grouped by event and implement weight.

Competition PB/SB classification, wind legality, and meet-result verification are deferred additive features.

## 10. Calendar Semantics

The athlete calendar represents each training domain independently:

- Running
- Jumps
- Throws
- Lift

Assigned training uses an outline marker; logged training uses a filled marker. Personal calendar events remain a separate event marker.
