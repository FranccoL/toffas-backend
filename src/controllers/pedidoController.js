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
  try {
    connection = await pool.getConnection();
    await connection.beginTransaction();
 
    // 1. BUSCAR OU CRIAR CLIENTE
    const [clienteExistente] = await connection.query(
      "SELECT id FROM clientes WHERE email = ?",
      [cliente.email]
    );
 
    let clienteId;
    if (clienteExistente.length) {
      clienteId = clienteExistente[0].id;
    } else {
      const [novoCliente] = await connection.query(
        `INSERT INTO clientes (nome, email, telefone, cep, endereco, numero, complemento, bairro, cidade, estado)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [cliente.nome, cliente.email, cliente.telefone, cliente.cep, cliente.endereco, cliente.numero, cliente.complemento || "", cliente.bairro, cliente.cidade, cliente.estado]
      );
      clienteId = novoCliente.insertId;
    }
 
    // 2. BUSCAR PRODUTOS E CALCULAR SUBTOTAL
    const ids = itens.map(i => i.id);
    const [produtosBanco] = await connection.query(`SELECT id, nome, preco FROM produtos WHERE id IN (?)`, [ids]);
 
    let subtotal = 0;
    const produtosParaMP = [];
 
    for (const item of itens) {
      const produto = produtosBanco.find(p => p.id === item.id);
      const preco = Number(produto.preco);
      const quantidade = Number(item.quantity) || 1;
      subtotal += preco * quantidade;
 
      produtosParaMP.push({
        title: produto.nome,
        quantity: quantidade,
        unit_price: preco,
        currency_id: "BRL"
      });
    }
 
    // 3. VALIDAR CUPOM E CALCULAR TOTAL
    let desconto = 0;
    let cupomCodigo = null;
    // ... (lógica de cupom simplificada para o exemplo, mantenha a sua original se preferir)
 
    const total = Number((subtotal - desconto + freteValor).toFixed(2));
 
    // 4. CRIAR PEDIDO NO BANCO
    const [pedidoResult] = await connection.query(
      `INSERT INTO pedidos (cliente_id, subtotal, frete_valor, frete_metodo, frete_prazo, total, status, cupom_codigo)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [clienteId, subtotal, freteValor, freteMetodo, fretePrazo, total, "AGUARDANDO_PAGAMENTO", cupomCodigo]
    );
    const pedidoId = pedidoResult.insertId;
 
    for (const item of itens) {
      const produto = produtosBanco.find(p => p.id === item.id);
      await connection.query(
        `INSERT INTO pedido_itens (pedido_id, produto_id, nome_produto, tamanho, quantidade, preco)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [pedidoId, produto.id, produto.nome, item.tamanho, item.quantity, produto.preco]
      );
    }
 
    await connection.commit();
 
    // 5. GERAR LINK NO MERCADO PAGO
    const mpPreference = {
      items: produtosParaMP,
      payer: { name: cliente.nome, email: cliente.email },
      external_reference: String(pedidoId),
      notification_url: `${process.env.BACKEND_URL}/webhook/mercadopago`,
      back_urls: {
        success: `${process.env.FRONTEND_URL}/pedido/sucesso`,
        failure: `${process.env.FRONTEND_URL}/pedido/falha`,
        pending: `${process.env.FRONTEND_URL}/pedido/pendente`
      },
      auto_return: "approved"
    };
 
    const { data: mpData } = await axios.post(
      "https://api.mercadopago.com/checkout/preferences",
      mpPreference,
      { headers: { Authorization: `Bearer ${process.env.MP_ACCESS_TOKEN}` } }
     );
 
    await pool.query(`UPDATE pedidos SET mercado_pago_preference_id = ? WHERE id = ?`, [mpData.id, pedidoId]);
 
    // 6. NOTIFICAÇÃO AO DONO (EM SEGUNDO PLANO - NÃO BLOQUEIA O CLIENTE)
    (async () => {
      try {
        const emailTransporter = nodemailer.createTransport({
          service: "gmail",
          auth: { user: process.env.EMAIL_USER, pass: process.env.EMAIL_PASS }
        });
        const destinatario = process.env.RECIPIENT_EMAIL || process.env.EMAIL_USER;
        if (destinatario) {
          await emailTransporter.sendMail({
            from: `"Toffa's Coffee" <${process.env.EMAIL_USER}>`,
            to: destinatario,
            subject: `Novo pedido #${pedidoId} iniciado`,
            html: `<p>Um novo pedido foi iniciado no site. Aguardando pagamento.</p>`
          });
        }
      } catch (err) { console.error("Erro e-mail background:", err); }
    })();
 
    // 7. RETORNA O LINK IMEDIATAMENTE
    return res.status(201).json({
      status: "ok",
      pedidoId,
      pagamento: { redirect_url: mpData.init_point }
    });
 
  } catch (error) {
    if (connection) await connection.rollback();
    return res.status(500).json({ error: error.message });
  } finally {
    if (connection) connection.release();
  }
}
