import express from "express";
const router = express.Router();

import { criarPedido } from "../controllers/pedidoController.js";

// POST /pedidos → cria pedido + link Mercado Pago
router.post("/", criarPedido);

export default router;
