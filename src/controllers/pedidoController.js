import pool from "../config/db.js";
import axios from "axios";

export async function criarPedido(req, res) {
  const { cliente, itens } = req.body;
  const freteObj = req.body.frete || {};

  let freteValor = 0;

if (freteObj && freteObj.valor !== undefined && freteObj.valor !== null) {
  freteValor = parseFloat(freteObj.valor);
  if (isNaN(freteValor)) freteValor = 0;
}

const freteMetodo = freteObj?.metodo ?? null;
const fretePrazo = freteObj?.prazo ?? null;

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // =========================
    // CLIENTE
    // =========================

    const [existe] = await connection.query(
      "SELECT id FROM clientes WHERE email = ?",
      [cliente.email]
    );

    let clienteId;

    if (existe.length > 0) {
      clienteId = existe[0].id;
    } else {
      const [clienteResult] = await connection.query(
        `INSERT INTO clientes 
        (nome, email, telefone, cep, endereco, numero, bairro, cidade, estado)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cliente.nome,
          cliente.email,
          cliente.telefone,
          cliente.cep,
          cliente.endereco,
          cliente.numero,
          cliente.bairro,
          cliente.cidade,
          cliente.estado
        ]
      );

      clienteId = clienteResult.insertId;
    }

    // =========================
    // CALCULAR SUBTOTAL
    // =========================

    let subtotal = 0;
    const produtosParaMP = [];

    for (const item of itens) {
      const [produtoRes] = await connection.query(
        "SELECT nome, preco FROM produtos WHERE id = ?",
        [item.id]
      );

      if (!produtoRes.length)
        throw new Error("Produto não encontrado");

      const produto = produtoRes[0];
      const preco = Number(produto.preco);

      subtotal += preco * item.quantidade;

      produtosParaMP.push({
        title: produto.nome,
        quantity: Number(item.quantidade),
        unit_price: preco,
        currency_id: "BRL"
      });
    }

    subtotal = Number(subtotal.toFixed(2));
    const total = Number((subtotal + freteValor).toFixed(2));

    // =========================
    // CRIAR PEDIDO
    // =========================

    const [pedidoResult] = await connection.query(
      `INSERT INTO pedidos 
      (cliente_id, subtotal, frete_valor, frete_metodo, frete_prazo, total, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        clienteId,
        subtotal,
        freteValor ?? 0,
        freteMetodo || null,
        fretePrazo || null,
        total,
        "AGUARDANDO_PAGAMENTO"
      ]
    );

    const pedidoId = pedidoResult.insertId;

    // =========================
    // INSERIR ITENS
    // =========================

    for (const item of itens) {
      const [produtoRes] = await connection.query(
        "SELECT nome, preco FROM produtos WHERE id = ?",
        [item.id]
      );

      const produto = produtoRes[0];

      await connection.query(
        `INSERT INTO pedido_itens
        (pedido_id, produto_id, nome_produto, tamanho, quantidade, preco)
        VALUES (?, ?, ?, ?, ?, ?)`,
        [
          pedidoId,
          item.id,
          produto.nome,
          item.tamanho,
          item.quantidade,
          produto.preco
        ]
      );
    }

    // 🔥 FINALIZA TRANSAÇÃO ANTES DO MERCADO PAGO
    await connection.commit();
    connection.release();

    // =========================
    // CRIAR PREFERÊNCIA MERCADO PAGO
    // =========================

    const mpPreference = {
      items: produtosParaMP,
      payer: {
        name: cliente.nome,
        email: cliente.email
      },
      external_reference: String(pedidoId),
      notification_url: `${process.env.BACKEND_URL}/webhook/mercadopago`,
      back_urls: {
        success: "https://toffascoffee.com.br/pedido/sucesso",
        failure: "https://toffascoffee.com.br/pedido/falha",
        pending: "https://toffascoffee.com.br/pedido/pendente"
      },
      auto_return: "approved"
    };

    const { data: mpData } = await axios.post(
      "https://api.mercadopago.com/checkout/preferences",
      mpPreference,
      {
        headers: {
          Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`
        }
      }
    );

    // Atualiza preference_id (nova conexão curta)
    await pool.query(
      `UPDATE pedidos 
       SET mercado_pago_preference_id = ?
       WHERE id = ?`,
      [mpData.id, pedidoId]
    );

    return res.status(201).json({
      status: "ok",
      pedidoId,
      pagamento: {
        redirect_url: mpData.init_point
      }
    });

  } catch (error) {
    console.error("Erro ao criar pedido:", error);

    if (connection) {
      try {
        await connection.rollback();
        connection.release();
      } catch {}
    }

    return res.status(500).json({
      error: error.message
    });
  }
}