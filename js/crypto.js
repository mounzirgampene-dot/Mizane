// MIZANE — Chiffrement local des secrets (Web Crypto, AES-GCM 256).
// La clé de chiffrement est générée sur l'appareil et stockée séparément :
// cela protège la clé API d'une lecture directe du stockage, sans remplacer
// la protection de l'appareil lui-même (verrouillage, chiffrement du disque).
const DEV_KEY = "mizane_dk";

async function deviceKey() {
  let b64 = localStorage.getItem(DEV_KEY);
  if (!b64) {
    const raw = crypto.getRandomValues(new Uint8Array(32));
    let bin = "";
    for (const b of raw) bin += String.fromCharCode(b);
    b64 = btoa(bin);
    localStorage.setItem(DEV_KEY, b64);
  }
  const bytes = Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
  return crypto.subtle.importKey("raw", bytes, "AES-GCM", false, ["encrypt", "decrypt"]);
}

function toB64(buf) {
  let bin = "";
  for (const b of new Uint8Array(buf)) bin += String.fromCharCode(b);
  return btoa(bin);
}

function fromB64(b64) {
  return Uint8Array.from(atob(b64), (c) => c.charCodeAt(0));
}

export async function encryptSecret(plain) {
  const key = await deviceKey();
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const ct = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, key, new TextEncoder().encode(plain));
  return "enc1:" + toB64(iv) + ":" + toB64(ct);
}

export async function decryptSecret(payload) {
  if (!payload || !String(payload).startsWith("enc1:")) return payload || "";
  const [, ivB64, ctB64] = String(payload).split(":");
  const key = await deviceKey();
  const pt = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromB64(ivB64) }, key, fromB64(ctB64));
  return new TextDecoder().decode(pt);
}
