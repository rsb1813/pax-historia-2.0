// CLI 탈출구: 비밀번호를 잊었을 때(이메일 발송 인프라가 없으므로) 서버 없이
// server/data/users.json을 직접 갱신해 비밀번호를 재설정한다.
// Usage: node scripts/reset-password.mjs <email> <newPassword>
import { findUserByEmail, setPassword } from "../server/auth/users.js";

const [email, newPassword] = process.argv.slice(2);

if (!email || !newPassword) {
  console.error("Usage: node scripts/reset-password.mjs <email> <newPassword>");
  process.exit(1);
}

const user = findUserByEmail(email);
if (!user) {
  console.error(`No user found with email: ${email}`);
  process.exit(1);
}

try {
  setPassword(user.id, newPassword);
} catch (error) {
  console.error(`Failed to reset password: ${error.message}`);
  process.exit(1);
}

console.log(`Password reset for ${user.email} (id: ${user.id}).`);
