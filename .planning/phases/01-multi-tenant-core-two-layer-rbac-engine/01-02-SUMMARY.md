# Summary 01-02: Authentication System

**Phase:** 01 — Multi-Tenant Core & Two-Layer RBAC Engine  
**Status:** Completed  
**Completed Date:** 2026-10-26  

## Deliverables & Key Changes
1. **AuthModule Core**: Built `AuthModule`, `AuthController`, and `AuthService`:
   - `POST /api/v1/auth/register-company`: Transactional registration of Company, default Shift, default LeaveTypeSettings, Admin User, and Employee profile.
   - `POST /api/v1/auth/login`: Issues 15-minute access token and 7-day refresh token in `httpOnly`, `sameSite: 'lax'`, `secure` cookies.
   - `POST /api/v1/auth/refresh`: Rotating refresh token validation with replay attack detection and invalidation.
   - `POST /api/v1/auth/logout`: Clears session cookies and invalidates refresh token hash in PostgreSQL.
2. **Security & Protection**:
   - `bcrypt` password hashing with configurable salt rounds (default 12).
   - Rate limiting via `@nestjs/throttler` (5 req/min on auth endpoints).
   - Account lockout: 5 consecutive failed login attempts trigger 15-minute lockout (`lockedUntil`).
   - Coarse geolocation and IP metadata logging (`lastLoginIp`, `lastLoginCity`, `lastLoginCountry`, `lastLoginUserAgent`).
   - Email verification flow (`verifyEmail`) and password reset flow (`forgotPassword`, `resetPassword`).
3. **TOTP 2FA**:
   - `otplib` authenticator integration: secret generation, QR code data URL generation.
   - Verification challenge with 8 single-use hashed backup codes.
4. **Unit & Integration Tests**:
   - Comprehensive test suite in `apps/backend/src/modules/auth/auth.service.spec.ts` covering conflict handling, login lockout, 2FA challenge gating, and session invalidation.

## Verification
- `npm run test --workspace=apps/backend -- auth.service.spec.ts` -> 7/7 tests passed.
