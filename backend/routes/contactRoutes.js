import express from "express";
import { sendContactMessage } from "../controllers/contactController.js";
import { validateBody } from "../validators/common.js";
import { contactSchema } from "../validators/contact.js";

const router = express.Router();

router.post("/send", validateBody(contactSchema), sendContactMessage);

export default router;
