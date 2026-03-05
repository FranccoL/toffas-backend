import pool from "../config/db.js";
 
export async function validarCupom(req, res) {
  let { codigo, subtotal, frete } = req.body;
 
  if (!codigo) {
    return res.status(400).json({ error: "Código não informado" });
  }
 
  codigo = codigo.trim().toUpperCase();
  subtotal = parseFloat(subtotal) || 0;
  frete = parseFloat(frete) || 0;
 
  try {
    const [cupom] = await pool.query(
      "SELECT * FROM cupons WHERE UPPER(codigo) = ? AND ativo = 1",
      [codigo]
    );
 
    if (!cupom.length) {
      return res.status(400).json({ error: "Cupom inválido" });
    }
 
    const cupomData = cupom[0];
 
    if (cupomData.validade && new Date(cupomData.validade) < new Date()) {
      return res.status(400).json({ error: "Cupom expirado" });
    }
 
    if (cupomData.uso_maximo && cupomData.usos >= cupomData.uso_maximo) {
      return res.status(400).json({ error: "Cupom esgotado" });
    }
 
    // Calcular o desconto
    const valorCupom = parseFloat(cupomData.valor) || 0;
    let desconto = 0;
 
    if (cupomData.tipo === "percentual") {
      desconto = (subtotal * valorCupom) / 100;
    } else {
      desconto = valorCupom;
    }
 
    if (desconto > subtotal) {
      desconto = subtotal;
    }
 
    desconto = Number(desconto.toFixed(2));
 
    res.json({
      ...cupomData,
      desconto,
      frete_gratis: !!cupomData.frete_gratis
    });
 
  } catch (err) {
    console.error("Erro ao validar cupom:", err);
    res.status(500).json({ error: "Erro ao validar cupom" });
  }
}