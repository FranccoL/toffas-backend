import express from "express";
import { enviarEmailAluguel } from "../services/emailService.js"; // Importando a função nova

const router = express.Router();

router.post("/send-email", async (req, res) => {
  try {
    // Chama a função unificada que criamos
    await enviarEmailAluguel(req.body);
    res.status(200).json({ message: "E-mail enviado com sucesso!" });
  } catch (error) {
    console.error("Erro na rota de e-mail:", error);
    res.status(500).json({ error: "Falha ao enviar e-mail." });
  }
});

export default router;
