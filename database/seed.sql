USE health_records_db;

INSERT INTO roles (role_id, role_name, description) VALUES
  (1, 'Admin', 'System and user administration'),
  (2, 'Records Officer', 'Patient registration and records management'),
  (3, 'Physician', 'Clinical care and encounter documentation'),
  (4, 'Nurse', 'Nursing care and transitions of care');

INSERT INTO staff
  (staff_id, first_name, middle_name, last_name, credentials, staff_type, license_number)
VALUES
  (1, 'Juan', NULL, 'Perez', NULL, 'administrator', NULL),
  (2, 'Mila', NULL, 'Cruz', NULL, 'records_officer', NULL),
  (3, 'Rafael', NULL, 'Lim', 'MD', 'physician', 'DEMO-PHYS-0001'),
  (4, 'Ana', NULL, 'Navarro', 'RN', 'nurse', 'DEMO-NURSE-0001');

-- Demo-only bcrypt hash; replace seeded credentials before enabling real authentication.
INSERT INTO users
  (user_id, staff_id, role_id, email, password_hash, account_status, last_login_at)
VALUES
  (1, 1, 1, 'juan.perez@hsc.org.ph', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'active', '2025-06-18 08:12:00'),
  (2, 2, 2, 'mila.cruz@hsc.org.ph', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'active', '2025-06-18 09:56:00'),
  (3, 3, 3, 'rafael.lim@hsc.org.ph', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'active', '2025-06-18 10:42:00'),
  (4, 4, 4, 'ana.navarro@hsc.org.ph', '$2y$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2uheWG/igi.', 'active', '2025-06-18 10:31:00');

INSERT INTO patients
  (patient_id, hospital_id, first_name, middle_name, last_name, date_of_birth, sex, race_ethnicity, record_status, created_by_user_id)
VALUES
  (1, 'HSC-2025-00482', 'Maria', 'Teresa', 'Santos', '1979-04-05', 'female', 'Filipino', 'active', 2),
  (2, 'HSC-2025-00479', 'Jose', 'Miguel', 'Reyes', '1962-01-21', 'male', 'Filipino', 'active', 2),
  (3, 'HSC-2025-00471', 'Angelica', NULL, 'Dela Cruz', '1996-03-12', 'female', 'Filipino', 'active', 2),
  (4, 'HSC-2025-00462', 'Roberto', NULL, 'Villanueva', '1954-02-16', 'male', 'Filipino', 'active', 2),
  (5, 'HSC-2025-00451', 'Lorna', NULL, 'Bautista', '1987-01-10', 'female', 'Filipino', 'active', 2),
  (6, 'HSC-2010-00129', 'Carmen', NULL, 'Flores', '1955-08-10', 'female', 'Filipino', 'active', 2),
  (7, 'HSC-2010-00094', 'Eduardo', NULL, 'Garcia', '1950-11-22', 'male', 'Filipino', 'active', 2),
  (8, 'HSC-2009-00831', 'Renato', NULL, 'Mendoza', '1960-07-03', 'male', 'Filipino', 'active', 2);

INSERT INTO patient_addresses
  (address_id, patient_id, street_barangay, city_municipality, province, zip_code, valid_from)
VALUES
  (1, 1, 'Barangay Pinyahan', 'Quezon City', 'Metro Manila', '1100', '2020-01-01'),
  (2, 2, 'Barangay San Roque', 'Marikina City', 'Metro Manila', '1801', '2020-01-01'),
  (3, 3, 'Barangay San Antonio', 'Pasig City', 'Metro Manila', '1600', '2020-01-01'),
  (4, 4, 'Barangay San Isidro', 'Cainta', 'Rizal', '1900', '2020-01-01'),
  (5, 5, 'Barangay Plainview', 'Mandaluyong City', 'Metro Manila', '1550', '2020-01-01'),
  (6, 6, 'Barangay 1', 'Quezon City', 'Metro Manila', NULL, '2010-01-01'),
  (7, 7, 'Barangay 2', 'Marikina City', 'Metro Manila', NULL, '2010-01-01'),
  (8, 8, 'Barangay 3', 'Pasig City', 'Metro Manila', NULL, '2009-01-01');

INSERT INTO patient_emergency_contacts
  (patient_id, contact_name, contact_number, relationship_to_patient)
VALUES
  (1, 'Elena Santos', '+63 917 555 0101', 'Spouse'),
  (2, 'Rosa Reyes', '+63 917 555 0102', 'Spouse');

INSERT INTO diagnoses (diagnosis_id, coding_system, diagnosis_code, diagnosis_name) VALUES
  (1, 'ICD-10', 'J18.9', 'Pneumonia, unspecified organism'),
  (2, 'ICD-10', 'I10', 'Essential (primary) hypertension'),
  (3, 'ICD-10', 'E11.9', 'Type 2 diabetes mellitus without complications'),
  (4, 'ICD-10', 'R50.9', 'Fever, unspecified'),
  (5, 'ICD-10', 'M17.9', 'Osteoarthritis of knee, unspecified'),
  (6, 'ICD-10', 'J06.9', 'Acute upper respiratory infection, unspecified');

INSERT INTO procedures (procedure_id, coding_system, procedure_code, procedure_name) VALUES
  (1, 'LOCAL', 'OBS-001', 'Routine clinical observation'),
  (2, 'LOCAL', 'LAB-001', 'Routine laboratory panel');

INSERT INTO payment_sources (payment_source_id, source_name) VALUES
  (1, 'PhilHealth'),
  (2, 'Private insurance'),
  (3, 'Self-pay'),
  (4, 'Government program');

INSERT INTO dispositions (disposition_id, disposition_name) VALUES
  (1, 'Home / self-care'),
  (2, 'Transferred to another facility'),
  (3, 'Home health service'),
  (4, 'Against medical advice'),
  (5, 'Expired');

INSERT INTO admissions
  (admission_id, encounter_number, patient_id, residence_address_id, encounter_type, admission_type,
   admission_datetime, discharge_datetime, attending_staff_id, payment_source_id,
   principal_diagnosis_id, disposition_id, room, total_charges, status)
VALUES
  (1, 'ENC-2025-01001', 1, 1, 'inpatient', 'unscheduled_emergency', '2025-06-18 08:00:00', NULL, 3, 1, 1, NULL, 'Ward 3A · 312', NULL, 'in_progress'),
  (2, 'ENC-2025-01002', 2, 2, 'inpatient', 'scheduled', '2025-06-16 09:00:00', '2025-06-18 11:00:00', 3, 1, 2, 1, NULL, 18500.00, 'discharged'),
  (3, 'ENC-2025-01003', 3, 3, 'outpatient', 'scheduled', '2025-06-17 09:00:00', '2025-06-17 10:30:00', 3, 2, 6, 1, NULL, 2500.00, 'discharged'),
  (4, 'ENC-2025-01004', 4, 4, 'inpatient', 'unscheduled_emergency', '2025-06-16 14:00:00', NULL, 3, 4, 2, NULL, 'ICU · 04', NULL, 'in_progress'),
  (5, 'ENC-2025-01005', 5, 5, 'inpatient', 'scheduled', '2025-06-12 08:00:00', '2025-06-14 10:00:00', 3, 1, 5, 1, NULL, 12600.00, 'discharged'),
  (6, 'ENC-2010-00129', 6, 6, 'inpatient', 'scheduled', '2010-03-08 09:00:00', '2010-03-12 11:00:00', 3, 1, 2, 1, NULL, 8200.00, 'discharged'),
  (7, 'ENC-2010-00094', 7, 7, 'inpatient', 'scheduled', '2010-01-29 09:00:00', '2010-02-02 11:00:00', 3, 1, 3, 1, NULL, 9100.00, 'discharged'),
  (8, 'ENC-2009-00831', 8, 8, 'outpatient', 'unscheduled_emergency', '2009-11-08 08:00:00', '2009-11-08 10:00:00', 3, 3, 4, 1, NULL, 1800.00, 'discharged');

INSERT INTO admission_diagnoses (admission_id, diagnosis_id, sequence_number) VALUES
  (1, 2, 1),
  (2, 3, 1),
  (4, 3, 1),
  (6, 3, 1);

INSERT INTO admission_procedures (admission_id, procedure_id, performed_at, notes) VALUES
  (1, 2, '2025-06-18 09:10:00', 'Sample encounter procedure');

INSERT INTO patient_problems
  (patient_id, diagnosis_id, recorded_at, notes, recorded_by_user_id)
VALUES
  (1, 2, '2025-06-18 09:00:00', 'Active problem list entry', 3),
  (2, 2, '2025-06-16 09:30:00', 'History of hypertension', 3),
  (4, 2, '2025-06-16 14:30:00', 'Active problem list entry', 3);

INSERT INTO patient_allergies
  (patient_id, allergen, reaction, severity, recorded_at, recorded_by_user_id)
VALUES
  (1, 'Penicillin', 'Urticaria', 'moderate', '2025-06-18 08:15:00', 4);

INSERT INTO patient_medications
  (patient_medication_id, patient_id, medication_name, strength, dose, route, frequency, medication_status, start_date, recorded_by_user_id)
VALUES
  (1, 1, 'Amlodipine', '5 mg tablet', '5 mg', 'Oral', 'Once daily', 'active', '2025-06-18', 3);

INSERT INTO admission_medications
  (admission_id, patient_medication_id, medication_phase, reconciliation_notes)
VALUES
  (1, 1, 'admission', 'Medication reconciliation sample');

INSERT INTO audit_logs
  (audit_log_id, actor_user_id, actor_role_id, patient_id, action_code, description, occurred_at)
VALUES
  (1, 4, 4, 1, 'MEDICATION_LIST_UPDATED', 'updated medication list', '2025-06-18 10:32:00'),
  (2, 3, 3, 2, 'DISCHARGE_SUMMARY_COMPLETED', 'completed discharge summary', '2025-06-18 10:10:00'),
  (3, 2, 2, 3, 'PATIENT_REGISTERED', 'registered a new patient', '2025-06-18 09:26:00'),
  (4, 1, 1, 4, 'RECORD_CORRECTION_APPROVED', 'approved record correction', '2025-06-18 08:26:00'),
  (5, 3, 3, 1, 'VIEWED', 'viewed patient record', '2025-06-18 10:42:00'),
  (6, 4, 4, 1, 'UPDATED', 'updated patient record', '2025-06-18 10:31:00'),
  (7, 2, 2, 3, 'CREATED', 'created patient record', '2025-06-18 09:56:00'),
  (8, 1, 1, 2, 'EXPORTED', 'exported patient record', '2025-06-18 09:20:00');

INSERT INTO retention_categories
  (retention_category_id, category_name, retention_years, description)
VALUES
  (1, 'Adult inpatient', 15, 'Adult inpatient record retention review'),
  (2, 'Outpatient', 15, 'Outpatient record retention review');

INSERT INTO retention_records
  (retention_record_id, admission_id, retention_category_id, review_due_date, review_status, review_notes)
VALUES
  (1, 6, 1, '2025-03-12', 'pending_review', '15 years elapsed'),
  (2, 7, 1, '2025-02-02', 'pending_review', '15 years elapsed'),
  (3, 8, 2, '2024-11-08', 'pending_review', 'Retention exceeded');

INSERT INTO data_dictionary
  (table_name, column_name, description, data_type, field_length)
VALUES
  ('patients', 'hospital_id', 'Unique hospital-assigned patient identifier', 'VARCHAR', '20'),
  ('patients', 'date_of_birth', 'Patient date of birth', 'DATE', '10'),
  ('patients', 'sex', 'Administrative sex at registration', 'ENUM', '20'),
  ('patients', 'race_ethnicity', 'Self-reported race or ethnicity', 'VARCHAR', '80'),
  ('admissions', 'admission_date', 'Date and time of inpatient admission', 'DATETIME', '19'),
  ('admissions', 'admission_type', 'Scheduled or unscheduled admission', 'ENUM', '20'),
  ('admissions', 'principal_diagnosis', 'Condition established after study to be chiefly responsible for admission', 'VARCHAR', '255'),
  ('admissions', 'patient_disposition', 'Patient status or destination after discharge', 'VARCHAR', '100'),
  ('admissions', 'total_charges', 'Total charges for the hospital encounter', 'DECIMAL', '12,2');
