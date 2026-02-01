import { WorkOS } from "@workos-inc/node";

const isProduction = process.env.NODE_ENV === "production";
const isDev = !!process.env.DEV_USER_ID;

if (isProduction && !process.env.WORKOS_API_KEY) {
  throw new Error("WORKOS_API_KEY is required in production");
}
if (isProduction && !process.env.WORKOS_CLIENT_ID) {
  throw new Error("WORKOS_CLIENT_ID is required in production");
}
if (!isDev && !process.env.WORKOS_API_KEY) {
  console.warn("WORKOS_API_KEY not set. Auth will fail unless DEV_USER_ID is set.");
}

export const workos = new WorkOS(process.env.WORKOS_API_KEY || "");
export const WORKOS_CLIENT_ID = process.env.WORKOS_CLIENT_ID || "";
export const BASE_URL = process.env.BASE_URL || "http://localhost:3001";
