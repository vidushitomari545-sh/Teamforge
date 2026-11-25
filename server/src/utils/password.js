import bcrypt from 'bcryptjs';

const SALT_ROUNDS = 12;

/**
 * A precomputed bcrypt hash of a random string used exclusively to perform
 * a dummy password comparison when the submitted email does not match any
 * account. This keeps the response time consistent regardless of whether the
 * user exists, preventing timing-based user enumeration attacks.
 *
 * Generated once: bcrypt.hashSync('__dummy__', 12)
 */
export const DUMMY_HASH = '$2b$12$XoJ6BxCOSE4/svCnRyl17OdrdCqURGYqFGUjvneXe/zZ106X.vokq';

/**
 * Hashes a plaintext password using bcryptjs.
 * @param {string} password - Plaintext password
 * @returns {Promise<string>} Salted and hashed password string
 */
export const hashPassword = async (password) => {
  return bcrypt.hash(password, SALT_ROUNDS);
};

/**
 * Verifies a candidate plaintext password against a stored bcrypt hash.
 * @param {string} candidatePassword - Plaintext candidate password
 * @param {string} storedHash - Stored bcrypt hash
 * @returns {Promise<boolean>} True if matching, false otherwise
 */
export const comparePassword = async (candidatePassword, storedHash) => {
  return bcrypt.compare(candidatePassword, storedHash);
};
