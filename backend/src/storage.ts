import { Client } from "minio";
import { config } from "./config.js";

// MinIO object storage — hosts user-uploaded images (avatars, hotel photos).
export const minio = new Client({
  endPoint: config.minio.endpoint,
  port: config.minio.port,
  useSSL: config.minio.useSSL,
  accessKey: config.minio.accessKey,
  secretKey: config.minio.secretKey,
});

let ready = false;

export async function ensureBucket(): Promise<void> {
  try {
    const exists = await minio.bucketExists(config.minio.bucket);
    if (!exists) {
      await minio.makeBucket(config.minio.bucket, "us-east-1");
    }
    // public-read so object URLs render without signed links
    await minio.setBucketPolicy(
      config.minio.bucket,
      JSON.stringify({
        Version: "2012-10-17",
        Statement: [
          {
            Effect: "Allow",
            Principal: { AWS: ["*"] },
            Action: ["s3:GetObject"],
            Resource: [`arn:aws:s3:::${config.minio.bucket}/*`],
          },
        ],
      })
    );
    ready = true;
    console.log(`[minio] bucket "${config.minio.bucket}" ready`);
  } catch (e: any) {
    console.warn("[minio] not reachable (uploads disabled):", e.message);
  }
}

export function storageReady(): boolean {
  return ready;
}

/** Store a buffer and return its public URL. */
export async function putObject(key: string, body: Buffer, contentType: string): Promise<string> {
  await minio.putObject(config.minio.bucket, key, body, body.length, { "Content-Type": contentType });
  return `${config.publicStorageUrl}/${config.minio.bucket}/${key}`;
}
