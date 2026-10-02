export type HealthResponse = { status: "ok"; db: "ok" } | { status: "error"; db: "down" };
