import express from "express";
import { criarPedido } from "../controllers/pedidoController.js";

const router = express.Router();

router.post("/", criarPedido);

export default router;