import multer from "multer";
import path from "path";

/**
 * Multer storage for file uploads
 * Works with React Native DocumentPicker/ImagePicker payloads
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    // Use timestamp + original extension
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

export const upload = multer({ storage });
