/**
 * Mints a JWT for local testing — this starter kit ships with no signup/
 * login UI, so use this instead. The token is accepted by
 * middleware/authMiddleware.js exactly like a real user session token.
 *
 * Usage: npm run mint-token
 */

import jwt from 'jsonwebtoken';
import dotenv from 'dotenv';

dotenv.config();

if (!process.env.JWT_SECRET) {
  console.error('JWT_SECRET is not set — copy .env.example to .env and fill it in first.');
  process.exit(1);
}

const token = jwt.sign(
  { userId: 'local-dev-user', role: 'admin' },
  process.env.JWT_SECRET,
  { expiresIn: '30d' }
);

console.log('\nDev token (valid 30 days):\n');
console.log(token);
console.log('\ncurl example:\n');
console.log(`curl -X POST http://localhost:${process.env.PORT || 3000}/api/defect-matching/match \\`);
console.log(`  -H "Authorization: Bearer ${token}" \\`);
console.log(`  -H "Content-Type: application/json" \\`);
console.log(`  -d '{"description":"Flash attempt on the gateway ECU failed after transfer; checksum verification did not match the expected value."}'`);
console.log('\nOr paste it into the "Dev token" box on the frontend page (frontend/index.html).\n');
