// backend/src/services/petPhotoService.js
const crypto = require("crypto");
const path = require("path");
const { supabase } = require("./supabaseClient");

const BUCKET = process.env.SUPABASE_STORAGE_BUCKET || "pet-photos";

/**
 * Upload da foto do pet para o Supabase Storage
 * @param {Object} params
 * @param {Buffer} params.buffer - arquivo em buffer
 * @param {string} params.mimetype - ex: image/jpeg
 * @param {number|string} params.petId
 */
async function uploadPetPhoto({ buffer, mimetype, petId }) {
  if (!buffer) throw new Error("Missing file buffer");
  if (!mimetype) throw new Error("Missing mimetype");
  if (!petId) throw new Error("Missing petId");

  const ext =
    mimetype === "image/png"
      ? "png"
      : mimetype === "image/webp"
      ? "webp"
      : "jpg";

  const fileName = `${petId}-${crypto.randomUUID()}.${ext}`;
  const filePath = `pets/${petId}/${fileName}`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(filePath, buffer, {
      contentType: mimetype,
      upsert: true,
    });

  if (uploadError) {
    console.error("Supabase upload error:", uploadError);
    throw new Error("Failed to upload pet photo");
  }

  const { data } = supabase.storage.from(BUCKET).getPublicUrl(filePath);

  return {
    photo_url: data.publicUrl,
    photo_path: filePath,
  };
}

module.exports = { uploadPetPhoto };
