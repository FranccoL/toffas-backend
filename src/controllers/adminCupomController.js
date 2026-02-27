import pool from "../config/db.js";

export async function criarCupom(req, res) {
  try {
    let {
      codigo,
      tipo,
      valor,
      validade,
      uso_maximo,
      frete_gratis,
      primeira_compra,
      uso_por_cliente
    } = req.body;

    if (!codigo || !tipo) {
      return res.status(400).json({ error: "Código e tipo são obrigatórios" });
    }

    codigo = codigo.toUpperCase().trim();

    const valorNumerico = parseFloat(valor) || 0;

    await pool.query(
      `INSERT INTO cupons
      (codigo, tipo, valor, ativo, validade, uso_maximo, usos, frete_gratis, primeira_compra, uso_por_cliente)
      VALUES (?, ?, ?, 1, ?, ?, 0, ?, ?, ?)`,
      [
        codigo,
        tipo,
        valorNumerico,
        validade || null,
        uso_maximo || null,
        frete_gratis ? 1 : 0,
        primeira_compra ? 1 : 0,
        uso_por_cliente ? 1 : 0
      ]
    );

    res.status(201).json({ message: "Cupom criado com sucesso" });

  } catch (error) {
    console.error("Erro criarCupom:", error);
    res.status(500).json({ error: "Erro ao criar cupom" });
  }
}