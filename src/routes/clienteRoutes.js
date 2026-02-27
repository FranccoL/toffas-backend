import express from "express";
const router = express.Router();

import { criarCliente, buscarClientePorEmail } from "../controllers/clienteController.js";

// Rota POST para criar cliente
router.post("/", criarCliente);

// Rota GET para buscar cliente por email
router.get("/email/:email", buscarClientePorEmail);

export default router;
