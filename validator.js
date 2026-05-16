// ═══════════════════════════════════════
//  MAFIA NOIR V2 — Input Validator
// ═══════════════════════════════════════

function validateName(name) {
  if (!name || typeof name !== 'string') return 'الاسم مطلوب';
  const trimmed = name.trim();
  if (trimmed.length < 2)  return 'الاسم قصير جداً (2 أحرف على الأقل)';
  if (trimmed.length > 20) return 'الاسم طويل جداً (20 حرف كحد أقصى)';
  if (/<|>|script/i.test(trimmed)) return 'الاسم يحتوي على رموز غير مسموحة';
  return null;
}

function validateCode(code) {
  if (!code || typeof code !== 'string') return 'كود الغرفة مطلوب';
  if (!/^[A-Z0-9]{4}$/i.test(code.trim())) return 'كود الغرفة يجب أن يكون 4 أحرف';
  return null;
}

function validateMessage(text) {
  if (!text || typeof text !== 'string') return 'الرسالة فارغة';
  const trimmed = text.trim();
  if (trimmed.length === 0)   return 'الرسالة فارغة';
  if (trimmed.length > 200)   return 'الرسالة طويلة جداً';
  return null;
}

function validatePassword(pw) {
  if (!pw || typeof pw !== 'string') return 'كلمة المرور مطلوبة';
  if (pw.length < 6)  return 'كلمة المرور قصيرة جداً (6 أحرف على الأقل)';
  if (pw.length > 64) return 'كلمة المرور طويلة جداً';
  return null;
}

function sanitize(str, maxLen = 200) {
  if (typeof str !== 'string') return '';
  return str.trim().substring(0, maxLen)
    .replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

module.exports = { validateName, validateCode, validateMessage, validatePassword, sanitize };
