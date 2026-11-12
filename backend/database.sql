-- ============================================================================
-- AI StudyLab - MySQL Database Schema
-- ============================================================================

CREATE DATABASE IF NOT EXISTS ai_studylab
  CHARACTER SET utf8mb4
  COLLATE utf8mb4_unicode_ci;

USE ai_studylab;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS users (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,

  name VARCHAR(120) NOT NULL,
  email VARCHAR(190) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  major VARCHAR(120) DEFAULT 'General Studies',
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_email (email)
) ENGINE=InnoDB;

-- 2. Documents Table
CREATE TABLE IF NOT EXISTS documents (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  original_filename VARCHAR(255) NOT NULL,
  stored_filename VARCHAR(255) NOT NULL UNIQUE,
  file_path VARCHAR(500) NOT NULL,
  mime_type VARCHAR(100) NOT NULL,
  format VARCHAR(16) NOT NULL DEFAULT 'PDF',
  subject VARCHAR(120) NOT NULL DEFAULT 'General',
  file_size BIGINT UNSIGNED NOT NULL,
  page_count INT UNSIGNED NOT NULL DEFAULT 0,
  extracted_text LONGTEXT,
  extraction_status ENUM('pending', 'ready', 'failed', 'ocr_required') NOT NULL DEFAULT 'pending',
  extraction_error TEXT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_documents_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_documents_user (user_id),
  INDEX idx_documents_subject (user_id, subject),
  INDEX idx_documents_created (created_at)
) ENGINE=InnoDB;

-- 3. Summaries Table
CREATE TABLE IF NOT EXISTS summaries (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  document_id INT UNSIGNED NOT NULL UNIQUE,
  user_id INT UNSIGNED NOT NULL,
  executive_summary TEXT NOT NULL,
  key_takeaways JSON NOT NULL,
  important_topics JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_summaries_document
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  CONSTRAINT fk_summaries_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_summaries_user_doc (user_id, document_id)
) ENGINE=InnoDB;

-- 4. Short Notes Table
CREATE TABLE IF NOT EXISTS notes (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  document_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  topic VARCHAR(255) NOT NULL,
  content TEXT NOT NULL,
  sort_order INT UNSIGNED NOT NULL DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_notes_document
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  CONSTRAINT fk_notes_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notes_doc (document_id),
  INDEX idx_notes_user (user_id)
) ENGINE=InnoDB;

-- 5. Important Questions Table (2-mark, 5-mark, 10-mark)
CREATE TABLE IF NOT EXISTS questions (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  document_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  marks TINYINT UNSIGNED NOT NULL DEFAULT 5,
  question_text TEXT NOT NULL,
  answer_text TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_questions_document
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  CONSTRAINT fk_questions_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_questions_doc_marks (document_id, marks),
  INDEX idx_questions_user (user_id)
) ENGINE=InnoDB;

-- 6. MCQs Table
CREATE TABLE IF NOT EXISTS mcqs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  document_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  question_text TEXT NOT NULL,
  options_json JSON NOT NULL,
  correct_index TINYINT UNSIGNED NOT NULL,
  explanation TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_mcqs_document
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  CONSTRAINT fk_mcqs_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_mcqs_doc (document_id),
  INDEX idx_mcqs_user (user_id)
) ENGINE=InnoDB;

-- 7. Chat History Table
CREATE TABLE IF NOT EXISTS chat_history (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  document_id INT UNSIGNED NOT NULL,
  user_id INT UNSIGNED NOT NULL,
  role ENUM('user', 'assistant') NOT NULL,
  message TEXT NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_chat_document
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  CONSTRAINT fk_chat_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_chat_doc_user_time (document_id, user_id, created_at)
) ENGINE=InnoDB;

-- 8. Quiz Results Table
CREATE TABLE IF NOT EXISTS quiz_results (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id INT UNSIGNED NOT NULL,
  document_id INT UNSIGNED NULL,
  total_questions INT UNSIGNED NOT NULL,
  correct_answers INT UNSIGNED NOT NULL,
  score_percentage DECIMAL(5, 2) NOT NULL,
  time_taken_seconds INT UNSIGNED NOT NULL DEFAULT 0,
  answers_json JSON NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT fk_quiz_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT fk_quiz_document
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE SET NULL,
  INDEX idx_quiz_user_time (user_id, created_at)
) ENGINE=InnoDB;

-- 9. Exam Preparation Packs Table (Definitions & Structured Exam Metadata)
CREATE TABLE IF NOT EXISTS exam_prep_packs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  document_id INT UNSIGNED NOT NULL UNIQUE,
  user_id INT UNSIGNED NOT NULL,
  topics_json JSON NOT NULL,
  definitions_json JSON NOT NULL,
  notes_meta_json JSON NOT NULL,
  questions_meta_json JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_examprep_document
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  CONSTRAINT fk_examprep_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_examprep_user_doc (user_id, document_id)
) ENGINE=InnoDB;

-- 9. Exam Preparation Packs Table (Definitions & Structured Exam Metadata)
CREATE TABLE IF NOT EXISTS exam_prep_packs (
  id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  document_id INT UNSIGNED NOT NULL UNIQUE,
  user_id INT UNSIGNED NOT NULL,
  topics_json JSON NOT NULL,
  definitions_json JSON NOT NULL,
  notes_meta_json JSON NOT NULL,
  questions_meta_json JSON NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  CONSTRAINT fk_examprep_document
    FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE,
  CONSTRAINT fk_examprep_user
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_examprep_user_doc (user_id, document_id)
) ENGINE=InnoDB;

