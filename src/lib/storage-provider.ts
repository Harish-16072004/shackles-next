export type StorageProvider = "local" | "digitalocean";

export function getStorageProvider(): StorageProvider {
  const provider = process.env.STORAGE_PROVIDER;
  if (provider === "local") return "local";
  if (provider === "digitalocean") return "digitalocean";
  return "local";
}

export function shouldUseLocal(provider: StorageProvider) {
  return provider === "local";
}

export function shouldUseDigitalOcean(provider: StorageProvider) {
  return provider === "digitalocean";
}
