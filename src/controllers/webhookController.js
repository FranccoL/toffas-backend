import pool from "../config/db.js";
import axios from "axios";
import { enviarEmailRastreio } from "../services/emailService.js";


// ======================================================
// FUNÇÃO: CRIAR ENVIO NO MELHOR ENVIO
// ======================================================
async function criarEnvioMelhorEnvio(pedidoId) {
  try {

    const [pedido] = await pool.query(
      `SELECT p.*, c.nome, c.email, c.telefone, c.cep,
              c.endereco, c.numero, c.bairro, c.cidade, c.estado
       FROM pedidos p
       JOIN clientes c ON p.cliente_id = c.id
       WHERE p.id = ?`,
      [pedidoId]
    );

    if (!pedido.length) throw new Error("Pedido não encontrado");

    const pedidoData = pedido[0];

    if (pedidoData.melhor_envio_id) {
      console.log("Envio já existe.");
      return;
    }

    const [itens] = await pool.query(
      "SELECT * FROM pedido_itens WHERE pedido_id = ?",
      [pedidoId]
    );

    const cart = await axios.post(
      "https://sandbox.melhorenvio.com.br/api/v2/me/cart",
      {
        from: {
          name: "Toffa's Coffee",
          phone: "11915387618",
          email: "contato@toffascoffee.com.br",
          document: "59193787000106",
          address: "Rua Giacinto Tognato",
          number: "63",
          district: "Baeta Neves",
          city: "São Bernardo do Campo",
          state_abbr: "SP",
          postal_code: "09760370"
        },
        to: {
          name: pedidoData.nome,
          phone: pedidoData.telefone,
          email: pedidoData.email,
          address: pedidoData.endereco,
          number: pedidoData.numero,
          district: pedidoData.bairro,
          city: pedidoData.cidade,
          state_abbr: pedidoData.estado,
          postal_code: pedidoData.cep
        },
        products: itens.map(item => ({
          name: item.nome_produto,
          quantity: item.quantidade,
          unitary_value: item.preco,
          weight: 0.3,
          width: 12,
          height: 4,
          length: 16
        }))
      },
      {
        headers: {
          Authorization: `Bearer ${process.env.MELHOR_ENVIO_TOKEN}`
        }
      }
    );

    const envioId = cart.data.id;

    await axios.post(
      `https://sandbox.melhorenvio.com.br/api/v2/me/cart/${envioId}/checkout`,
      {},
      { headers: { Authorization: `Bearer ${process.env.MELHOR_ENVIO_TOKEN}` } }
    );

    const etiqueta = await axios.post(
      `https://sandbox.melhorenvio.com.br/api/v2/me/cart/${envioId}/generate`,
      {},
      { headers: { Authorization: `Bearer ${process.env.MELHOR_ENVIO_TOKEN}` } }
    );

    const codigoRastreio = etiqueta.data.tracking;
    const linkRastreio = `https://melhorenvio.com.br/rastreio/${codigoRastreio}`;

    await pool.query(
      `UPDATE pedidos
       SET status = ?, codigo_rastreio = ?, melhor_envio_id = ?
       WHERE id = ?`,
      ["ENVIADO", codigoRastreio, envioId, pedidoId]
    );

    await enviarEmailRastreio(
      pedidoData.email,
      pedidoData.nome,
      codigoRastreio,
      linkRastreio
    );

  } catch (error) {
    console.error("Erro Melhor Envio:", error.response?.data || error);
    throw error;
  }
}


// ======================================================
// CRIAR PEDIDO
// ======================================================
export async function criarPedido(req, res) {

  
  const { cliente, itens, cupom } = req.body;
  let frete = parseFloat(req.body.frete) || 0; // 🔒 garante número
  let connection;
  
  try {

    connection = await pool.getConnection();
    await connection.beginTransaction();

    // ===============================
    // CLIENTE
    // ===============================
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

    // ===============================
    // SUBTOTAL
    // ===============================
    let subtotal = 0;

    for (const item of itens) {
      const [produtoRes] = await connection.query(
        "SELECT preco FROM produtos WHERE id = ?",
        [item.id]
      );

      if (!produtoRes.length)
        throw new Error("Produto não encontrado");

      const preco = parseFloat(produtoRes[0].preco) || 0;
      subtotal += preco * item.quantidade;
    }

    subtotal = Number(subtotal.toFixed(2));

    // ===============================
    // VALIDAR CUPOM
    // ===============================
    let desconto = 0;
    let cupomCodigo = null;
    let cupomId = null;

    if (cupom) {
      const cupomNormalizado = cupom.trim().toUpperCase();
      const [cupomData] = await connection.query(
  "SELECT * FROM cupons WHERE UPPER(codigo) = ? AND ativo = 1",
  [cupomNormalizado]
);

      if (!cupomData.length)
        throw new Error("Cupom inválido");

      const c = cupomData[0];

      if (c.validade && new Date(c.validade) < new Date())
        throw new Error("Cupom expirado");

      if (c.uso_maximo && c.usos >= c.uso_maximo)
        throw new Error("Cupom esgotado");

      // PRIMEIRA COMPRA
      if (c.primeira_compra) {
        const [pedidosPagos] = await connection.query(
          "SELECT id FROM pedidos WHERE cliente_id = ? AND status IN ('PAGO','ENVIADO')",
          [clienteId]
        );

        if (pedidosPagos.length > 0)
          throw new Error("Cupom válido apenas para primeira compra");
      }

      // USO ÚNICO POR CLIENTE
      if (c.uso_por_cliente) {
        const [usado] = await connection.query(
          "SELECT id FROM cupom_usos WHERE cupom_id = ? AND cliente_id = ?",
          [c.id, clienteId]
        );

        if (usado.length > 0)
          throw new Error("Você já utilizou este cupom");
      }

      // FRETE GRÁTIS
      if (c.frete_gratis) {
        frete = 0;
      }

      const valorCupom = parseFloat(c.valor) || 0;

      if (c.tipo === "percentual") {
        desconto = (subtotal * valorCupom) / 100;
      } else {
        desconto = valorCupom;
      }

      if (desconto > subtotal)
        desconto = subtotal;

      desconto = Number(desconto.toFixed(2));

      cupomCodigo = cupomNormalizado;
      cupomId = c.id;
    }

    // ===============================
    // TOTAL FINAL
    // ===============================
    const total = Number((subtotal - desconto + frete).toFixed(2));

    if (isNaN(total))
      throw new Error("Erro no cálculo do pedido");

    const [pedidoResult] = await connection.query(
      `INSERT INTO pedidos 
      (cliente_id, subtotal, frete, desconto, total, cupom_codigo, status)
      VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        clienteId,
        subtotal,
        frete,
        desconto,
        total,
        cupomCodigo,
        "AGUARDANDO_PAGAMENTO"
      ]
    );

    const pedidoId = pedidoResult.insertId;

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

    await connection.commit();

    res.status(201).json({ status: "ok", pedidoId });

  } catch (error) {
    if (connection) await connection.rollback();
    console.error("Erro criarPedido:", error);
    res.status(500).json({ error: error.message });
  } finally {
    if (connection) connection.release();
  }
}

// ======================================================
// WEBHOOK MERCADO PAGO
// ======================================================
export async function mercadoPagoWebhook(req, res) {
  try {

    const paymentId = req.body?.data?.id;
    const topic = req.body?.type;

    if (!paymentId || topic !== "payment")
      return res.status(200).json({ ignored: true });

    const pagamento = await buscarPagamentoMercadoPago(paymentId);

    const status = pagamento.status;
    const pedidoId = pagamento.external_reference;

    if (!pedidoId)
      return res.status(400).json({ error: "Pedido não encontrado" });

    // 🔒 PROTEÇÃO CONTRA DUPLICAÇÃO
    const [pedidoAtual] = await pool.query(
      "SELECT status, cliente_id, cupom_codigo FROM pedidos WHERE id = ?",
      [pedidoId]
    );

    if (!pedidoAtual.length)
      return res.status(404).json({ error: "Pedido inexistente" });

    if (pedidoAtual[0].status === "PAGO" || pedidoAtual[0].status === "ENVIADO")
      return res.status(200).json({ already_processed: true });

    if (status === "approved") {

      await pool.query(
        `UPDATE pedidos 
         SET status = ?, mercado_pago_payment_id = ?
         WHERE id = ?`,
        ["PAGO", paymentId, pedidoId]
      );

      // 🎟 CONSUMIR CUPOM AQUI
      if (pedidoAtual[0].cupom_codigo) {

        const [cupom] = await pool.query(
          "SELECT * FROM cupons WHERE codigo = ?",
          [pedidoAtual[0].cupom_codigo]
        );

        if (cupom.length) {

          await pool.query(
            "UPDATE cupons SET usos = usos + 1 WHERE id = ?",
            [cupom[0].id]
          );

          if (cupom[0].uso_por_cliente) {
            await pool.query(
              `INSERT IGNORE INTO cupom_usos
               (cupom_id, cliente_id, pedido_id)
               VALUES (?, ?, ?)`,
              [cupom[0].id, pedidoAtual[0].cliente_id, pedidoId]
            );
          }
        }
      }

      await criarEnvioMelhorEnvio(pedidoId);
    }

    if (status === "cancelled") {
      await pool.query(
        `UPDATE pedidos 
         SET status = ?, mercado_pago_payment_id = ?
         WHERE id = ?`,
        ["CANCELADO", paymentId, pedidoId]
      );
    }

    return res.status(200).json({ received: true });

  } catch (error) {
    console.error("Erro webhook:", error);
    return res.status(500).json({ error: "Erro interno" });
  }
}


// ======================================================
// BUSCAR PAGAMENTO MERCADO PAGO
// ======================================================
async function buscarPagamentoMercadoPago(paymentId) {
  const response = await axios.get(
    `https://api.mercadopago.com/v1/payments/${paymentId}`,
    {
      headers: {
        Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}`
      }
    }
  );

  return response.data;
}