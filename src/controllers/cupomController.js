import pool from "../config/db.js";

export async function validarCupom(req, res) {
  let { codigo } = req.body;

  if (!codigo) {
    return res.status(400).json({ error: "Código não informado" });
  }

  // 🔒 FORÇA UPPERCASE
  codigo = codigo.trim().toUpperCase();

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

    res.json(cupomData);

  } catch (err) {
    res.status(500).json({ error: "Erro ao validar cupom" });
  }
}