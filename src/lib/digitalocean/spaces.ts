import { S3Client, PutObjectCommand, GetObjectCommand } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

function requireEnv(name: string) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

function getSpacesConfig() {
  const region = requireEnv("DO_SPACES_REGION");
  const bucket = requireEnv("DO_SPACES_BUCKET");
  const endpoint = requireEnv("DO_SPACES_ENDPOINT");
  const key = requireEnv("DO_SPACES_KEY");
  const secret = requireEnv("DO_SPACES_SECRET");
  const cdnBaseUrl = process.env.DO_SPACES_CDN_BASE_URL;

  return { region, bucket, endpoint, key, secret, cdnBaseUrl };
}

let spacesClientSingleton: S3Client | null = null;

export function getSpacesClient() {
  if (spacesClientSingleton) return spacesClientSingleton;

  const config = getSpacesConfig();

  spacesClientSingleton = new S3Client({
    region: config.region,
    endpoint: config.endpoint,
    credentials: {
      accessKeyId: config.key,
      secretAccessKey: config.secret,
    },
    forcePathStyle: false,
  });

  return spacesClientSingleton;
}

export async function uploadToSpaces(params: {
  key: string;
  body: Buffer;
  contentType: string;
  upsert?: boolean;
}) {
  const config = getSpacesConfig();
  const client = getSpacesClient();

  const command = new PutObjectCommand({
    Bucket: config.bucket,
    Key: params.key,
    Body: params.body,
    ContentType: params.contentType,
    ACL: "private",
    ...(params.upsert ? {} : { IfNoneMatch: "*" }),
  });

  return client.send(command);
}

export async function createSpacesSignedGetUrl(key: string, expiresIn = 300) {
  const config = getSpacesConfig();
  const client = getSpacesClient();
  const command = new GetObjectCommand({
    Bucket: config.bucket,
    Key: key,
  });

  return getSignedUrl(client, command, { expiresIn });
}

export function resolveSpacesPublicUrlFromCdn(key: string) {
  const config = getSpacesConfig();
  if (!config.cdnBaseUrl) return null;
  return `${config.cdnBaseUrl.replace(/\/$/, "")}/${key}`;
}
