import nodemailer from "nodemailer";

// Configuração única do transportador (Gmail)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_USER || process.env.EMAIL_USER,
    pass: process.env.SMTP_PASS || process.env.EMAIL_PASS,
  },
});

// ============================================================
// 1. FLUXO DE PEDIDOS (PARA O CLIENTE)
// ============================================================

// Envia confirmação de pagamento para o CLIENTE
export async function enviarEmailConfirmacaoPedido(dados) {
  const { email, nome, pedidoId, itens, total } = dados;

  const itensHtml = itens.map(item => `
    <tr>
      <td style="padding:8px; border-bottom:1px solid #eee;">${item.nome_produto}</td>
      <td style="padding:8px; border-bottom:1px solid #eee; text-align:center;">${item.quantidade}</td>
      <td style="padding:8px; border-bottom:1px solid #eee; text-align:right;">R$ ${Number(item.preco).toFixed(2)}</td>
    </tr>`).join("");

  const html = `
    <div style="font-family: Arial, sans-serif; max-width:600px; margin:0 auto; border:1px solid #ddd;">
      <div style="background:#000; color:#fff; padding:20px; text-align:center;">
        <h1 style="margin:0;">Toffa's Coffee</h1>
      </div>
      <div style="padding:20px;">
        <h2>Olá ${nome}, seu pagamento foi aprovado! ☕</h2>
        <p>Estamos muito felizes com sua compra. Seu pedido <strong>#${pedidoId}</strong> já está sendo preparado.</p>
        <table style="width:100%; border-collapse:collapse; margin:20px 0;">
          <thead><tr style="background:#f8f8f8;"><th>Produto</th><th>Qtd</th><th>Preço</th></tr></thead>
          <tbody>${itensHtml}</tbody>
        </table>
        <p style="font-size:18px; text-align:right;"><strong>Total Pago: R$ ${Number(total).toFixed(2)}</strong></p>
        <p>Assim que o pedido for enviado, você receberá outro e-mail com o código de rastreio.</p>
      </div>
    </div>`;

  try {
    await transporter.sendMail({
      from: `"Toffa's Coffee" <${process.env.SMTP_USER || process.env.EMAIL_USER}>`,
      to: email,
      subject: `Pedido #${pedidoId} Confirmado - Toffa's Coffee`,
      html
    });
    console.log(`✅ E-mail de confirmação enviado para o cliente: ${email}`);
  } catch (err) {
    console.error("❌ Erro ao enviar e-mail de confirmação ao cliente:", err);
  }
}

// Envia código de rastreio para o CLIENTE
export async function enviarEmailRastreio(email, nome, codigo, link) {
  try {
    await transporter.sendMail({
      from: `"Toffa's Coffee" <${process.env.SMTP_USER || process.env.EMAIL_USER}>`,
      to: email,
      subject: "Seu café está a caminho! 🚚",
      html: `
        <div style="font-family: Arial; padding:20px;">
          <h2>Olá ${nome}, boas notícias!</h2>
          <p>Seu pedido foi postado e o código de rastreio é: <strong>${codigo}</strong></p>
          <p><a href="${link}" style="background:#000; color:#fff; padding:10px 20px; text-decoration:none; border-radius:5px;">Rastrear meu Pedido</a></p>
        </div>`
    });
    console.log(`✅ E-mail de rastreio enviado para: ${email}`);
  } catch (err) {
    console.error("❌ Erro ao enviar e-mail de rastreio:", err);
  }
}

// ============================================================
// 2. FLUXO DE ALUGUEL (PARA O DONO DA LOJA)
// ============================================================

// Envia os dados do formulário de aluguel para o DONO (você)
export async function enviarEmailAluguel(dados) {
  const { nome, empresa, telefone, email, mensagem, tipo } = dados;
  const destinatario = process.env.RECIPIENT_EMAIL || process.env.SMTP_USER || process.env.EMAIL_USER;

  const html = `
    <div style="font-family: Arial; padding:20px; border:1px solid #eee;">
      <h2 style="color:#d35400;">Novo Pedido de Orçamento: ${tipo}</h2>
      <p><strong>Nome:</strong> ${nome}</p>
      <p><strong>Empresa:</strong> ${empresa || 'Não informada'}</p>
      <p><strong>Telefone:</strong> ${telefone}</p>
      <p><strong>E-mail do Cliente:</strong> ${email}</p>
      <p><strong>Mensagem:</strong>  
${mensagem}</p>
    </div>`;

  try {
    await transporter.sendMail({
      from: `"Site Toffa's" <${process.env.SMTP_USER || process.env.EMAIL_USER}>`,
      to: destinatario,
      subject: `SOLICITAÇÃO DE ALUGUEL - ${nome}`,
      html
    });
    console.log(`✅ Notificação de aluguel enviada para o dono: ${destinatario}`);
  } catch (err) {
    console.error("❌ Erro ao enviar e-mail de aluguel:", err);
    throw err;
  }
}
