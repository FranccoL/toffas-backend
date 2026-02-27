import express from "express";
import { Preference } from "mercadopago";
import mercadopago from "../config/mercadopago.js";

const router = express.Router();

router.post("/webhook", async (req, res) => {
  try {
    const payment = req.body;

    if (payment.type === "payment") {
      const paymentId = payment.data.id;

      const response = await mercadopago.payment.findById(paymentId);

      if (response.body.status === "approved") {
        console.log("Pagamento aprovado!");

        // Aqui você:
        // 1. Atualiza pedido no banco
        // 2. Gera envio no Melhor Envio
        // 3. Envia email
      }
    }

    res.sendStatus(200);
  } catch (error) {
    console.error("Erro webhook:", error);
    res.sendStatus(500);
  }
});




router.post("/criar-preferencia", async (req, res) => {
  try {
    const { produtos, cliente } = req.body;

    const preference = new Preference(mercadopago);

    const response = await preference.create({
      body: {
        items: produtos.map((item) => ({
          title: item.nome,
          quantity: Number(item.quantity),
unit_price: Number(
  item.price?.replace(/[^\d,]/g, "").replace(",", ".")
),

          currency_id: "BRL",
        })),
        payer: {
          name: cliente.nome,
          email: cliente.email,
        },
        back_urls: {
          success: "http://localhost:5173/sucesso",
          failure: "http://localhost:5173/erro",
          pending: "http://localhost:5173/pendente",
        },
        
      },
    });

    res.json({ id: response.id });

  } catch (error) {
    console.error("Erro Mercado Pago:", error);
    res.status(500).json({ error: "Erro ao criar preferência" });
  }
});

export default router;
