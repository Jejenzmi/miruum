// Central runtime config — env with sane dev defaults.
const bool = (v: string | undefined, d = false) => (v == null ? d : v === "true" || v === "1");

export const config = {
  port: Number(process.env.PORT || 5013),
  jwtSecret: process.env.JWT_SECRET || "miruum-dev-secret",
  redisUrl: process.env.REDIS_URL || "redis://localhost:6379",
  minio: {
    endpoint: process.env.MINIO_ENDPOINT || "localhost",
    port: Number(process.env.MINIO_PORT || 9000),
    useSSL: bool(process.env.MINIO_USE_SSL, false),
    accessKey: process.env.MINIO_ACCESS_KEY || "miruum",
    secretKey: process.env.MINIO_SECRET_KEY || "miruum123",
    bucket: process.env.MINIO_BUCKET || "miruum",
  },
  // Public base for stored objects, e.g. https://ota.gokar.id/storage (nginx → minio).
  // Falls back to the direct minio endpoint for local dev.
  publicStorageUrl:
    process.env.PUBLIC_STORAGE_URL ||
    `http://${process.env.MINIO_ENDPOINT || "localhost"}:${Number(process.env.MINIO_PORT || 9000)}`,
};
