import express from "express";
import { mercadoPagoWebhook } from "../controllers/webhookController.js";

const router = express.Router();

// webhook oficial do Mercado Pago
router.post("/mercadopago", mercadoPagoWebhook);

export default router;
