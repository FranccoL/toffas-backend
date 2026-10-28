import { Router } from "express";
import autenticarAdmin from "../middlewares/authAdmin.js";
import { atualizarStatusPedido } from "../controllers/adminPedidosController.js";
import pool from "../config/db.js";
 
const router = Router();
 
// Listar todos os pedidos
router.get("/pedidos", autenticarAdmin, async (req, res) => {
  try {
    const [pedidos] = await pool.query(`
      SELECT p.id, c.nome AS nome_cliente, c.email AS email_cliente,
             c.telefone AS telefone_cliente, p.total, p.status,
             NULL AS data_envio, NULL AS data_entrega,
             p.data_criacao AS criado_em, p.codigo_rastreio
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
      SELECT p.*,
             c.nome AS cliente_nome,
             c.email AS cliente_email,
             c.cpf AS cliente_cpf,
             c.telefone AS cliente_telefone,
             c.cep AS cliente_cep,
             c.endereco AS cliente_endereco,
             c.numero AS cliente_numero,
             c.complemento AS cliente_complemento,
             c.bairro AS cliente_bairro,
             c.cidade AS cliente_cidade,
             c.estado AS cliente_estado
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
      data_envio: pedido.data_envio ?? null,
      data_entrega: pedido.data_entrega ?? null,
      codigo_rastreio: pedido.codigo_rastreio ?? null,
      cliente: {
        nome: pedido.cliente_nome,
        email: pedido.cliente_email,
        cpf: pedido.cliente_cpf,
        telefone: pedido.cliente_telefone,
        cep: pedido.cliente_cep,
        endereco: pedido.cliente_endereco,
        numero: pedido.cliente_numero,
        complemento: pedido.cliente_complemento,
        bairro: pedido.cliente_bairro,
        cidade: pedido.cliente_cidade,
        estado: pedido.cliente_estado
      },
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