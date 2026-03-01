export type StorageProvider = "local" | "digitalocean";

export function getStorageProvider(): StorageProvider {
  const provider = process.env.STORAGE_PROVIDER;
  if (provider === "local") return "local";
  if (provider === "digitalocean") return "digitalocean";

  if (process.env.NODE_ENV !== "production") {
    return "local";
  }

  throw new Error("Invalid STORAGE_PROVIDER. Use 'local' or 'digitalocean'.");
}

export function shouldUseLocal(provider: StorageProvider) {
  return provider === "local";
}

export function shouldUseDigitalOcean(provider: StorageProvider) {
  return provider === "digitalocean";
}
