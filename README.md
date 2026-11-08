# Alaga — Health Records Management System

Alaga supports health record management, admissions, discharges, and privacy
workflows at Alaga Philippine Medical Center. This repository contains the
React + TypeScript frontend and the Node.js + Express + MySQL API.

## Backend API setup (Windows / XAMPP)

The backend is plain JavaScript, Express, and MySQL via `mysql2`.
Passwords use `bcryptjs`, which generates and verifies standard bcrypt hashes
without requiring a native Node build toolchain on Windows.
The Vite frontend runs separately and proxies `/api` requests to this backend.

### One-time setup

1. Install Node.js 18 or newer (which includes npm).
2. Start **Apache** (optional for API use) and **MySQL** in the XAMPP Control
   Panel.
3. Open phpMyAdmin
4. For a new database, import `database/schema.sql`, then
   `database/seed.sql`
6. Open PowerShell in the repository and run:

   ```powershell
   cd backend
   npm install
   ```

   `backend/.env` contains the local XAMPP defaults. If it is missing, copy the
   example and update `JWT_SECRET` with a private random secret of at least 32
   characters:

   ```powershell
   Copy-Item .env.example .env
   ```

