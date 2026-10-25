import assert from "node:assert/strict";
import test from "node:test";

import { signUpProblem } from "../lib/account-form.ts";
import { needsProfileSetup } from "../lib/profile-setup.ts";

test("sign up requires a name, email, and matching password", () => {
  assert.match(signUpProblem({ displayName: " ", email: "a@b.com", password: "letters1", confirmPassword: "letters1" }) ?? "", /name/);
  assert.match(signUpProblem({ displayName: "Avery Chen", email: "not-an-email", password: "letters1", confirmPassword: "letters1" }) ?? "", /email/);
  assert.match(signUpProblem({ displayName: "Avery Chen", email: "avery@example.com", password: "short1", confirmPassword: "short1" }) ?? "", /8/);
  assert.match(signUpProblem({ displayName: "Avery Chen", email: "avery@example.com", password: "longpassword", confirmPassword: "longpassword" }) ?? "", /number/);
  assert.match(signUpProblem({ displayName: "Avery Chen", email: "avery@example.com", password: "letters1", confirmPassword: "letters2" }) ?? "", /match/);
  assert.equal(
    signUpProblem({ displayName: "Avery Chen", email: "avery@example.com", password: "letters1", confirmPassword: "letters1" }),
    null,
  );
});

test("a student without a profile stays on setup", () => {
  assert.equal(needsProfileSetup(false, "/home", ""), true);
  assert.equal(needsProfileSetup(false, "/profile", ""), true);
  assert.equal(needsProfileSetup(false, "/profile", "?setup=1"), false);
  assert.equal(needsProfileSetup(true, "/home", ""), false);
});
