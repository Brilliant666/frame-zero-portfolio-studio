import assert from "node:assert/strict";
import { randomBytes, randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import net from "node:net";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import test from "node:test";
import ts from "typescript";

const repositoryRoot = fileURLToPath(new URL("..", import.meta.url));
const pocRoot = path.join(repositoryRoot, "research", "better-auth-cloudflare-poc");
const pocAppRoot = path.join(pocRoot, "vinext-app");
const wranglerConfig = path.join(pocAppRoot, "wrangler.jsonc");
const wranglerCli = path.join(repositoryRoot, "node_modules", "wrangler", "bin", "wrangler.js");
const vinextCli = path.join(repositoryRoot, "node_modules", "vinext", "dist", "cli.js");
const generatedArtifactDirectories = [
  path.join(pocAppRoot, ".next"),
  path.join(pocAppRoot, ".vinext"),
  path.join(pocAppRoot, ".wrangler"),
  path.join(pocAppRoot, "dist"),
];

function generatedCredential(prefix) {
  return `${prefix}-${randomBytes(24).toString("base64url")}`;
}

function redact(text, secrets) {
  return secrets.reduce(
    (output, secret) => output.split(secret).join("[REDACTED]"),
    String(text),
  );
}

async function runCommand(command, args, options = {}) {
  const secrets = options.secrets ?? [];
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: options.cwd ?? repositoryRoot,
      env: options.env ?? process.env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    child.stdout.setEncoding("utf8");
    child.stderr.setEncoding("utf8");
    child.stdout.on("data", (chunk) => {
      if (stdout.length < 1_000_000) stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      if (stderr.length < 1_000_000) stderr += chunk;
    });
    child.once("error", reject);
    child.once("exit", (code, signal) => {
      const result = {
        code,
        signal,
        stderr: redact(stderr, secrets),
        stdout: redact(stdout, secrets),
      };
      if (code === 0) resolve(result);
      else {
        reject(
          new Error(
            `Command failed (${code ?? signal}): ${path.basename(command)} ${args[0] ?? ""}\n` +
              `${result.stdout.slice(-4_000)}\n${result.stderr.slice(-4_000)}`,
          ),
        );
      }
    });
  });
}

async function getFreeLoopbackPort() {
  const server = net.createServer();
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const port = address.port;
  await new Promise((resolve, reject) => server.close((error) => (
    error ? reject(error) : resolve()
  )));
  return port;
}

async function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return true;
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(false), timeoutMs);
    child.once("exit", () => {
      clearTimeout(timeout);
      resolve(true);
    });
  });
}

async function stopOwnedProcess(child) {
  if (!child || child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  if (await waitForExit(child, 5_000)) return;

  if (process.platform === "win32") {
    await runCommand("taskkill.exe", ["/PID", String(child.pid), "/T", "/F"])
      .catch(() => undefined);
  } else {
    child.kill("SIGKILL");
  }
  assert.equal(await waitForExit(child, 5_000), true, "POC child must stop");
}

async function startPocServer(input) {
  const env = {
    ...process.env,
    AUTH_POC_BASE_URL: input.baseURL,
    AUTH_POC_HARNESS_TOKEN: input.harnessToken,
    AUTH_POC_PERSIST_PATH: input.persistPath,
    AUTH_POC_SECRET: input.secret,
    CI: "1",
    MINIFLARE_REGISTRY_PATH: input.registryPath,
    WRANGLER_LOG_PATH: input.logPath,
    WRANGLER_WRITE_LOGS: "false",
  };
  const child = spawn(
    process.execPath,
    [vinextCli, "dev", "--hostname", "127.0.0.1", "--port", String(input.port)],
    {
      cwd: pocAppRoot,
      env,
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  let logs = "";
  const append = (chunk) => {
    if (logs.length < 100_000) logs += chunk;
  };
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", append);
  child.stderr.on("data", append);

  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) {
      throw new Error(`POC server exited before ready: ${redact(logs, input.secrets)}`);
    }
    try {
      const response = await fetch(`${input.baseURL}/`, {
        signal: AbortSignal.timeout(1_000),
      });
      if (response.ok) return { child, logs: () => redact(logs, input.secrets) };
    } catch {
      // Server is still starting.
    }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  await stopOwnedProcess(child);
  throw new Error(`POC server did not become ready: ${redact(logs, input.secrets)}`);
}

function wranglerArguments(statePath, commandArgs) {
  return [
    wranglerCli,
    "d1",
    ...commandArgs,
    "--local",
    "--persist-to",
    statePath,
    "--config",
    wranglerConfig,
  ];
}

async function executeD1(statePath, sql) {
  const result = await runCommand(
    process.execPath,
    wranglerArguments(statePath, [
      "execute",
      "AUTH_POC_DB",
      "--command",
      sql,
      "--json",
    ]),
    { env: { ...process.env, CI: "1", WRANGLER_WRITE_LOGS: "false" } },
  );
  const parsed = JSON.parse(result.stdout);
  assert.ok(Array.isArray(parsed) && parsed.length >= 1, "D1 JSON result expected");
  assert.equal(parsed.every((entry) => entry.success === true), true);
  return parsed.flatMap((entry) => entry.results ?? []);
}

async function applyMigrations(statePath) {
  return runCommand(
    process.execPath,
    wranglerArguments(statePath, ["migrations", "apply", "AUTH_POC_DB"]),
    { env: { ...process.env, CI: "1", WRANGLER_WRITE_LOGS: "false" } },
  );
}

async function requestJson(baseURL, pathname, options = {}) {
  const headers = new Headers(options.headers);
  if (options.body !== undefined) headers.set("content-type", "application/json");
  if (options.cookie) headers.set("cookie", options.cookie);
  if (options.origin !== null) headers.set("origin", options.origin ?? baseURL);
  if (options.fetchSite) headers.set("sec-fetch-site", options.fetchSite);
  const response = await fetch(`${baseURL}${pathname}`, {
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
    headers,
    method: options.method ?? (options.body === undefined ? "GET" : "POST"),
    redirect: "manual",
  });
  const text = await response.text();
  let body = null;
  if (text) {
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
  }
  return { body, response };
}

function cookiePair(response) {
  const setCookie = response.headers.get("set-cookie") ?? "";
  assert.ok(setCookie.includes("="), "Set-Cookie header expected");
  return { pair: setCookie.split(";", 1)[0], setCookie };
}

function assertCookieAttributes(setCookie, options) {
  assert.match(setCookie, /(?:^|;)\s*HttpOnly(?:;|$)/i);
  assert.match(setCookie, /(?:^|;)\s*SameSite=Lax(?:;|$)/i);
  assert.match(setCookie, /(?:^|;)\s*Path=\/(?:;|$)/i);
  if (options.secure) assert.match(setCookie, /(?:^|;)\s*Secure(?:;|$)/i);
  else assert.doesNotMatch(setCookie, /(?:^|;)\s*Secure(?:;|$)/i);
}

function isUuidV4(value) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

async function importPureTypeScriptModule(tempDirectory, sourceFileName) {
  const sourcePath = path.join(pocRoot, sourceFileName);
  const source = await fs.readFile(sourcePath, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: {
      module: ts.ModuleKind.ESNext,
      target: ts.ScriptTarget.ES2022,
    },
    fileName: sourcePath,
  }).outputText;
  const outputPath = path.join(
    tempDirectory,
    sourceFileName.replace(/\.ts$/, ".mjs"),
  );
  await fs.writeFile(outputPath, compiled, "utf8");
  return import(`${pathToFileURL(outputPath).href}?poc=${randomUUID()}`);
}

async function listFiles(directory) {
  const files = [];
  async function visit(current) {
    let entries;
    try {
      entries = await fs.readdir(current, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) await visit(absolute);
      else if (entry.isFile()) files.push(absolute);
    }
  }
  await visit(directory);
  return files;
}

test(
  "Better Auth works through an isolated vinext + workerd + D1 proof without changing production auth",
  { timeout: 300_000 },
  async (t) => {
    const nodeVersion = process.versions.node.split(".").map(Number);
    assert.ok(
      nodeVersion[0] > 22 || (nodeVersion[0] === 22 && nodeVersion[1] >= 13),
      `Node >=22.13 is required, received ${process.versions.node}`,
    );

    const temporaryRoot = await fs.mkdtemp(
      path.join(os.tmpdir(), "frame-zero-better-auth-poc-"),
    );
    const statePath = path.join(temporaryRoot, "state");
    const registryPath = path.join(temporaryRoot, "registry");
    const logPath = path.join(temporaryRoot, "logs");
    await Promise.all([
      fs.mkdir(statePath, { recursive: true }),
      fs.mkdir(registryPath, { recursive: true }),
      fs.mkdir(logPath, { recursive: true }),
    ]);

    const secret = generatedCredential("poc-secret");
    const harnessToken = generatedCredential("poc-harness");
    const credentials = {
      alice: generatedCredential("alice-password"),
      operator: generatedCredential("operator-password"),
      star: generatedCredential("star-password"),
    };
    const allSecrets = [secret, harnessToken, ...Object.values(credentials)];
    let runningServer = null;

    t.after(async () => {
      await stopOwnedProcess(runningServer?.child);
      await Promise.all(
        generatedArtifactDirectories.map((directory) =>
          fs.rm(directory, { recursive: true, force: true }),
        ),
      );
      await fs.rm(temporaryRoot, { recursive: true, force: true });
    });

    await executeD1(
      statePath,
      "CREATE TABLE site_settings (id INTEGER PRIMARY KEY, payload TEXT NOT NULL);" +
        "INSERT INTO site_settings (id, payload) VALUES (1, 'preserved');",
    );
    const firstMigration = await applyMigrations(statePath);
    assert.match(firstMigration.stdout, /0000_better_auth_poc\.sql/);
    const secondMigration = await applyMigrations(statePath);
    assert.match(secondMigration.stdout, /No migrations to apply/i);

    const tables = await executeD1(
      statePath,
      "SELECT name FROM sqlite_master WHERE type='table' " +
        "AND name NOT LIKE 'sqlite_%' AND name NOT LIKE '_cf_%' ORDER BY name;",
    );
    assert.deepEqual(
      tables.map(({ name }) => name),
      ["account", "d1_migrations", "session", "site_settings", "user", "verification"],
    );
    assert.deepEqual(
      await executeD1(statePath, "SELECT id, payload FROM site_settings;"),
      [{ id: 1, payload: "preserved" }],
    );

    const adapter = await importPureTypeScriptModule(
      temporaryRoot,
      "portfolio-adapter.ts",
    );
    assert.equal(adapter.canonicalizePortfolioUsername("Star"), "star");
    assert.equal(adapter.isPortfolioUsernameAllowed("star"), true);
    assert.equal(adapter.isPortfolioUsernameAllowed("auth"), false);
    const originPolicy = await importPureTypeScriptModule(
      temporaryRoot,
      "origin-policy.ts",
    );
    const exactTestOrigin = "http://127.0.0.1:3001";
    assert.deepEqual(
      originPolicy.parseAuthPocTrustedOrigins(
        JSON.stringify([exactTestOrigin]),
        exactTestOrigin,
      ),
      [exactTestOrigin],
    );
    for (const [serialized, configuredOrigin] of [
      [JSON.stringify(["https://*.example.com"]), "https://*.example.com"],
      [JSON.stringify(["https://photo.cosflow.icu", exactTestOrigin]), exactTestOrigin],
      [JSON.stringify(["https://photo?.cosflow.icu"]), "https://photo?.cosflow.icu"],
      [JSON.stringify(["http://public.example"]), "http://public.example"],
      [JSON.stringify([exactTestOrigin]), `${exactTestOrigin}/path`],
    ]) {
      assert.throws(() =>
        originPolicy.parseAuthPocTrustedOrigins(serialized, configuredOrigin),
      );
    }

    const port = await getFreeLoopbackPort();
    const baseURL = `http://127.0.0.1:${port}`;
    const serverInput = {
      baseURL,
      harnessToken,
      logPath,
      persistPath: statePath,
      port,
      registryPath,
      secret,
      secrets: allSecrets,
    };

    runningServer = await startPocServer(serverInput);
    const signupBody = {
      email: "public-signup@auth-poc.example",
      name: "public-signup",
      password: generatedCredential("public-signup-password"),
    };
    const signup = await requestJson(baseURL, "/api/auth/sign-up/email", {
      body: signupBody,
      fetchSite: "same-origin",
    });
    assert.ok(signup.response.status >= 400 && signup.response.status < 500);
    const signupTrailing = await requestJson(baseURL, "/api/auth/sign-up/email/", {
      body: signupBody,
      fetchSite: "same-origin",
    });
    assert.ok(signupTrailing.response.status >= 400);
    const anonymousAdmin = await requestJson(baseURL, "/api/auth/admin/create-user", {
      body: {
        email: "unauthorized@auth-poc.example",
        name: "unauthorized",
        password: generatedCredential("unauthorized-password"),
      },
      fetchSite: "same-origin",
    });
    assert.ok([401, 403].includes(anonymousAdmin.response.status));
    const usernameAvailability = await requestJson(
      baseURL,
      "/api/auth/is-username-available",
      { body: { username: "star" }, fetchSite: "same-origin" },
    );
    assert.equal(usernameAvailability.response.status, 404);

    await stopOwnedProcess(runningServer.child);
    runningServer = null;
    assert.deepEqual(
      await executeD1(
        statePath,
        "SELECT (SELECT count(*) FROM user) AS users, " +
          "(SELECT count(*) FROM account) AS accounts;",
      ),
      [{ accounts: 0, users: 0 }],
      "disabled public signup and anonymous admin access must write no account rows",
    );

    runningServer = await startPocServer(serverInput);
    const noHarnessToken = await requestJson(baseURL, "/_poc/provision", {
      body: {
        email: "star@auth-poc.example",
        password: credentials.star,
        role: "user",
        username: "star",
      },
      origin: null,
    });
    assert.equal(noHarnessToken.response.status, 403);

    const created = {};
    for (const username of ["operator", "star", "alice"]) {
      const provisioned = await requestJson(baseURL, "/_poc/provision", {
        body: {
          email: `${username}@auth-poc.example`,
          password: credentials[username],
          role: username === "operator" ? "admin" : "user",
          username,
        },
        headers: { authorization: `Bearer ${harnessToken}` },
        origin: null,
      });
      assert.equal(provisioned.response.status, 200, username);
      assert.equal(provisioned.body.ok, true);
      assert.equal(provisioned.body.user.email, `${username}@auth-poc.example`);
      assert.equal(provisioned.body.user.username, username);
      assert.equal(isUuidV4(provisioned.body.user.id), true);
      created[username] = provisioned.body.user;
    }
    const duplicate = await requestJson(baseURL, "/_poc/provision", {
      body: {
        email: "star@auth-poc.example",
        password: credentials.star,
        role: "user",
        username: "star",
      },
      headers: { authorization: `Bearer ${harnessToken}` },
      origin: null,
    });
    assert.equal(duplicate.response.status, 409);

    const signIn = async (username, password, options = {}) =>
      requestJson(baseURL, "/api/auth/sign-in/username", {
        body: { password, username },
        cookie: options.cookie,
        fetchSite: options.fetchSite ?? "same-origin",
        origin: options.origin === undefined ? baseURL : options.origin,
      });

    const starLogin = await signIn("star", credentials.star);
    assert.equal(starLogin.response.status, 200, JSON.stringify(starLogin.body));
    const starCookie = cookiePair(starLogin.response);
    assert.match(starCookie.pair, /^better-auth\.session_token=/);
    assertCookieAttributes(starCookie.setCookie, { secure: false });

    const starSession = await requestJson(baseURL, "/api/auth/get-session", {
      cookie: starCookie.pair,
    });
    assert.equal(starSession.response.status, 200);
    assert.equal(starSession.body.user.id, created.star.id);
    assert.equal(starSession.body.user.username, "star");
    assert.equal(starSession.body.user.email, "star@auth-poc.example");

    const fixedCookie = "better-auth.session_token=fixed-session-token";
    const fixationLogin = await signIn("star", credentials.star, { cookie: fixedCookie });
    assert.equal(fixationLogin.response.status, 200);
    const replacementCookie = cookiePair(fixationLogin.response);
    assert.notEqual(replacementCookie.pair, fixedCookie);
    assert.notEqual(replacementCookie.pair, starCookie.pair);
    const replacementSession = await requestJson(
      baseURL,
      "/api/auth/get-session",
      { cookie: replacementCookie.pair },
    );
    assert.equal(replacementSession.response.status, 200);
    assert.equal(replacementSession.body.user.id, created.star.id);

    const wrongPassword = await signIn("star", generatedCredential("wrong-password"));
    const unknownUser = await signIn("unknown-user", generatedCredential("wrong-password"));
    assert.equal(wrongPassword.response.status, 401);
    assert.equal(unknownUser.response.status, 401);
    assert.equal(wrongPassword.body.message, unknownUser.body.message);

    for (const originCase of [
      null,
      "https://evil.example",
      `http://127.0.0.1.evil.example:${port}`,
      `https://127.0.0.1:${port}`,
    ]) {
      const rejected = await signIn("star", credentials.star, { origin: originCase });
      assert.equal(rejected.response.status, 403, String(originCase));
      assert.equal(rejected.response.headers.has("set-cookie"), false);
    }
    const crossSite = await signIn("star", credentials.star, {
      fetchSite: "cross-site",
    });
    assert.equal(crossSite.response.status, 403);

    const rawOriginProbe = await requestJson(
      baseURL,
      "/_poc/raw-username-origin-probe",
      {
        body: { password: credentials.star, username: "star" },
        headers: { authorization: `Bearer ${harnessToken}` },
        origin: null,
      },
    );
    assert.equal(rawOriginProbe.response.status, 200);
    assert.equal(rawOriginProbe.body.status, 200);
    assert.equal(rawOriginProbe.body.setCookie, true);

    const aliceLogin = await signIn("alice", credentials.alice, {
      cookie: starCookie.pair,
    });
    assert.equal(aliceLogin.response.status, 200);
    const aliceCookie = cookiePair(aliceLogin.response).pair;
    assert.notEqual(aliceCookie, starCookie.pair);
    const aliceSession = await requestJson(baseURL, "/api/auth/get-session", {
      cookie: aliceCookie,
    });
    assert.equal(aliceSession.response.status, 200);
    assert.equal(aliceSession.body.user.id, created.alice.id);
    assert.notEqual(aliceSession.body.user.id, starSession.body.user.id);
    const originalStarSession = await requestJson(
      baseURL,
      "/api/auth/get-session",
      { cookie: starCookie.pair },
    );
    assert.equal(originalStarSession.response.status, 200);
    assert.equal(originalStarSession.body.user.id, created.star.id);

    const syntheticUsers = [
      {
        authUserId: starSession.body.user.id,
        id: "portfolio-star",
        username: "star",
      },
      {
        authUserId: aliceSession.body.user.id,
        id: "portfolio-alice",
        username: "alice",
      },
    ];
    const syntheticSites = [
      { id: "site-star-id", ownerUserId: "portfolio-star", slug: "site-star" },
      { id: "site-alice-id", ownerUserId: "portfolio-alice", slug: "site-alice" },
    ];
    assert.equal(
      adapter.authorizeSyntheticSite(
        starSession.body.user.id,
        "site-star",
        syntheticUsers,
        syntheticSites,
      )?.siteId,
      "site-star-id",
    );
    assert.equal(
      adapter.authorizeSyntheticSite(
        starSession.body.user.id,
        "site-alice",
        syntheticUsers,
        syntheticSites,
      ),
      null,
    );

    const aliceRevokeAttempt = await requestJson(
      baseURL,
      "/api/auth/admin/revoke-user-sessions",
      {
        body: { userId: created.star.id },
        cookie: aliceCookie,
        fetchSite: "same-origin",
      },
    );
    assert.equal(aliceRevokeAttempt.response.status, 403);

    const operatorLogin = await signIn("operator", credentials.operator);
    assert.equal(operatorLogin.response.status, 200);
    const operatorCookie = cookiePair(operatorLogin.response).pair;
    const evilOperatorRevoke = await requestJson(
      baseURL,
      "/api/auth/admin/revoke-user-sessions",
      {
        body: { userId: created.star.id },
        cookie: operatorCookie,
        fetchSite: "cross-site",
        origin: "https://evil.example",
      },
    );
    assert.equal(evilOperatorRevoke.response.status, 403);
    for (const cookie of [starCookie.pair, replacementCookie.pair]) {
      const stillAuthorized = await requestJson(baseURL, "/api/auth/get-session", {
        cookie,
      });
      assert.equal(stillAuthorized.response.status, 200);
      assert.equal(stillAuthorized.body.user.id, created.star.id);
    }

    const operatorRevoke = await requestJson(
      baseURL,
      "/api/auth/admin/revoke-user-sessions",
      {
        body: { userId: created.star.id },
        cookie: operatorCookie,
        fetchSite: "same-origin",
      },
    );
    assert.equal(operatorRevoke.response.status, 200);
    assert.equal(operatorRevoke.body.success, true);
    const revokedStarSession = await requestJson(baseURL, "/api/auth/get-session", {
      cookie: starCookie.pair,
    });
    assert.equal(revokedStarSession.response.status, 200);
    assert.equal(revokedStarSession.body, null);
    const revokedReplacementSession = await requestJson(
      baseURL,
      "/api/auth/get-session",
      { cookie: replacementCookie.pair },
    );
    assert.equal(revokedReplacementSession.response.status, 200);
    assert.equal(revokedReplacementSession.body, null);
    const survivingAliceSession = await requestJson(baseURL, "/api/auth/get-session", {
      cookie: aliceCookie,
    });
    assert.equal(survivingAliceSession.response.status, 200);
    assert.equal(survivingAliceSession.body.user.id, created.alice.id);

    const evilLogout = await requestJson(baseURL, "/api/auth/sign-out", {
      body: {},
      cookie: aliceCookie,
      fetchSite: "cross-site",
      origin: "https://evil.example",
    });
    assert.equal(evilLogout.response.status, 403);
    const aliceAfterEvilLogout = await requestJson(
      baseURL,
      "/api/auth/get-session",
      { cookie: aliceCookie },
    );
    assert.equal(aliceAfterEvilLogout.response.status, 200);
    assert.equal(aliceAfterEvilLogout.body.user.id, created.alice.id);

    const logout = await requestJson(baseURL, "/api/auth/sign-out", {
      body: {},
      cookie: aliceCookie,
      fetchSite: "same-origin",
    });
    assert.equal(logout.response.status, 200);
    const loggedOutAlice = await requestJson(baseURL, "/api/auth/get-session", {
      cookie: aliceCookie,
    });
    assert.equal(loggedOutAlice.response.status, 200);
    assert.equal(loggedOutAlice.body, null);

    const hostedCookie = await requestJson(baseURL, "/_poc/hosted-cookie", {
      body: { password: credentials.star, username: "star" },
      headers: { authorization: `Bearer ${harnessToken}` },
      origin: null,
    });
    assert.equal(hostedCookie.response.status, 200);
    assert.equal(hostedCookie.body.status, 200);
    assert.deepEqual(hostedCookie.body.cookie, {
      httpOnly: true,
      name: "__Secure-better-auth.session_token",
      pathRoot: true,
      sameSiteLax: true,
      secure: true,
    });

    await stopOwnedProcess(runningServer.child);
    runningServer = null;

    const users = await executeD1(
      statePath,
      "SELECT id, email, username, role FROM user ORDER BY username;",
    );
    assert.deepEqual(users.map(({ email, role, username }) => ({ email, role, username })), [
      { email: "alice@auth-poc.example", role: "user", username: "alice" },
      { email: "operator@auth-poc.example", role: "admin", username: "operator" },
      { email: "star@auth-poc.example", role: "user", username: "star" },
    ]);
    assert.equal(users.every(({ id }) => isUuidV4(id)), true);

    const accounts = await executeD1(
      statePath,
      "SELECT account_id, provider_id, password FROM account ORDER BY account_id;",
    );
    assert.equal(accounts.length, 3);
    assert.equal(accounts.every(({ provider_id }) => provider_id === "credential"), true);
    assert.equal(
      accounts.every(({ password }) =>
        typeof password === "string" &&
        password.length > 20 &&
        !Object.values(credentials).some((credential) => password.includes(credential)),
      ),
      true,
      "official provisioning must hash every credential",
    );

    const sessionRows = await executeD1(
      statePath,
      "SELECT token, created_at, expires_at FROM session ORDER BY created_at;",
    );
    assert.ok(sessionRows.length >= 1);
    assert.equal(
      sessionRows.every(({ token }) => typeof token === "string" && token.length >= 20),
      true,
    );
    assert.equal(
      sessionRows.every(({ created_at, expires_at }) => {
        const lifetime = expires_at - created_at;
        return lifetime >= 6.9 * 24 * 60 * 60 * 1_000 && lifetime <= 7.1 * 24 * 60 * 60 * 1_000;
      }),
      true,
    );

    const foreignKeys = await executeD1(
      statePath,
      "SELECT 'account' AS source, \"table\" AS target, \"from\" AS source_column, \"to\" AS target_column, on_delete FROM pragma_foreign_key_list('account') " +
        "UNION ALL SELECT 'session', \"table\", \"from\", \"to\", on_delete FROM pragma_foreign_key_list('session') ORDER BY source;",
    );
    assert.deepEqual(foreignKeys, [
      {
        on_delete: "CASCADE",
        source: "account",
        source_column: "user_id",
        target: "user",
        target_column: "id",
      },
      {
        on_delete: "CASCADE",
        source: "session",
        source_column: "user_id",
        target: "user",
        target_column: "id",
      },
    ]);
    const indexes = await executeD1(
      statePath,
      "SELECT name FROM sqlite_master WHERE type='index' AND name NOT LIKE 'sqlite_%' ORDER BY name;",
    );
    assert.deepEqual(indexes.map(({ name }) => name), [
      "account_userId_idx",
      "session_token_unique",
      "session_userId_idx",
      "user_email_unique",
      "user_username_unique",
      "verification_identifier_idx",
    ]);

    const thirdMigration = await applyMigrations(statePath);
    assert.match(thirdMigration.stdout, /No migrations to apply/i);
    assert.equal(
      (await executeD1(statePath, "SELECT count(*) AS count FROM user;"))[0].count,
      3,
      "reapplying migrations must preserve auth rows",
    );

    const nestedBuildStartedAt = performance.now();
    const build = await runCommand(
      process.execPath,
      [vinextCli, "build"],
      {
        cwd: pocAppRoot,
        env: {
          ...process.env,
          AUTH_POC_BASE_URL: baseURL,
          AUTH_POC_HARNESS_TOKEN: harnessToken,
          AUTH_POC_SECRET: secret,
          AUTH_POC_TRUSTED_ORIGINS: JSON.stringify([baseURL]),
          CI: "1",
          MINIFLARE_REGISTRY_PATH: registryPath,
          WRANGLER_LOG_PATH: logPath,
          WRANGLER_WRITE_LOGS: "false",
        },
        secrets: allSecrets,
      },
    );
    const nestedBuildDurationMs = performance.now() - nestedBuildStartedAt;
    assert.match(build.stdout + build.stderr, /api\/auth\/:all\+/);

    const clientFiles = await listFiles(path.join(pocAppRoot, "dist", "client"));
    let clientBytes = 0;
    let clientText = "";
    for (const file of clientFiles) {
      const content = await fs.readFile(file);
      clientBytes += content.byteLength;
      clientText += content.toString("utf8");
      for (const secretValue of allSecrets) {
        assert.equal(content.includes(Buffer.from(secretValue)), false);
      }
    }
    assert.doesNotMatch(clientText, /better-auth|AUTH_POC_SECRET|AUTH_POC_HARNESS_TOKEN/i);

    const allBuildFiles = await listFiles(path.join(pocAppRoot, "dist"));
    for (const file of allBuildFiles) {
      const content = await fs.readFile(file);
      for (const secretValue of allSecrets) {
        assert.equal(content.includes(Buffer.from(secretValue)), false);
      }
    }

    const serverFiles = await listFiles(path.join(pocAppRoot, "dist", "server"));
    let serverBytes = 0;
    for (const file of serverFiles) {
      serverBytes += (await fs.stat(file)).size;
    }

    t.diagnostic(
      `workerd auth flow passed; nested client output ${clientBytes} bytes across ${clientFiles.length} files; server output ${serverBytes} bytes across ${serverFiles.length} files; nested build ${nestedBuildDurationMs.toFixed(1)}ms`,
    );
  },
);
