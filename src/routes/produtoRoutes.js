import express from "express";
const router = express.Router();

import { criarProduto, listarProdutos } from "../controllers/produtoController.js";

// POST /produtos → criar
router.post("/", criarProduto);

// GET /produtos → listar
router.get("/", listarProdutos);

export default router;
