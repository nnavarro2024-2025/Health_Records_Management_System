USE health_records_db;

CREATE TABLE patient_vitals (
  vitals_id BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  patient_id BIGINT UNSIGNED NOT NULL,
  admission_id BIGINT UNSIGNED NULL,
  recorded_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  temperature_c DECIMAL(4,1) NULL,
  systolic_bp SMALLINT UNSIGNED NULL,
  diastolic_bp SMALLINT UNSIGNED NULL,
  pulse_bpm SMALLINT UNSIGNED NULL,
  respiratory_rate SMALLINT UNSIGNED NULL,
  spo2_percent DECIMAL(4,1) NULL,
  weight_kg DECIMAL(5,1) NULL,
  height_cm DECIMAL(5,1) NULL,
  recorded_by_user_id BIGINT UNSIGNED NULL,
  PRIMARY KEY (vitals_id),
  KEY ix_patient_vitals_patient_recorded (patient_id, recorded_at),
  KEY ix_patient_vitals_admission (admission_id),
  CONSTRAINT fk_patient_vitals_patient FOREIGN KEY (patient_id) REFERENCES patients (patient_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_patient_vitals_admission FOREIGN KEY (admission_id) REFERENCES admissions (admission_id)
    ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT fk_patient_vitals_user FOREIGN KEY (recorded_by_user_id) REFERENCES users (user_id)
    ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT chk_patient_vitals_temperature CHECK (temperature_c IS NULL OR temperature_c BETWEEN 25.0 AND 45.0),
  CONSTRAINT chk_patient_vitals_systolic CHECK (systolic_bp IS NULL OR systolic_bp BETWEEN 40 AND 300),
  CONSTRAINT chk_patient_vitals_diastolic CHECK (diastolic_bp IS NULL OR diastolic_bp BETWEEN 20 AND 200),
  CONSTRAINT chk_patient_vitals_bp_order CHECK (
    systolic_bp IS NULL OR diastolic_bp IS NULL OR systolic_bp > diastolic_bp
  ),
  CONSTRAINT chk_patient_vitals_pulse CHECK (pulse_bpm IS NULL OR pulse_bpm BETWEEN 20 AND 250),
  CONSTRAINT chk_patient_vitals_respiratory CHECK (respiratory_rate IS NULL OR respiratory_rate BETWEEN 4 AND 80),
  CONSTRAINT chk_patient_vitals_spo2 CHECK (spo2_percent IS NULL OR spo2_percent BETWEEN 0.0 AND 100.0),
  CONSTRAINT chk_patient_vitals_weight CHECK (weight_kg IS NULL OR weight_kg BETWEEN 0.1 AND 500.0),
  CONSTRAINT chk_patient_vitals_height CHECK (height_cm IS NULL OR height_cm BETWEEN 20.0 AND 250.0),
  CONSTRAINT chk_patient_vitals_measurement CHECK (
    temperature_c IS NOT NULL OR systolic_bp IS NOT NULL OR diastolic_bp IS NOT NULL
    OR pulse_bpm IS NOT NULL OR respiratory_rate IS NOT NULL OR spo2_percent IS NOT NULL
    OR weight_kg IS NOT NULL OR height_cm IS NOT NULL
  )
) ENGINE=InnoDB;
