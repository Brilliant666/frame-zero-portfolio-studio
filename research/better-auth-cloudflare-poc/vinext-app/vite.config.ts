import { tmpdir } from "node:os";
import { isAbsolute, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

import vinext from "vinext";
import { defineConfig } from "vite";

const configPath = fileURLToPath(new URL("./wrangler.jsonc", import.meta.url));

function requiredEnvironmentValue(name: string) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required for the isolated auth POC.`);
  return value;
}

export default defineConfig(async ({ command }) => {
  const isDevelopmentServer = command === "serve";
  const baseURLValue = isDevelopmentServer
    ? requiredEnvironmentValue("AUTH_POC_BASE_URL")
    : null;
  const baseURLObject = baseURLValue ? new URL(baseURLValue) : null;
  if (
    baseURLObject &&
    (baseURLObject.origin !== baseURLValue ||
      baseURLObject.protocol !== "http:" ||
      baseURLObject.hostname !== "127.0.0.1" ||
      !baseURLObject.port)
  ) {
    throw new Error(
      "AUTH_POC_BASE_URL must be an exact http://127.0.0.1:<port> origin.",
    );
  }
  const baseURL = baseURLObject?.origin ?? null;
  const secret = isDevelopmentServer
    ? requiredEnvironmentValue("AUTH_POC_SECRET")
    : null;
  const harnessToken = isDevelopmentServer
    ? requiredEnvironmentValue("AUTH_POC_HARNESS_TOKEN")
    : null;
  const persistPathValue = isDevelopmentServer
    ? requiredEnvironmentValue("AUTH_POC_PERSIST_PATH")
    : null;
  const persistPath = persistPathValue ? resolve(persistPathValue) : null;
  const relativeToSystemTemp = persistPath
    ? relative(resolve(tmpdir()), persistPath)
    : null;

  if (
    persistPathValue &&
    (!isAbsolute(persistPathValue) ||
      !relativeToSystemTemp ||
      relativeToSystemTemp === ".." ||
      relativeToSystemTemp.startsWith(
        `..${process.platform === "win32" ? "\\" : "/"}`,
      ) ||
      isAbsolute(relativeToSystemTemp))
  ) {
    throw new Error("AUTH_POC_PERSIST_PATH must be inside the system temp directory.");
  }

  if (
    (secret !== null && secret.length < 32) ||
    (harnessToken !== null && harnessToken.length < 32)
  ) {
    throw new Error(
      "AUTH_POC_SECRET and AUTH_POC_HARNESS_TOKEN must contain at least 32 characters.",
    );
  }

  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      host: "127.0.0.1",
      strictPort: true,
    },
    plugins: [
      vinext(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        configPath,
        persistState: persistPath ? { path: persistPath } : false,
        config: (resolvedConfig) =>
          isDevelopmentServer && baseURL && secret && harnessToken
            ? {
                vars: {
                  ...resolvedConfig.vars,
                  AUTH_POC_BASE_URL: baseURL,
                  AUTH_POC_HARNESS_TOKEN: harnessToken,
                  AUTH_POC_SECRET: secret,
                  AUTH_POC_TRUSTED_ORIGINS: JSON.stringify([baseURL]),
                },
              }
            : {},
      }),
    ],
  };
});
