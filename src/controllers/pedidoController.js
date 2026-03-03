import pool from "../config/db.js";
import axios from "axios";

// Criar pedido + gerar link Mercado Pago
export async function criarPedido(req, res) {
  const { cliente, itens } = req.body;
  const frete = Number(req.body.frete) || 0;

  let connection;

  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();

    
    // CLIENTE
    

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
         (nome, email, cpf, telefone, cep, endereco, numero, bairro, cidade, estado)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cliente.nome,
          cliente.email,
          cliente.cpf,
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

    // ==============================
    // CALCULAR SUBTOTAL
    

    let subtotal = 0;
    const produtosParaMP = [];

    for (const item of itens) {
      const [produtoRes] = await connection.query(
        "SELECT nome, preco FROM produtos WHERE id = ?",
        [item.id]
      );

      if (produtoRes.length === 0)
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
    const total = Number((subtotal + frete).toFixed(2));

    
    // CRIAR PEDIDO
    

    const [pedidoResult] = await connection.query(
      `INSERT INTO pedidos 
       (cliente_id, subtotal, frete, total, status)
       VALUES (?, ?, ?, ?, ?)`,
      [clienteId, subtotal, frete, total, "AGUARDANDO_PAGAMENTO"]
    );

    const pedidoId = pedidoResult.insertId;

    
    // INSERIR ITENS
    

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
   
    // CRIAR PREFERÊNCIA MERCADO PAGO
    
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
    
    // SALVAR PREFERENCE ID
   
    await connection.query(
      `UPDATE pedidos 
       SET mercado_pago_preference_id = ?
       WHERE id = ?`,
      [mpData.id, pedidoId]
    );

    await connection.commit();

    // RETORNAR LINK PARA FRONT

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