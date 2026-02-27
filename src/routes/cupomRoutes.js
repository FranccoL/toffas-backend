import express from "express";
import { validarCupom } from "../controllers/cupomController.js";

const router = express.Router();

router.post("/validar", validarCupom);

export default router;