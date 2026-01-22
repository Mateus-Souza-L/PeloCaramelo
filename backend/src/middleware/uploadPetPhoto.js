// backend/src/middleware/uploadPetPhoto.js
const multer = require("multer");

// Armazena o arquivo em memória (buffer)
const storage = multer.memoryStorage();

// Aceita apenas imagens
function fileFilter(req, file, cb) {
  if (!file.mimetype.startsWith("image/")) {
    return cb(new Error("Only image files are allowed"));
  }
  cb(null, true);
}

const uploadPetPhoto = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB
  },
});

module.exports = { uploadPetPhoto };
