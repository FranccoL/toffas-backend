import { Router } from "express";
import nodemailer from "nodemailer";

const router = Router();

router.post("/send-email", async (req, res) => {
  try {
    const data = req.body;
  const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
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

    // Envia para o dono da loja
    await transporter.sendMail({
      from: `"Site - Orçamentos" <${process.env.EMAIL_USER}>`,
      to: process.env.RECIPIENT_EMAIL || process.env.EMAIL_USER,
      subject: `Novo orçamento (${data.tipo})`,
      html: htmlBody
    });

    // Envia confirmação para o cliente
    if (data.email) {
      const htmlCliente = `
        <div style="font-family: Arial, sans-serif; max-width:600px; margin:0 auto;">
          <div style="background:#000; padding:24px; text-align:center;">
            <h1 style="color:#fff; margin:0; font-size:22px;">Toffa's Coffee</h1>
          </div>
          <div style="padding:24px;">
            <h2 style="color:#333;">Recebemos seu pedido de orçamento!</h2>
            <p style="color:#555;">
              Olá <strong>${data.empresa || data.nome}</strong>, recebemos sua solicitação de orçamento
              e em breve entraremos em contato.
            </p>
            <p style="color:#888; font-size:13px; margin-top:24px;">
              Se tiver dúvidas, entre em contato conosco respondendo este email.
            </p>
          </div>
          <div style="background:#f7f7f7; padding:16px 24px; text-align:center;">
            <p style="margin:0; color:#999; font-size:12px;">
              Toffa's Coffee — Obrigado pela preferência!
            </p>
          </div>
        </div>
      `;

      await transporter.sendMail({
        from: `"Toffa's Coffee" <${process.env.EMAIL_USER}>`,
        to: data.email,
        subject: "Recebemos seu pedido de orçamento - Toffa's Coffee",
        html: htmlCliente
      });
    }

    res.json({ ok: true, message: "Email enviado" });

  } catch (err) {
    console.error("Erro ao enviar email:", err);
    res.status(500).json({ error: "Erro ao enviar email" });
  }
});

  export default router;