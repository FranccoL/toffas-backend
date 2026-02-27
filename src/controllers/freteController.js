import axios from "axios";

export const calcularFrete = async (req, res) => {
  try {
    const { cepDestino, produtos } = req.body;

    if (!cepDestino || !Array.isArray(produtos) || produtos.length === 0) {
      return res.status(400).json({ erro: "Dados inválidos para cálculo de frete" });
    }

    // 📦 monta produtos no formato do Melhor Envio
    const products = produtos.map((p, index) => ({
      id: `produto-${index}`,
      width: 12,
      height: 20,
      length: 10,
      weight: p.pesoEmGramas / 1000, // 🔥 Melhor Envio usa KG
      insurance_value: 30,
      quantity: p.quantidade,
    }));

    const payload = {
      from: { postal_code: "09760370" }, // CEP ORIGEM
      to: { postal_code: cepDestino },
      products,
    };

    console.log("📦 Payload enviado ao Melhor Envio:");
    console.log(payload);

    const response = await axios.post(
      "https://api.melhorenvio.com.br/api/v2/me/shipment/calculate",
      payload,
      {
        headers: {
          Authorization: `Bearer ${process.env.MELHOR_ENVIO_TOKEN}`,
          "Content-Type": "application/json",
          Accept: "application/json",
          "User-Agent": "MinhaLoja (email@dominio.com)",
        },
      }
    );

    // 🔥 LIMPA E NORMALIZA RESPOSTA
    const fretes = response.data
      .filter(f => f.price && f.delivery_time)
      .map(f => ({
        id: f.id,
        metodo: `${f.company.name} - ${f.name}`,
        valor: Number(f.price),
        prazo: Number(f.delivery_time),
      }))
      .sort((a, b) => a.valor - b.valor);

    return res.json(fretes);

  } catch (error) {
    console.error("❌ Erro Melhor Envio:", error.response?.data || error.message);
    return res.status(500).json({ erro: "Erro ao calcular frete" });
  }
};
