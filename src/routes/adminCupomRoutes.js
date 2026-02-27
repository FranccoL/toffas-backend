import express from "express";
import { criarCupom } from "../controllers/adminCupomController.js";

const router = express.Router();

// se você tiver middleware de auth admin, coloca aqui
// router.use(verificarAdmin);

router.post("/cupom", criarCupom);

export default router;