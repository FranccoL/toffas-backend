import { Router } from "express";
import pool from "../config/db.js";
import autenticarAdmin from "../middlewares/authAdmin.js";
import { atualizarStatusPedido } from "../controllers/adminPedidosController.js";

const router = Router();

// LISTAR TODOS OS PEDIDOS
router.get("/pedidos", autenticarAdmin, async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT
        p.id,
        p.total,
        p.status,
        p.data_envio,
        p.data_entrega,
        c.nome AS nome_cliente
      FROM pedidos p
      JOIN clientes c ON c.id = p.cliente_id
      ORDER BY p.id DESC
    `);

    res.json(rows);
  } catch (err) {
    console.error("Erro ao listar pedidos:", err);
    res.status(500).json({ error: "Erro ao listar pedidos" });
  }
});

// 🔹 BUSCAR PEDIDO POR ID COM DETALHES
router.get("/pedidos/:id", autenticarAdmin, async (req, res) => {
  const { id } = req.params;

  try {
    // Buscar pedido + cliente
    const [pedidoRows] = await pool.query(
      `
      SELECT
        p.id,
        p.total,
        p.status,
        p.data_envio,
        p.data_entrega,
        c.nome AS cliente_nome,
        c.email AS cliente_email
      FROM pedidos p
      JOIN clientes c ON c.id = p.cliente_id
      WHERE p.id = ?
      `,
      [id]
    );

    if (pedidoRows.length === 0) {
      return res.status(404).json({ error: "Pedido não encontrado" });
    }

    // Buscar itens do pedido
    const [itensRows] = await pool.query(
      `
      SELECT
        nome_produto AS nome,
        quantidade,
        preco
      FROM pedido_itens
      WHERE pedido_id = ?
      `,
      [id]
    );

    const pedido = pedidoRows[0];

    res.json({
      id: pedido.id,
      status: pedido.status,
      total: Number(pedido.total),
      data_envio: pedido.data_envio,
      data_entrega: pedido.data_entrega,
      cliente: {
        nome: pedido.cliente_nome,
        email: pedido.cliente_email
      },
      itens: itensRows
    });

  } catch (err) {
    console.error("Erro ao buscar pedido:", err);
    res.status(500).json({ error: "Erro ao buscar pedido" });
  }
});

// ATUALIZAR STATUS DO PEDIDO
router.patch(
  "/pedidos/:pedidoId/status",
  autenticarAdmin,
  atualizarStatusPedido
);

export default router;
