import { WorkOS } from "@workos-inc/node";

if (!process.env.DEV_USER_ID && !process.env.WORKOS_API_KEY) {
  console.warn("WORKOS_API_KEY not set. Auth will fail unless DEV_USER_ID is set.");
}

export const workos = new WorkOS(process.env.WORKOS_API_KEY || "");
export const WORKOS_CLIENT_ID = process.env.WORKOS_CLIENT_ID || "";
export const BASE_URL = process.env.BASE_URL || "http://localhost:3001";
