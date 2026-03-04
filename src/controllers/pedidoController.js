import pool from "../config/db.js";
import axios from "axios";

export async function criarPedido(req, res) {
  const { cliente, itens } = req.body;
  const freteObj = req.body.frete || {};

  const freteValor = Number(String(freteObj.valor).replace(",", ".")) || 0;
  const freteMetodo = freteObj.metodo || null;
  const fretePrazo = freteObj.prazo || null;

  let connection;
  console.log("📦 Frete recebido:", JSON.stringify(freteObj), "→ Parsed:", freteValor);
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // =========================
    // BUSCAR OU CRIAR CLIENTE
    // =========================
    const [clienteExistente] = await connection.query(
      "SELECT id FROM clientes WHERE email = ?",
      [cliente.email]
    );

    let clienteId;

    if (clienteExistente.length) {
      clienteId = clienteExistente[0].id;
    } else {
      const [novoCliente] = await connection.query(
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
      clienteId = novoCliente.insertId;
    }

    // =========================
    // BUSCAR TODOS PRODUTOS DE UMA VEZ
    // =========================
    const ids = itens.map(i => i.id);
    const [produtosBanco] = await connection.query(
      `SELECT id, nome, preco FROM produtos WHERE id IN (?)`,
      [ids]
    );

    if (!produtosBanco.length) {
      throw new Error("Produtos não encontrados");
    }

    let subtotal = 0;
    const produtosParaMP = [];

    for (const item of itens) {
      const produto = produtosBanco.find(p => p.id === item.id);

      if (!produto) {
        throw new Error(`Produto não encontrado ID: ${item.id}`);
      }

      const preco = Number(produto.preco);

      if (isNaN(preco)) {
        throw new Error(`Preço inválido no banco: ${produto.nome}`);
      }

      const quantidade = Number(item.quantidade) || 1;

      subtotal += preco * quantidade;

      produtosParaMP.push({
        title: produto.nome,
        quantity: quantidade,
        unit_price: preco,
        currency_id: "BRL"
      });
    }

    subtotal = Number(subtotal.toFixed(2));
    const total = Number((subtotal + freteValor).toFixed(2));

    // Frete como item separado
    if (freteValor > 0) {
      produtosParaMP.push({
        title: `Frete (${freteMetodo})`,
        quantity: 1,
        unit_price: freteValor,
        currency_id: "BRL"
      });
    }

    console.log("🛒 Produtos MP:", produtosParaMP);
    console.log("💰 Total esperado:", total);

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
        freteValor,
        freteMetodo,
        fretePrazo,
        total,
        "AGUARDANDO_PAGAMENTO"
      ]
    );

    const pedidoId = pedidoResult.insertId;

    // =========================
    // INSERIR ITENS (SEM SELECT DE NOVO)
    // =========================
    for (const item of itens) {
      const produto = produtosBanco.find(p => p.id === item.id);

      await connection.query(
        `INSERT INTO pedido_itens
         (pedido_id, produto_id, nome_produto, tamanho, quantidade, preco)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          pedidoId,
          produto.id,
          produto.nome,
          item.tamanho,
          item.quantidade,
          produto.preco
        ]
      );
    }

    await connection.commit();

    // =========================
    // MERCADO PAGO
    // =========================
    const mpPreference = {
      items: produtosParaMP,
      payer: { name: cliente.nome, email: cliente.email },
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
      { headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` } }
    );

    await pool.query(
      `UPDATE pedidos SET mercado_pago_preference_id = ? WHERE id = ?`,
      [mpData.id, pedidoId]
    );

    return res.status(201).json({
      status: "ok",
      pedidoId,
      pagamento: { redirect_url: mpData.init_point }
    });

  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Erro criarPedido:", error);
    return res.status(500).json({ error: error.message });
  } finally {
    if (connection) connection.release();
  }
}