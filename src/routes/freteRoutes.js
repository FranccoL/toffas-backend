import express from "express";
import { melhorEnvioApi } from "../services/melhorEnvio.js";

const router = express.Router();

router.post("/calcular", async (req, res) => {
  try {
    const { cepDestino, produtos } = req.body;

    //  Validações
    if (!cepDestino) {
      return res.status(400).json({ erro: "CEP de destino é obrigatório" });
    }

    if (!Array.isArray(produtos) || produtos.length === 0) {
      return res.status(400).json({ erro: "Produtos inválidos" });
    }

    //  Normalização de produtos
    const products = produtos.map((p, i) => {
      const pesoEmGramas = Number(p.pesoEmGramas);
      const quantidade = Number(p.quantidade ?? 1);

      if (!pesoEmGramas || pesoEmGramas <= 0) {
        throw new Error(`Peso inválido no produto ${i}`);
      }

      return {
        id: `produto-${i}`,
        width: 12,
        height: 20,
        length: 10,
        weight: pesoEmGramas / 1000, // kg
        insurance_value: 30,
        quantity: quantidade,
      };
    });

    const payload = {
      from: { postal_code: process.env.CEP_ORIGEM },
      to: { postal_code: cepDestino },
      products,
    };

    console.log("📦 Payload enviado ao Melhor Envio:");
    console.dir(payload, { depth: null });

    const { data } = await melhorEnvioApi.post(
      "/me/shipment/calculate",
      payload
    );

    // 🔥 NORMALIZAÇÃO DO RETORNO (PONTO CRÍTICO)
    const fretesNormalizados = data
      .filter((f) => f.price && !f.error)
      .map((f) => ({
        id: f.id,
        metodo: `${f.company.name} - ${f.name}`,
        valor: Number(f.price),
        prazo: `${f.delivery_time} dias úteis`,
      }))
      .sort((a, b) => a.valor - b.valor)
      .slice(0, 3);

    return res.json(fretesNormalizados);

  } catch (err) {
    console.error("❌ Erro Melhor Envio:", err.response?.data || err.message);

    return res.status(500).json({
      erro: "Erro ao calcular frete",
      detalhe: err.response?.data || err.message,
    });
  }
});

export default router;
