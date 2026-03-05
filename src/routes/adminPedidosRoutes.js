import { Router } from "express";
import autenticarAdmin from "../middlewares/authAdmin.js";
import { atualizarStatusPedido } from "../controllers/adminPedidosController.js";
import pool from "../config/db.js";
 
const router = Router();
 
// Listar todos os pedidos
router.get("/pedidos", autenticarAdmin, async (req, res) => {
  try {
    const [pedidos] = await pool.query(`
      SELECT p.id, c.nome AS nome_cliente, p.total, p.status,
             p.data_envio, p.data_entrega, p.criado_em
      FROM pedidos p
      JOIN clientes c ON c.id = p.cliente_id
      ORDER BY p.id DESC
    `);
    res.json(pedidos);
  } catch (err) {
    console.error("Erro listar pedidos:", err);
    res.status(500).json({ error: "Erro ao listar pedidos" });
  }
});
 
// Detalhe de um pedido
router.get("/pedidos/:id", autenticarAdmin, async (req, res) => {
  try {
    const [pedidoRows] = await pool.query(`
      SELECT p.*, c.nome AS cliente_nome, c.email AS cliente_email
      FROM pedidos p
      JOIN clientes c ON c.id = p.cliente_id
      WHERE p.id = ?
    `, [req.params.id]);
 
    if (!pedidoRows.length) {
      return res.status(404).json({ error: "Pedido não encontrado" });
    }
 
    const pedido = pedidoRows[0];
 
    const [itens] = await pool.query(
      "SELECT nome_produto AS nome, quantidade, preco FROM pedido_itens WHERE pedido_id = ?",
      [req.params.id]
    );
 
    res.json({
      id: pedido.id,
      status: pedido.status,
      total: Number(pedido.total),
      subtotal: Number(pedido.subtotal),
      frete_valor: Number(pedido.frete_valor),
      data_envio: pedido.data_envio,
      data_entrega: pedido.data_entrega,
      cliente: { nome: pedido.cliente_nome, email: pedido.cliente_email },
      itens: itens.map(i => ({ ...i, preco: Number(i.preco) }))
    });
  } catch (err) {
    console.error("Erro detalhe pedido:", err);
    res.status(500).json({ error: "Erro ao carregar pedido" });
  }
});
 
// Atualizar status
router.patch("/pedidos/:pedidoId/status", autenticarAdmin, atualizarStatusPedido);
 
export default router;