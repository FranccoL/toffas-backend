import pool from "../config/db.js";
import axios from "axios";

// Criar pedido + gerar link Mercado Pago
export async function criarPedido(req, res) {
  const { cliente, itens, frete } = req.body;

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    // 1️⃣ Cliente
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

    // 2️⃣ Subtotal
    let subtotal = 0;
    const produtosParaMP = [];

    for (const item of itens) {
      const [produtoRes] = await connection.query(
        "SELECT nome, preco FROM produtos WHERE id = ?",
        [item.id]
      );

      if (produtoRes.length === 0) throw new Error("Produto não encontrado");

      subtotal += produtoRes[0].preco * item.quantidade;

      // Monta os produtos para o MP
      produtosParaMP.push({
        title: produtoRes[0].nome,
        quantity: item.quantidade,
        unit_price: Number(produtoRes[0].preco)
      });
    }

    const total = subtotal + frete;

    // 3️⃣ Criar pedido no banco
    const [pedidoResult] = await connection.query(
      `INSERT INTO pedidos 
       (cliente_id, subtotal, frete, total, status)
       VALUES (?, ?, ?, ?, ?)`,
      [clienteId, subtotal, frete, total, "AGUARDANDO_PAGAMENTO"]
    );

    const pedidoId = pedidoResult.insertId;

    // 4️⃣ Inserir itens no pedido
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

    // 5️⃣ Criar preference no Mercado Pago
    const mpPreference = {
      items: produtosParaMP,
      payer: {
        email: cliente.email
      },
      external_reference: String(pedidoId),
      back_urls: {
        success: "http://localhost:3000/pedido/sucesso",
        failure: "http://localhost:3000/pedido/falha",
        pending: "http://localhost:3000/pedido/pendente"
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

    await connection.commit();

    res.status(201).json({
      status: "ok",
      pedidoId,
      pagamento: {
        status: "AGUARDANDO_PAGAMENTO",
        redirect_url: mpData.init_point
      }
    });

  } catch (error) {
    console.error("Erro ao criar pedido:", error);
    if (connection) await connection.rollback();
    res.status(500).json({ error: "Erro ao criar pedido" });
  } finally {
    if (connection) connection.release();
  }
}
