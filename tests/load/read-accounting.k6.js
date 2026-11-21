import http from "k6/http";
import { check, sleep } from "k6";

const supabaseUrl = (__ENV.SUPABASE_URL || "").replace(/\/$/, "");
const anonKey = __ENV.SUPABASE_ANON_KEY || "";
const accessToken = __ENV.ACCESS_TOKEN || "";
const companyId = __ENV.COMPANY_ID || "";
const peakVus = Math.max(1, Number(__ENV.MAX_VUS || 50));

export const options = {
  stages: [
    { duration: "30s", target: Math.max(1, Math.ceil(peakVus * 0.1)) },
    { duration: "60s", target: Math.ceil(peakVus * 0.5) },
    { duration: "90s", target: peakVus },
    { duration: "30s", target: 0 },
  ],
  thresholds: {
    http_req_failed: ["rate<0.01"],
    http_req_duration: ["p(95)<2000", "p(99)<5000"],
  },
};

export function setup() {
  if (!supabaseUrl || !anonKey || !accessToken || !companyId) {
    throw new Error("Définir SUPABASE_URL, SUPABASE_ANON_KEY, ACCESS_TOKEN et COMPANY_ID.");
  }
  if (!/^https:\/\//.test(supabaseUrl)) {
    throw new Error("SUPABASE_URL doit être une URL HTTPS.");
  }
}

export default function () {
  const response = http.post(
    `${supabaseUrl}/functions/v1/read-accounting`,
    JSON.stringify({ company_id: companyId, limit: 100, offset: 0, changes_since: 0 }),
    {
      headers: {
        "Content-Type": "application/json",
        apikey: anonKey,
        Authorization: `Bearer ${accessToken}`,
      },
      tags: { endpoint: "read-accounting", scenario: "concurrent-read" },
      timeout: "15s",
    },
  );

  check(response, {
    "lecture cloud répond HTTP 200": (r) => r.status === 200,
    "lecture cloud renvoie du JSON": (r) => (r.headers["Content-Type"] || "").includes("application/json"),
  });
  sleep(1);
}
