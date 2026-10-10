
const crypto = require("crypto");

const PROJECT_FIELDS_TO_ENCRYPT = [
  "name",
  "client_name",
  "description",
  "budget_hours",
  "project_code",
];

function getClientPublicKey(req) {
  const publicKeyBase64 = req.headers["x-client-public-key"];

  if (!publicKeyBase64) {
    throw new Error("Client public key is required");
  }

  return crypto.createPublicKey({
    key: Buffer.from(publicKeyBase64, "base64"),
    format: "der",
    type: "spki",
  });
}

/**
 * Encrypt one field into a single Base64 string.
 * The string contains the wrapped AES key, IV, auth tag and ciphertext.
 */
function encryptField(publicKey, value) {
  const aesKey = crypto.randomBytes(32);
  const iv = crypto.randomBytes(12);

  const cipher = crypto.createCipheriv("aes-256-gcm", aesKey, iv);

  const ciphertext = Buffer.concat([
    cipher.update(JSON.stringify(value), "utf8"),
    cipher.final(),
  ]);

  const authTag = cipher.getAuthTag();

  const encryptedKey = crypto.publicEncrypt(
    {
      key: publicKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: "sha256",
    },
    aesKey
  );

  // All metadata is packed into the field's string value.
  const packedPayload = {
    k: encryptedKey.toString("base64"),
    i: iv.toString("base64"),
    t: authTag.toString("base64"),
    d: ciphertext.toString("base64"),
  };

  return Buffer.from(JSON.stringify(packedPayload)).toString("base64");
}

function encryptProjectRecord(publicKey, record) {
  if (!record || typeof record !== "object" || Array.isArray(record)) {
    return record;
  }

  const result = { ...record };

  for (const field of PROJECT_FIELDS_TO_ENCRYPT) {
    if (Object.prototype.hasOwnProperty.call(result, field)) {
      result[field] = encryptField(publicKey, result[field]);
    }
  }

  return result;
}

function encryptProjectData(publicKey, data) {
  if (Array.isArray(data)) {
    return data.map((record) => encryptProjectRecord(publicKey, record));
  }

  if (data && typeof data === "object") {
    return encryptProjectRecord(publicKey, data);
  }

  return data;
}

function sendSelectiveEncrypted(req, res, statusCode, payload) {
  try {
    const publicKey = getClientPublicKey(req);
    const encryptedData = encryptProjectData(publicKey, payload.data);

    res.set({
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      Pragma: "no-cache",
    });
    res.removeHeader("ETag");

    return res.status(statusCode).json({
      ...payload,
      data: encryptedData,
    });
  } catch (error) {
    console.error("Project response encryption failed:", error.message);

    return res.status(400).json({
      success: false,
      message: "Unable to encrypt project response",
    });
  }
}

module.exports = {
  sendSelectiveEncrypted,
};
