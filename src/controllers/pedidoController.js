import pool from "../config/db.js";
import axios from "axios";
import nodemailer from "nodemailer";
 
export async function criarPedido(req, res) {
  const { cliente, itens, cupom } = req.body;
  const freteObj = req.body.frete || {};
 
  let freteValor = Number(String(freteObj.valor).replace(",", ".")) || 0;
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
        (nome, email, telefone, cep, endereco, numero, complemento, bairro, cidade, estado)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          cliente.nome,
          cliente.email,
          cliente.telefone,
          cliente.cep,
          cliente.endereco,
          cliente.numero,
          cliente.complemento || "",
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
 
    // =========================
    // VALIDAR E APLICAR CUPOM
    // =========================
    let desconto = 0;
    let cupomCodigo = null;
 
    if (cupom) {
      const cupomNormalizado = cupom.trim().toUpperCase();
      const [cupomData] = await connection.query(
        "SELECT * FROM cupons WHERE UPPER(codigo) = ? AND ativo = 1",
        [cupomNormalizado]
      );
 
      if (cupomData.length) {
        const c = cupomData[0];
        let cupomValido = true;
 
        if (c.validade && new Date(c.validade) < new Date()) {
          cupomValido = false;
        }
 
        if (c.uso_maximo && c.usos >= c.uso_maximo) {
          cupomValido = false;
        }
 
        if (c.primeira_compra) {
          const [pedidosPagos] = await connection.query(
            "SELECT id FROM pedidos WHERE cliente_id = ? AND status IN ('PAGO','ENVIADO')",
            [clienteId]
          );
          if (pedidosPagos.length > 0) cupomValido = false;
        }
 
        if (c.uso_por_cliente) {
          const [usado] = await connection.query(
            "SELECT id FROM cupom_usos WHERE cupom_id = ? AND cliente_id = ?",
            [c.id, clienteId]
          );
          if (usado.length > 0) cupomValido = false;
        }
 
        if (cupomValido) {
          if (c.frete_gratis) {
            freteValor = 0;
          }
 
          const valorCupom = parseFloat(c.valor) || 0;
 
          if (c.tipo === "percentual") {
            desconto = (subtotal * valorCupom) / 100;
          } else {
            desconto = valorCupom;
          }
 
          if (desconto > subtotal) desconto = subtotal;
          desconto = Number(desconto.toFixed(2));
          cupomCodigo = cupomNormalizado;
        }
      }
    }
 
    const total = Number((subtotal - desconto + freteValor).toFixed(2));
 
    // Ajustar preços para o Mercado Pago (aplicar desconto proporcional)
    if (desconto > 0 && subtotal > 0) {
      const fator = (subtotal - desconto) / subtotal;
      for (const item of produtosParaMP) {
        item.unit_price = Number((item.unit_price * fator).toFixed(2));
      }
    }
 
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
       (cliente_id, subtotal, frete_valor, frete_metodo, frete_prazo, total, status, cupom_codigo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        clienteId,
        subtotal,
        freteValor,
        freteMetodo,
        fretePrazo,
        total,
        "AGUARDANDO_PAGAMENTO",
        cupomCodigo
      ]
    );
 
    const pedidoId = pedidoResult.insertId;
 
    // =========================
    // INSERIR ITENS
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
    const cpfLimpo = (cliente.cpf || "").replace(/\D/g, "");

    const mpPreference = {
      items: produtosParaMP,
      payer: {
        name: cliente.nome,
        email: cliente.email,
        identification: cpfLimpo ? { type: "CPF", number: cpfLimpo } : undefined
      },
      external_reference: String(pedidoId),
      statement_descriptor: "TOFFASCOFFEE",
      notification_url: `${process.env.BACKEND_URL}/webhook/mercadopago`,
      back_urls: {
        success: `${process.env.FRONTEND_URL || "https://toffascoffee.com.br"}/pedido/sucesso`,
        failure: `${process.env.FRONTEND_URL || "https://toffascoffee.com.br"}/pedido/falha`,
        pending: `${process.env.FRONTEND_URL || "https://toffascoffee.com.br"}/pedido/pendente`
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
 
    // Notifica o dono da loja sobre novo pedido
    try {
      const emailTransporter = nodemailer.createTransport({
        service: "gmail",
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });

      const destinatario = process.env.RECIPIENT_EMAIL || process.env.EMAIL_USER;
      if (destinatario) {
        const itensHtml = itens.map(item => {
          const produto = produtosBanco.find(p => p.id === item.id);
          return `<tr>
            <td style="padding:8px 12px; border-bottom:1px solid #eee;">${produto.nome}</td>
            <td style="padding:8px 12px; border-bottom:1px solid #eee; text-align:center;">${item.quantidade}</td>
            <td style="padding:8px 12px; border-bottom:1px solid #eee; text-align:right;">R$ ${Number(produto.preco).toFixed(2).replace(".", ",")}</td>
          </tr>`;
        }).join("");

        await emailTransporter.sendMail({
          from: `"Toffa's Coffee" <${process.env.EMAIL_USER}>`,
          to: destinatario,
          subject: `Novo pedido #${pedidoId} - R$ ${total.toFixed(2).replace(".", ",")}`,
          html: `
            <div style="font-family: Arial, sans-serif; max-width:600px; margin:0 auto;">
              <div style="background:#000; padding:24px; text-align:center;">
                <h1 style="color:#fff; margin:0; font-size:22px;">Novo Pedido Recebido!</h1>
              </div>
              <div style="padding:24px;">
                <p><strong>Pedido #${pedidoId}</strong></p>
                <p><strong>Cliente:</strong> ${cliente.nome} (${cliente.email})</p>
                <table style="width:100%; border-collapse:collapse; margin:16px 0;">
                  <thead><tr style="background:#f7f7f7;">
                    <th style="padding:10px 12px; text-align:left;">Produto</th>
                    <th style="padding:10px 12px; text-align:center;">Qtd</th>
                    <th style="padding:10px 12px; text-align:right;">Preco</th>
                  </tr></thead>
                  <tbody>${itensHtml}</tbody>
                </table>
                <p><strong>Total: R$ ${total.toFixed(2).replace(".", ",")}</strong></p>
                <p style="color:#888;">Status: Aguardando pagamento</p>
              </div>
            </div>
          `
        });
      }
    } catch (emailErr) {
      console.error("Erro ao enviar email de notificacao:", emailErr);
    }

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