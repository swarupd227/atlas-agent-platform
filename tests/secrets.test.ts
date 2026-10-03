import { describe, it, expect } from "vitest";
import { resolveFileBackedSecrets, FILE_BACKED_SECRET_VARS } from "../server/secrets";

// File-backed secrets (Initiative 2 P2): the `<VAR>_FILE` convention used by
// Docker secrets / Kubernetes Secret mounts / Vault-agent sidecars. Pure core
// only — the production wiring (real process.env + fs.readFileSync) is a
// side effect on import and isn't exercised here.

describe("resolveFileBackedSecrets", () => {
  it("resolves a var from its _FILE path when the direct var is unset", () => {
    const env: Record<string, string | undefined> = { JWT_SECRET_FILE: "/run/secrets/jwt" };
    const files: Record<string, string> = { "/run/secrets/jwt": "s3cr3t\n" };
    const result = resolveFileBackedSecrets(env, ["JWT_SECRET"], (p) => files[p]);

    expect(env.JWT_SECRET).toBe("s3cr3t"); // trailing newline stripped
    expect(result.applied).toEqual(["JWT_SECRET"]);
    expect(result.errors).toEqual([]);
  });

  it("leaves the direct env var untouched when both are set (direct wins)", () => {
    const env: Record<string, string | undefined> = {
      JWT_SECRET: "direct-value",
      JWT_SECRET_FILE: "/run/secrets/jwt",
    };
    const readFile = () => { throw new Error("should not be read"); };
    const result = resolveFileBackedSecrets(env, ["JWT_SECRET"], readFile);

    expect(env.JWT_SECRET).toBe("direct-value");
    expect(result.applied).toEqual([]);
  });

  it("is a no-op when neither the direct var nor the _FILE var is set", () => {
    const env: Record<string, string | undefined> = {};
    const result = resolveFileBackedSecrets(env, ["JWT_SECRET"], () => "unused");

    expect(env.JWT_SECRET).toBeUndefined();
    expect(result.applied).toEqual([]);
    expect(result.errors).toEqual([]);
  });

  it("reports a read failure without throwing, and leaves the var unset", () => {
    const env: Record<string, string | undefined> = { JWT_SECRET_FILE: "/run/secrets/missing" };
    const readFile = () => { throw new Error("ENOENT: no such file or directory"); };
    const result = resolveFileBackedSecrets(env, ["JWT_SECRET"], readFile);

    expect(env.JWT_SECRET).toBeUndefined();
    expect(result.applied).toEqual([]);
    expect(result.errors).toEqual(["JWT_SECRET_FILE=/run/secrets/missing: ENOENT: no such file or directory"]);
  });

  it("resolves multiple vars independently in one pass", () => {
    const env: Record<string, string | undefined> = {
      JWT_SECRET_FILE: "/s/jwt",
      DATABASE_URL: "postgres://already-set",
      INTEGRATION_VAULT_KEY_FILE: "/s/vault",
    };
    const files: Record<string, string> = { "/s/jwt": "jwt-val", "/s/vault": "vault-val" };
    const result = resolveFileBackedSecrets(
      env,
      ["JWT_SECRET", "DATABASE_URL", "INTEGRATION_VAULT_KEY"],
      (p) => files[p],
    );

    expect(env.JWT_SECRET).toBe("jwt-val");
    expect(env.DATABASE_URL).toBe("postgres://already-set"); // untouched, no file read attempted
    expect(env.INTEGRATION_VAULT_KEY).toBe("vault-val");
    expect(result.applied.sort()).toEqual(["INTEGRATION_VAULT_KEY", "JWT_SECRET"]);
  });

  it("strips only trailing whitespace, not interior whitespace", () => {
    const env: Record<string, string | undefined> = { JWT_SECRET_FILE: "/s/jwt" };
    const result = resolveFileBackedSecrets(env, ["JWT_SECRET"], () => "  has-inner-spaces  \n\n");

    expect(env.JWT_SECRET).toBe("  has-inner-spaces");
    expect(result.applied).toEqual(["JWT_SECRET"]);
  });

  it("covers every credential-bearing env var the server actually reads", () => {
    // Guards against the list silently going stale as new secrets are added.
    expect(FILE_BACKED_SECRET_VARS).toEqual(
      expect.arrayContaining([
        "DATABASE_URL",
        "JWT_SECRET",
        "INTEGRATION_VAULT_KEY",
        "BOOTSTRAP_ADMIN_PASSWORD",
        "ANTHROPIC_API_KEY",
        "OPENAI_API_KEY",
        "GITHUB_TOKEN",
      ]),
    );
  });
});
