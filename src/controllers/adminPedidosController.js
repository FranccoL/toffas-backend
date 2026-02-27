import pool from "../config/db.js";

export async function atualizarStatusPedido(req, res) {
  const { pedidoId } = req.params;
  const { status } = req.body;

  const statusValidos = ["ENVIADO", "ENTREGUE"];

  if (!statusValidos.includes(status)) {
    return res.status(400).json({ error: "Status inválido" });
  }

  let query = "";
  let params = [];

  if (status === "ENVIADO") {
    query = `
      UPDATE pedidos
      SET status = ?,
          data_envio = NOW()
      WHERE id = ?
        AND status = 'PAGO'
    `;
    params = [status, pedidoId];
  }

  if (status === "ENTREGUE") {
    query = `
      UPDATE pedidos
      SET status = ?,
          data_entrega = NOW()
      WHERE id = ?
        AND status = 'ENVIADO'
    `;
    params = [status, pedidoId];
  }

  try {
    const [result] = await pool.query(query, params);

    if (result.affectedRows === 0) {
      return res.status(400).json({
        error: "Pedido não encontrado ou transição inválida"
      });
    }

    return res.json({ ok: true });

  } catch (error) {
    console.error("Erro ao atualizar status:", error);
    return res.status(500).json({ error: "Erro interno" });
  }
}
