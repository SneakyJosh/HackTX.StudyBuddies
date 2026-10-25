const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export type SignUpInput = {
  displayName: string;
  email: string;
  password: string;
  confirmPassword: string;
};

/** Client checks before signUp. Passwords are not stored or logged. */
export function signUpProblem(input: SignUpInput): string | null {
  const name = input.displayName.trim();
  const email = input.email.trim();
  if (name.length < 1 || name.length > 40) return "Enter your name using 1 to 40 characters.";
  if (!EMAIL_PATTERN.test(email)) return "Enter a valid email address.";
  if (input.password.length < 8) return "Use a password of at least 8 characters.";
  if (!/[A-Za-z]/.test(input.password) || !/[0-9]/.test(input.password)) {
    return "Use a password with at least one letter and one number.";
  }
  if (input.password !== input.confirmPassword) return "The passwords do not match.";
  return null;
}
