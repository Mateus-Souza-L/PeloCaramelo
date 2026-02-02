// backend/src/routes/contactRoutes.js
const express = require("express");
const router = express.Router();
const { sendPalestraLead } = require("../controllers/contactController");

router.post("/palestra", sendPalestraLead);

module.exports = router;
