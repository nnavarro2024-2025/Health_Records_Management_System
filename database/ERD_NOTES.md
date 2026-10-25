# Health Records Database ERD Notes

The schema is designed for MySQL/InnoDB in XAMPP. It has 21 tables and separates
patient identity, encounter data, clinical lists, reference values, users, and
auditable workflow records. The seed data mirrors the Filipino names, roles,
patient identifiers, statuses, and retention examples in `src/data/mockData.ts`.
Additional sample dates and clinical values are illustrative because the mock
data does not provide them.

## Tables, columns, and keys

`PK` = primary key, `FK` = foreign key, `UQ` = unique constraint.

1. **roles** — `role_id` (PK), `role_name` (UQ), `description`.
2. **staff** — `staff_id` (PK), `first_name`, `middle_name`, `last_name`,
   `credentials`, `staff_type`, `license_number` (nullable UQ), `is_active`,
   `created_at`.
3. **users** — `user_id` (PK), `staff_id` (nullable FK, UQ), `role_id` (FK),
   `email` (UQ), `password_hash`, `account_status`, `last_login_at`,
   `created_at`, `updated_at`.
4. **patients** — `patient_id` (PK), `hospital_id` (UQ), `personal_id`
   (nullable UQ), `first_name`, `middle_name`, `last_name`, `date_of_birth`,
   `sex`, `race_ethnicity`, `mobile_number`, `record_status`,
   `created_by_user_id` (nullable FK), `created_at`, `updated_at`.
5. **patient_addresses** — `address_id` (PK), `patient_id` (FK),
   `street_barangay`, `city_municipality`, `province`, `zip_code`,
   `valid_from`, `valid_to`. Also has a candidate key on `(address_id, patient_id)`
   for the encounter residence FK.
6. **patient_emergency_contacts** — `emergency_contact_id` (PK),
   `patient_id` (FK), `contact_name`, `contact_number`,
   `relationship_to_patient`.
7. **diagnoses** — `diagnosis_id` (PK), `coding_system`, `diagnosis_code`,
   `diagnosis_name`; UQ `(coding_system, diagnosis_code)`.
8. **procedures** — `procedure_id` (PK), `coding_system`, `procedure_code`,
   `procedure_name`; UQ `(coding_system, procedure_code)`.
9. **payment_sources** — `payment_source_id` (PK), `source_name` (UQ),
   `is_active`.
10. **dispositions** — `disposition_id` (PK), `disposition_name` (UQ),
    `is_active`.
11. **admissions** — `admission_id` (PK), `encounter_number` (UQ),
    `patient_id` (FK), `residence_address_id` (part of composite FK),
    `encounter_type`, `admission_type`, `admission_datetime`,
    `discharge_datetime`, `attending_staff_id` (FK),
    `payment_source_id` (FK), `principal_diagnosis_id` (FK),
    `disposition_id` (nullable FK), `room`, `total_charges`, `status`,
    `created_at`, `updated_at`.
12. **admission_diagnoses** — `admission_id` (PK part, FK),
    `diagnosis_id` (PK part, FK), `sequence_number`; UQ
    `(admission_id, sequence_number)`. Contains secondary diagnoses;
    the principal diagnosis is a required FK on `admissions`.
13. **admission_procedures** — `admission_id` (PK part, FK),
    `procedure_id` (PK part, FK), `performed_at`, `notes`.
14. **patient_problems** — `patient_problem_id` (PK), `patient_id` (FK),
    `diagnosis_id` (FK), `recorded_at`, `resolved_at`, `notes`,
    `recorded_by_user_id` (nullable FK).
15. **patient_allergies** — `allergy_id` (PK), `patient_id` (FK),
    `allergen`, `reaction`, `severity`, `allergy_status`, `recorded_at`,
    `recorded_by_user_id` (nullable FK).
16. **patient_medications** — `patient_medication_id` (PK),
    `patient_id` (FK), `medication_name`, `strength`, `dose`, `route`,
    `frequency`, `medication_status`, `start_date`, `end_date`, `notes`,
    `recorded_by_user_id` (nullable FK), `created_at`.
17. **admission_medications** — `admission_id` (PK part, FK),
    `patient_medication_id` (PK part, FK), `medication_phase`,
    `reconciliation_notes`. Associates a patient's medication with an
    admission or discharge reconciliation.
18. **audit_logs** — `audit_log_id` (PK), `actor_user_id` (nullable FK),
    `actor_role_id` (nullable FK; preserves the role at event time),
    `patient_id` (nullable FK), `action_code`, `description`, `occurred_at`.
19. **retention_categories** — `retention_category_id` (PK),
    `category_name` (UQ), `retention_years`, `description`, `is_active`.
20. **retention_records** — `retention_record_id` (PK), `admission_id` (FK,
    UQ), `retention_category_id` (FK), `review_due_date`, `review_status`,
    `reviewed_by_user_id` (nullable FK), `reviewed_at`, `review_notes`.
21. **data_dictionary** — `data_dictionary_id` (PK), `table_name`,
    `column_name`, `description`, `data_type`, `field_length`; UQ
    `(table_name, column_name)`.

## Relationships, cardinality, and participation

“Mandatory” means every row on the first side must have a related row on the
second side. Optionality describes whether a row may exist without a related row.

| Relationship | Cardinality | Participation |
| --- | --- | --- |
| `roles` → `users` | 1:N | Each user has exactly one role (mandatory); a role may have zero or many users (optional). |
| `staff` → `users` | 1:0..1 | A user may be linked to zero or one staff member (optional); a staff member may have zero or one user account (optional). |
| `users` → `patients` (creator) | 1:N | A patient may have no recorded creator (optional); a user may have created zero or many patients (optional). |
| `patients` → `patient_addresses` | 1:N | Each address belongs to one patient (mandatory); a patient may have zero or many addresses in the database (optional). Registration should create an address before it is considered complete. |
| `patients` → `patient_emergency_contacts` | 1:N | Each contact belongs to one patient (mandatory); a patient may have zero or many contacts (optional). |
| `patients` → `admissions` | 1:N | Each encounter belongs to one patient (mandatory); a patient may have zero or many encounters (optional). |
| `patient_addresses` → `admissions` (residence at encounter) | 1:N | Each encounter references exactly one address belonging to its patient (mandatory); an address may be referenced by zero or many encounters (optional). |
| `staff` → `admissions` (attending physician) | 1:N | Each encounter has one attending staff member (mandatory); staff may attend zero or many encounters (optional). |
| `payment_sources` → `admissions` | 1:N | Each encounter has one expected payment source (mandatory); a source may be used by zero or many encounters (optional). |
| `diagnoses` → `admissions` (principal diagnosis) | 1:N | Each encounter has exactly one principal diagnosis (mandatory); a diagnosis may be principal for zero or many encounters (optional). |
| `dispositions` → `admissions` | 1:N | A discharged encounter has one disposition; an in-progress/cancelled encounter has none (optional on admission side). A disposition may be used zero or many times (optional). |
| `admissions` ↔ `diagnoses` through `admission_diagnoses` | M:N | An encounter may have zero or many secondary diagnoses and a diagnosis may appear on zero or many encounters (optional at both ends); each bridge row must reference one of each (mandatory). |
| `admissions` ↔ `procedures` through `admission_procedures` | M:N | An encounter may have zero or many procedures and a procedure may appear in zero or many encounters (optional at both ends); each bridge row must reference one of each (mandatory). |
| `patients` → `patient_problems` | 1:N | Each problem belongs to one patient (mandatory); a patient may have zero or many problems (optional). |
| `diagnoses` → `patient_problems` | 1:N | Each problem references one diagnosis (mandatory); a diagnosis may be used by zero or many problems (optional). |
| `users` → `patient_problems` (recorder) | 1:N | A problem may have no recorded user (optional); a user may record zero or many problems (optional). |
| `patients` → `patient_allergies` | 1:N | Each allergy belongs to one patient (mandatory); a patient may have zero or many allergies (optional). |
| `users` → `patient_allergies` (recorder) | 1:N | An allergy may have no recorded user (optional); a user may record zero or many allergies (optional). |
| `patients` → `patient_medications` | 1:N | Each medication record belongs to one patient (mandatory); a patient may have zero or many medication records (optional). |
| `users` → `patient_medications` (recorder) | 1:N | A medication record may have no recorded user (optional); a user may record zero or many medication records (optional). |
| `admissions` ↔ `patient_medications` through `admission_medications` | M:N | An encounter may reconcile zero or many medications and a medication record may be reconciled in zero or many encounters (optional at both ends); each bridge row must reference one of each (mandatory). |
| `users` → `audit_logs` (actor) | 1:N | An audit event may have no user actor for a system event (optional); a user may have zero or many events (optional). User deletion is restricted once referenced. |
| `roles` → `audit_logs` (role at event time) | 1:N | An event may have no role for a system event (optional); a role may be recorded on zero or many events (optional). |
| `patients` → `audit_logs` | 1:N | An event may be system-wide and have no patient (optional); a patient may have zero or many audit events (optional). |
| `retention_categories` → `retention_records` | 1:N | Each retention record has one category (mandatory); a category may be used by zero or many records (optional). |
| `admissions` → `retention_records` | 1:0..1 | A retention record belongs to one encounter (mandatory); an encounter has zero or one retention record (optional). |
| `users` → `retention_records` (reviewer) | 1:N | A pending record may have no reviewer (optional); a user may review zero or many records (optional). |

`data_dictionary` is a standalone metadata table and has no FK relationships.

## Constraint and deletion notes

- `users.password_hash` is required and sized for password-hashing algorithms;
  the seed contains only bcrypt hash strings, not plaintext passwords. Those
  demo hashes are not suitable credentials for a deployed application.
- `UNIQUE` constraints protect hospital/personal identifiers, user emails,
  reference codes, and one retention record per encounter. Nullable personal
  IDs permit multiple patients without a supplied government identifier.
- `CHECK` constraints validate dates, charges, names, sequences, review state,
  and required discharge dates/charges. Triggers enforce that discharged
  encounters have a disposition and non-discharged encounters do not; this
  avoids referencing a foreign-key column in a MySQL `CHECK` expression.
  Use a MySQL/MariaDB version that enforces `CHECK` constraints and triggers.
- Encounter diagnosis/procedure/medication bridge rows cascade only when their
  owning encounter is removed. Patient clinical history, audit references,
  encounters, and retention history use `RESTRICT` to prevent accidental
  deletion of the medical/audit trail. Deactivate or mark records instead of
  deleting them in normal workflows.
- Dashboard activity can be queried from `audit_logs`; no duplicate activity
  table is needed. Patient list status/room/last-visit values can be derived
  from the patient's latest encounter and its state.
- The mock dictionary's `admission_date`, `principal_diagnosis`, and
  `patient_disposition` are semantic field names. The normalized schema stores
  admission time as `admission_datetime`, principal diagnosis as a diagnosis
  FK, and disposition as a disposition FK; dictionary entries retain the
  frontend's terms for display.
- The SQL scripts create and seed fictional school-project records. They do
  not establish legal retention periods, production authentication, or
  regulatory compliance.
