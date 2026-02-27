import { Router } from "express";
import nodemailer from "nodemailer";

const router = Router();

router.post("/send-email", async (req, res) => {
  try {
    const data = req.body;

    // Configura seu servidor SMTP
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: 465,
      secure: true,
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS
      }
    });

    const htmlBody = `
      <h2>Novo pedido de orçamento (${data.tipo})</h2>
      <p><strong>Nome/Empresa:</strong> ${data.empresa || data.nome}</p>
      <p><strong>Responsável:</strong> ${data.responsavel || "-"}</p>
      <p><strong>Email:</strong> ${data.email}</p>
      <p><strong>Telefone:</strong> ${data.telefone}</p>
      <p><strong>Mensagem:</strong><br>${data.mensagem || "-"}</p>
    `;

    await transporter.sendMail({
      from: `"Site - Orçamentos" <${process.env.SMTP_USER}>`,
      to: process.env.RECIPIENT_EMAIL,
      subject: `Novo orçamento (${data.tipo})`,
      html: htmlBody
    });

    res.json({ ok: true, message: "Email enviado" });

  } catch (err) {
    console.error("Erro ao enviar email:", err);
    res.status(500).json({ error: "Erro ao enviar email" });
  }
});

export default router;
