import pool from "../config/db.js";
import axios from "axios";
import nodemailer from "nodemailer";
 
export async function criarPedido(req, res) {
  const { cliente, itens, cupom } = req.body;
  const freteObj = req.body.frete || {};

  // ==========================================
  // VALIDAÇÃO DOS DADOS DO CLIENTE
  // ==========================================

  if (!cliente) {
    return res.status(400).json({
      error: "Dados do cliente não informados."
    });
  }

  // Remove pontos, traços e qualquer outro caractere
  const cpfNumeros = String(cliente.cpf || "").replace(/\D/g, "");

  // CPF precisa ter exatamente 11 números
  if (cpfNumeros.length !== 11) {
    return res.status(400).json({
      error: "CPF inválido ou não informado."
    });
  }
 
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
  // Cliente já existe: atualiza os dados
  clienteId = clienteExistente[0].id;

  await connection.query(
    `UPDATE clientes
     SET nome = ?,
       cpf = ?,
       telefone = ?,
       cep = ?,
       endereco = ?,
       numero = ?,
       complemento = ?,
       bairro = ?,
       cidade = ?,
       estado = ?
     WHERE id = ?`,
    [
      cliente.nome,
    cpfNumeros,
    cliente.telefone,
    cliente.cep,
    cliente.endereco,
    cliente.numero,
    cliente.complemento || "",
    cliente.bairro,
    cliente.cidade,
    cliente.estado,
    clienteId
    ]
  );

} else {
  // Cliente novo: salva todos os dados, incluindo CPF
  const [novoCliente] = await connection.query(
    `INSERT INTO clientes
     (nome, email, cpf, telefone, cep, endereco, numero, complemento, bairro, cidade, estado)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      cliente.nome,
    cliente.email,
    cpfNumeros,
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
    // 2. BUSCAR PRODUTOS E CALCULAR SUBTOTAL
    const ids = itens.map(i => i.id);
    const [produtosBanco] = await connection.query(`SELECT id, nome, preco FROM produtos WHERE id IN (?)`, [ids]);
 
    let subtotal = 0;
    const produtosParaMP = [];
 
    for (const item of itens) {
      const produto = produtosBanco.find(p => p.id === item.id);
      if (!produto) throw new Error(`Produto não encontrado ID: ${item.id}`);

      const preco = Number(produto.preco);
      const quantidade = Number(item.quantidade) || 1;
      subtotal += preco * quantidade;
 
      produtosParaMP.push({
        title: produto.nome,
        quantity: quantidade,
        unit_price: preco,
        currency_id: "BRL"
      });
    }
 
    // 3. VALIDAR E APLICAR CUPOM
    let desconto = 0;
    let cupomCodigo = null;

    if (cupom) {
      const cupomNormalizado = cupom.trim().toUpperCase();
      const [cupomData] = await connection.query(
        "SELECT * FROM cupons WHERE UPPER(codigo) = ? AND ativo = 1 LIMIT 1",
        [cupomNormalizado]
      );

      if (cupomData.length) {
        const c = cupomData[0];
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
 
    const total = Number((subtotal - desconto + freteValor).toFixed(2));

    // ============================================================
    // AJUSTE PARA O MERCADO PAGO (FRETE E DESCONTO)
    // ============================================================
    
    if (desconto > 0 && subtotal > 0) {
      const fatorDesconto = (subtotal - desconto) / subtotal;
      produtosParaMP.forEach(item => {
        item.unit_price = Number((item.unit_price * fatorDesconto).toFixed(2));
      });
    }

    if (freteValor > 0) {
      produtosParaMP.push({
        title: `Frete (${freteMetodo || 'Envio'})`,
        quantity: 1,
        unit_price: Number(freteValor.toFixed(2)),
        currency_id: "BRL"
      });
    }

    const produtosValidados = produtosParaMP.filter(item => item.unit_price > 0);
 
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
        [pedidoId, produto.id, produto.nome, item.tamanho, item.quantidade, produto.preco]
      );
    }
 
    await connection.commit();
 
    // 5. GERAR LINK NO MERCADO PAGO
    // Forçando a URL de notificação para garantir que o MP encontre o servidor
    const backendUrl = "https://toffas-backend.onrender.com";
    const notificationUrl = `${backendUrl}/webhook/mercadopago`;

    console.log(`🔗 Enviando Notification URL para o MP: ${notificationUrl}` );

    const mpPreference = {
      items: produtosValidados,
      payer: {
  name: cliente.nome,
  email: cliente.email,
  identification: {
    type: "CPF",
    number: cliente.cpf.replace(/\D/g, "")
  }
},
      external_reference: String(pedidoId),
      notification_url: notificationUrl,
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
 
    // 6. NOTIFICAÇÃO AO DONO (EM SEGUNDO PLANO)
    (async () => {
      try {
        const emailTransporter = nodemailer.createTransport({
          service: "gmail",
          auth: { 
            user: process.env.SMTP_USER || process.env.EMAIL_USER || "toffascoffee@gmail.com", 
            pass: process.env.SMTP_PASS || process.env.EMAIL_PASS 
          },
          family: 4,
        });
        const destinatario = process.env.RECIPIENT_EMAIL || process.env.SMTP_USER || process.env.EMAIL_USER || "toffascoffee@gmail.com";
        if (destinatario) {
          await emailTransporter.sendMail({
            from: `"Toffa's Coffee" <${process.env.SMTP_USER || process.env.EMAIL_USER || 'toffascoffee@gmail.com'}>`,
            to: destinatario,
            subject: `Novo pedido #${pedidoId} iniciado`,
            html: `<p>Um novo pedido de R$ ${total.toFixed(2)} foi iniciado no site.</p>`
          });
        }
      } catch (err) { console.error("❌ Erro e-mail background:", err.message); }
    })();
 
    return res.status(201).json({
      status: "ok",
      pedidoId,
      pagamento: { redirect_url: mpData.init_point }
    });
 
  } catch (error) {
    if (connection) await connection.rollback();
    console.error("❌ Erro ao criar pedido:", error.response?.data || error.message);
    return res.status(500).json({ error: error.message });
  } finally {
    if (connection) connection.release();
  }
}
