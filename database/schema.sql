CREATE DATABASE IF NOT EXISTS health_records_db
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE health_records_db;

CREATE TABLE roles (
  role_id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  role_name VARCHAR(50) NOT NULL,
  description VARCHAR(255) NULL,
  PRIMARY KEY (role_id),
  UNIQUE KEY uq_roles_role_name (role_name)
) ENGINE=InnoDB;

CREATE TABLE staff (
  staff_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  first_name VARCHAR(80) NOT NULL,
  middle_name VARCHAR(80) NULL,
  last_name VARCHAR(80) NOT NULL,
  credentials VARCHAR(80) NULL,
  staff_type ENUM('administrator', 'records_officer', 'physician', 'nurse', 'other') NOT NULL,
  license_number VARCHAR(80) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (staff_id),
  UNIQUE KEY uq_staff_license_number (license_number),
  CONSTRAINT chk_staff_name CHECK (CHAR_LENGTH(TRIM(first_name)) > 0 AND CHAR_LENGTH(TRIM(last_name)) > 0)
) ENGINE=InnoDB;

CREATE TABLE users (
  user_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  staff_id BIGINT UNSIGNED NULL,
  role_id SMALLINT UNSIGNED NOT NULL,
  email VARCHAR(254) NOT NULL,
  password_hash VARCHAR(255) NOT NULL,
  account_status ENUM('active', 'inactive', 'locked') NOT NULL DEFAULT 'active',
  last_login_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  UNIQUE KEY uq_users_email (email),
  UNIQUE KEY uq_users_staff_id (staff_id),
  CONSTRAINT fk_users_staff FOREIGN KEY (staff_id) REFERENCES staff (staff_id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT fk_users_role FOREIGN KEY (role_id) REFERENCES roles (role_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_users_email CHECK (email LIKE '%_@_%._%'),
  CONSTRAINT chk_users_password_hash CHECK (CHAR_LENGTH(password_hash) >= 60)
) ENGINE=InnoDB;

CREATE TABLE patients (
  patient_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  hospital_id VARCHAR(20) NOT NULL,
  personal_id VARCHAR(40) NULL,
  first_name VARCHAR(80) NOT NULL,
  middle_name VARCHAR(80) NULL,
  last_name VARCHAR(80) NOT NULL,
  date_of_birth DATE NOT NULL,
  sex ENUM('female', 'male', 'other', 'unknown') NOT NULL,
  race_ethnicity VARCHAR(80) NOT NULL DEFAULT 'Not stated',
  mobile_number VARCHAR(30) NULL,
  record_status ENUM('active', 'inactive', 'merged', 'deceased') NOT NULL DEFAULT 'active',
  created_by_user_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (patient_id),
  UNIQUE KEY uq_patients_hospital_id (hospital_id),
  UNIQUE KEY uq_patients_personal_id (personal_id),
  CONSTRAINT fk_patients_created_by FOREIGN KEY (created_by_user_id) REFERENCES users (user_id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT chk_patients_name CHECK (CHAR_LENGTH(TRIM(first_name)) > 0 AND CHAR_LENGTH(TRIM(last_name)) > 0)
) ENGINE=InnoDB;

CREATE TABLE patient_addresses (
  address_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  patient_id BIGINT UNSIGNED NOT NULL,
  street_barangay VARCHAR(180) NOT NULL,
  city_municipality VARCHAR(100) NOT NULL,
  province VARCHAR(100) NOT NULL,
  zip_code VARCHAR(12) NULL,
  valid_from DATE NOT NULL,
  valid_to DATE NULL,
  PRIMARY KEY (address_id),
  UNIQUE KEY uq_patient_addresses_address_patient (address_id, patient_id),
  KEY ix_patient_addresses_patient (patient_id),
  CONSTRAINT fk_patient_addresses_patient FOREIGN KEY (patient_id) REFERENCES patients (patient_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_patient_addresses_dates CHECK (valid_to IS NULL OR valid_to >= valid_from)
) ENGINE=InnoDB;

CREATE TABLE patient_emergency_contacts (
  emergency_contact_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  patient_id BIGINT UNSIGNED NOT NULL,
  contact_name VARCHAR(160) NOT NULL,
  contact_number VARCHAR(30) NOT NULL,
  relationship_to_patient VARCHAR(60) NULL,
  PRIMARY KEY (emergency_contact_id),
  KEY ix_emergency_contacts_patient (patient_id),
  CONSTRAINT fk_emergency_contacts_patient FOREIGN KEY (patient_id) REFERENCES patients (patient_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT chk_emergency_contact_name CHECK (CHAR_LENGTH(TRIM(contact_name)) > 0)
) ENGINE=InnoDB;

CREATE TABLE diagnoses (
  diagnosis_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  coding_system VARCHAR(30) NOT NULL DEFAULT 'ICD-10',
  diagnosis_code VARCHAR(20) NOT NULL,
  diagnosis_name VARCHAR(255) NOT NULL,
  PRIMARY KEY (diagnosis_id),
  UNIQUE KEY uq_diagnoses_system_code (coding_system, diagnosis_code)
) ENGINE=InnoDB;

CREATE TABLE procedures (
  procedure_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  coding_system VARCHAR(30) NOT NULL DEFAULT 'LOCAL',
  procedure_code VARCHAR(30) NOT NULL,
  procedure_name VARCHAR(255) NOT NULL,
  PRIMARY KEY (procedure_id),
  UNIQUE KEY uq_procedures_system_code (coding_system, procedure_code)
) ENGINE=InnoDB;

CREATE TABLE payment_sources (
  payment_source_id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  source_name VARCHAR(80) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (payment_source_id),
  UNIQUE KEY uq_payment_sources_name (source_name)
) ENGINE=InnoDB;

CREATE TABLE dispositions (
  disposition_id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  disposition_name VARCHAR(100) NOT NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (disposition_id),
  UNIQUE KEY uq_dispositions_name (disposition_name)
) ENGINE=InnoDB;

CREATE TABLE admissions (
  admission_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  encounter_number VARCHAR(30) NOT NULL,
  patient_id BIGINT UNSIGNED NOT NULL,
  residence_address_id BIGINT UNSIGNED NOT NULL,
  encounter_type ENUM('inpatient', 'outpatient', 'emergency') NOT NULL,
  admission_type ENUM('scheduled', 'unscheduled_emergency') NOT NULL,
  admission_datetime DATETIME NOT NULL,
  discharge_datetime DATETIME NULL,
  attending_staff_id BIGINT UNSIGNED NOT NULL,
  payment_source_id SMALLINT UNSIGNED NOT NULL,
  principal_diagnosis_id BIGINT UNSIGNED NOT NULL,
  disposition_id SMALLINT UNSIGNED NULL,
  room VARCHAR(60) NULL,
  total_charges DECIMAL(12,2) NULL,
  status ENUM('in_progress', 'discharged', 'cancelled') NOT NULL DEFAULT 'in_progress',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (admission_id),
  UNIQUE KEY uq_admissions_encounter_number (encounter_number),
  KEY ix_admissions_patient_datetime (patient_id, admission_datetime),
  KEY ix_admissions_attending_staff (attending_staff_id),
  CONSTRAINT fk_admissions_patient FOREIGN KEY (patient_id) REFERENCES patients (patient_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_admissions_residence FOREIGN KEY (residence_address_id, patient_id)
    REFERENCES patient_addresses (address_id, patient_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_admissions_attending FOREIGN KEY (attending_staff_id) REFERENCES staff (staff_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_admissions_payment_source FOREIGN KEY (payment_source_id) REFERENCES payment_sources (payment_source_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_admissions_principal_diagnosis FOREIGN KEY (principal_diagnosis_id) REFERENCES diagnoses (diagnosis_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_admissions_disposition FOREIGN KEY (disposition_id) REFERENCES dispositions (disposition_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_admissions_dates CHECK (discharge_datetime IS NULL OR discharge_datetime >= admission_datetime),
  CONSTRAINT chk_admissions_charges CHECK (total_charges IS NULL OR total_charges >= 0),
  CONSTRAINT chk_admissions_discharge_details CHECK (
    (status = 'discharged' AND discharge_datetime IS NOT NULL AND total_charges IS NOT NULL)
    OR
    (status <> 'discharged' AND discharge_datetime IS NULL AND total_charges IS NULL)
  )
) ENGINE=InnoDB;

DELIMITER $$
CREATE TRIGGER trg_admissions_disposition_insert
BEFORE INSERT ON admissions
FOR EACH ROW
BEGIN
  IF (NEW.status = 'discharged' AND NEW.disposition_id IS NULL)
    OR (NEW.status <> 'discharged' AND NEW.disposition_id IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Discharged encounters require a disposition; other encounters must not have one';
  END IF;
END$$

CREATE TRIGGER trg_admissions_disposition_update
BEFORE UPDATE ON admissions
FOR EACH ROW
BEGIN
  IF (NEW.status = 'discharged' AND NEW.disposition_id IS NULL)
    OR (NEW.status <> 'discharged' AND NEW.disposition_id IS NOT NULL) THEN
    SIGNAL SQLSTATE '45000'
      SET MESSAGE_TEXT = 'Discharged encounters require a disposition; other encounters must not have one';
  END IF;
END$$
DELIMITER ;

CREATE TABLE admission_diagnoses (
  admission_id BIGINT UNSIGNED NOT NULL,
  diagnosis_id BIGINT UNSIGNED NOT NULL,
  sequence_number SMALLINT UNSIGNED NOT NULL,
  PRIMARY KEY (admission_id, diagnosis_id),
  UNIQUE KEY uq_admission_diagnoses_sequence (admission_id, sequence_number),
  CONSTRAINT fk_admission_diagnoses_admission FOREIGN KEY (admission_id) REFERENCES admissions (admission_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_admission_diagnoses_diagnosis FOREIGN KEY (diagnosis_id) REFERENCES diagnoses (diagnosis_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_admission_diagnoses_sequence CHECK (sequence_number > 0)
) ENGINE=InnoDB;

CREATE TABLE admission_procedures (
  admission_id BIGINT UNSIGNED NOT NULL,
  procedure_id BIGINT UNSIGNED NOT NULL,
  performed_at DATETIME NULL,
  notes VARCHAR(500) NULL,
  PRIMARY KEY (admission_id, procedure_id),
  CONSTRAINT fk_admission_procedures_admission FOREIGN KEY (admission_id) REFERENCES admissions (admission_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_admission_procedures_procedure FOREIGN KEY (procedure_id) REFERENCES procedures (procedure_id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE patient_problems (
  patient_problem_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  patient_id BIGINT UNSIGNED NOT NULL,
  diagnosis_id BIGINT UNSIGNED NOT NULL,
  recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at DATETIME NULL,
  notes VARCHAR(500) NULL,
  recorded_by_user_id BIGINT UNSIGNED NULL,
  PRIMARY KEY (patient_problem_id),
  KEY ix_patient_problems_patient (patient_id),
  CONSTRAINT fk_patient_problems_patient FOREIGN KEY (patient_id) REFERENCES patients (patient_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_patient_problems_diagnosis FOREIGN KEY (diagnosis_id) REFERENCES diagnoses (diagnosis_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_patient_problems_user FOREIGN KEY (recorded_by_user_id) REFERENCES users (user_id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT chk_patient_problems_dates CHECK (resolved_at IS NULL OR resolved_at >= recorded_at)
) ENGINE=InnoDB;

CREATE TABLE patient_allergies (
  allergy_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  patient_id BIGINT UNSIGNED NOT NULL,
  allergen VARCHAR(160) NOT NULL,
  reaction VARCHAR(255) NULL,
  severity ENUM('unknown', 'mild', 'moderate', 'severe') NOT NULL DEFAULT 'unknown',
  allergy_status ENUM('active', 'resolved', 'entered_in_error') NOT NULL DEFAULT 'active',
  recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  recorded_by_user_id BIGINT UNSIGNED NULL,
  PRIMARY KEY (allergy_id),
  KEY ix_patient_allergies_patient (patient_id),
  CONSTRAINT fk_patient_allergies_patient FOREIGN KEY (patient_id) REFERENCES patients (patient_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_patient_allergies_user FOREIGN KEY (recorded_by_user_id) REFERENCES users (user_id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT chk_patient_allergies_allergen CHECK (CHAR_LENGTH(TRIM(allergen)) > 0)
) ENGINE=InnoDB;

CREATE TABLE patient_medications (
  patient_medication_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  patient_id BIGINT UNSIGNED NOT NULL,
  medication_name VARCHAR(180) NOT NULL,
  strength VARCHAR(80) NULL,
  dose VARCHAR(80) NOT NULL,
  route VARCHAR(40) NOT NULL,
  frequency VARCHAR(100) NOT NULL,
  medication_status ENUM('active', 'stopped', 'completed') NOT NULL DEFAULT 'active',
  start_date DATE NULL,
  end_date DATE NULL,
  notes VARCHAR(500) NULL,
  recorded_by_user_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (patient_medication_id),
  KEY ix_patient_medications_patient_status (patient_id, medication_status),
  CONSTRAINT fk_patient_medications_patient FOREIGN KEY (patient_id) REFERENCES patients (patient_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_patient_medications_user FOREIGN KEY (recorded_by_user_id) REFERENCES users (user_id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT chk_patient_medications_dates CHECK (end_date IS NULL OR start_date IS NULL OR end_date >= start_date),
  CONSTRAINT chk_patient_medications_name CHECK (CHAR_LENGTH(TRIM(medication_name)) > 0)
) ENGINE=InnoDB;

CREATE TABLE admission_medications (
  admission_id BIGINT UNSIGNED NOT NULL,
  patient_medication_id BIGINT UNSIGNED NOT NULL,
  medication_phase ENUM('admission', 'discharge') NOT NULL,
  reconciliation_notes VARCHAR(500) NULL,
  PRIMARY KEY (admission_id, patient_medication_id, medication_phase),
  CONSTRAINT fk_admission_medications_admission FOREIGN KEY (admission_id) REFERENCES admissions (admission_id)
    ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT fk_admission_medications_medication FOREIGN KEY (patient_medication_id) REFERENCES patient_medications (patient_medication_id)
    ON DELETE RESTRICT ON UPDATE CASCADE
) ENGINE=InnoDB;

CREATE TABLE audit_logs (
  audit_log_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  actor_user_id BIGINT UNSIGNED NULL,
  actor_role_id SMALLINT UNSIGNED NULL,
  patient_id BIGINT UNSIGNED NULL,
  action_code VARCHAR(64) NOT NULL,
  description VARCHAR(500) NOT NULL,
  occurred_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (audit_log_id),
  KEY ix_audit_logs_occurred_at (occurred_at),
  KEY ix_audit_logs_patient_time (patient_id, occurred_at),
  CONSTRAINT fk_audit_logs_user FOREIGN KEY (actor_user_id) REFERENCES users (user_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_audit_logs_role FOREIGN KEY (actor_role_id) REFERENCES roles (role_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_audit_logs_patient FOREIGN KEY (patient_id) REFERENCES patients (patient_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_audit_logs_action CHECK (CHAR_LENGTH(TRIM(action_code)) > 0)
) ENGINE=InnoDB;

CREATE TABLE retention_categories (
  retention_category_id SMALLINT UNSIGNED NOT NULL AUTO_INCREMENT,
  category_name VARCHAR(100) NOT NULL,
  retention_years SMALLINT UNSIGNED NOT NULL,
  description VARCHAR(255) NULL,
  is_active BOOLEAN NOT NULL DEFAULT TRUE,
  PRIMARY KEY (retention_category_id),
  UNIQUE KEY uq_retention_categories_name (category_name),
  CONSTRAINT chk_retention_categories_years CHECK (retention_years > 0)
) ENGINE=InnoDB;

CREATE TABLE retention_records (
  retention_record_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  admission_id BIGINT UNSIGNED NOT NULL,
  retention_category_id SMALLINT UNSIGNED NOT NULL,
  review_due_date DATE NOT NULL,
  review_status ENUM('pending_review', 'approved_for_disposal', 'retain', 'disposed') NOT NULL DEFAULT 'pending_review',
  reviewed_by_user_id BIGINT UNSIGNED NULL,
  reviewed_at DATETIME NULL,
  review_notes VARCHAR(500) NULL,
  PRIMARY KEY (retention_record_id),
  UNIQUE KEY uq_retention_records_admission (admission_id),
  KEY ix_retention_records_due_status (review_due_date, review_status),
  CONSTRAINT fk_retention_records_admission FOREIGN KEY (admission_id) REFERENCES admissions (admission_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_retention_records_category FOREIGN KEY (retention_category_id) REFERENCES retention_categories (retention_category_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_retention_records_reviewer FOREIGN KEY (reviewed_by_user_id) REFERENCES users (user_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT chk_retention_reviewed CHECK (
    (review_status = 'pending_review' AND reviewed_at IS NULL)
    OR
    (review_status <> 'pending_review' AND reviewed_at IS NOT NULL)
  )
) ENGINE=InnoDB;

CREATE TABLE data_dictionary (
  data_dictionary_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  table_name VARCHAR(64) NOT NULL,
  column_name VARCHAR(64) NOT NULL,
  description VARCHAR(500) NOT NULL,
  data_type VARCHAR(40) NOT NULL,
  field_length VARCHAR(20) NULL,
  PRIMARY KEY (data_dictionary_id),
  UNIQUE KEY uq_data_dictionary_table_column (table_name, column_name)
) ENGINE=InnoDB;
