import express from "express";
import { criarCupom } from "../controllers/adminCupomController.js";

const router = express.Router();


router.post("/cupom", criarCupom);

export default router;