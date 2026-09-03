import nodemailer from "nodemailer";

// Configuração única do transportador (Gmail)
const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: {
    user: process.env.SMTP_USER || process.env.EMAIL_USER || "toffascoffee@gmail.com",
    pass: process.env.SMTP_PASS || process.env.EMAIL_PASS,
  },
});

// ============================================================
// 1. FLUXO DE PEDIDOS (PARA O CLIENTE)
// ============================================================

export async function enviarEmailConfirmacaoPedido(dados) {
  const { email, nome, pedidoId, itens, total } = dados;

  if (!email) {
    console.error("❌ Erro: E-mail do cliente não definido para o pedido #" + pedidoId);
    return;
  }

  const itensHtml = (itens || []).map(item => `
    <tr>
      <td style="padding:8px; border-bottom:1px solid #eee;">${item.nome_produto || 'Produto'}</td>
      <td style="padding:8px; border-bottom:1px solid #eee; text-align:center;">${item.quantidade || 1}</td>
      <td style="padding:8px; border-bottom:1px solid #eee; text-align:right;">R$ ${Number(item.preco || 0).toFixed(2)}</td>
    </tr>`).join("");

  const html = `
    <div style="font-family: Arial, sans-serif; max-width:600px; margin:0 auto; border:1px solid #ddd;">
      <div style="background:#000; color:#fff; padding:20px; text-align:center;">
        <h1 style="margin:0;">Toffa's Coffee</h1>
      </div>
      <div style="padding:20px;">
        <h2>Olá ${nome}, seu pagamento foi aprovado! ☕</h2>
        <p>Seu pedido <strong>#${pedidoId}</strong> já está sendo preparado.</p>
        <table style="width:100%; border-collapse:collapse; margin:20px 0;">
          <thead><tr style="background:#f8f8f8;"><th>Produto</th><th>Qtd</th><th>Preço</th></tr></thead>
          <tbody>${itensHtml}</tbody>
        </table>
        <p style="font-size:18px; text-align:right;"><strong>Total Pago: R$ ${Number(total || 0).toFixed(2)}</strong></p>
      </div>
    </div>`;

  try {
    await transporter.sendMail({
      from: `"Toffa's Coffee" <${process.env.SMTP_USER || process.env.EMAIL_USER || 'toffascoffee@gmail.com'}>`,
      to: email,
      subject: `Pedido #${pedidoId} Confirmado - Toffa's Coffee`,
      html
    });
    console.log(`✅ E-mail de confirmação enviado para o cliente: ${email}`);
  } catch (err) {
    console.error("❌ Erro ao enviar e-mail de confirmação ao cliente:", err.message);
  }
}

export async function enviarEmailRastreio(email, nome, codigo, link) {
  try {
    await transporter.sendMail({
      from: `"Toffa's Coffee" <${process.env.SMTP_USER || process.env.EMAIL_USER || 'toffascoffee@gmail.com'}>`,
      to: email,
      subject: "Seu café está a caminho! 🚚",
      html: `<p>Olá ${nome}, seu código de rastreio é: <strong>${codigo}</strong>. <a href="${link}">Rastrear</a></p>`
    });
    console.log(`✅ E-mail de rastreio enviado para: ${email}`);
  } catch (err) {
    console.error("❌ Erro ao enviar e-mail de rastreio:", err.message);
  }
}

// ============================================================
// 2. FLUXO DE ALUGUEL (PARA O DONO DA LOJA)
// ============================================================

export async function enviarEmailAluguel(dados) {
  const { nome, empresa, telefone, email, mensagem, tipo } = dados;
  
  // GARANTIA: Se a variável falhar, envia para o seu e-mail principal
  const destinatario = process.env.RECIPIENT_EMAIL || process.env.SMTP_USER || process.env.EMAIL_USER || "toffascoffee@gmail.com";

  const html = `
    <div style="font-family: Arial; padding:20px; border:1px solid #eee;">
      <h2 style="color:#d35400;">Novo Pedido de Orçamento: ${tipo || 'Aluguel de Máquina'}</h2>
      <p><strong>Nome:</strong> ${nome}</p>
      <p><strong>Empresa:</strong> ${empresa || 'Não informada'}</p>
      <p><strong>Telefone:</strong> ${telefone}</p>
      <p><strong>E-mail do Cliente:</strong> ${email}</p>
      <p><strong>Mensagem:</strong>  
${mensagem || 'Sem mensagem'}</p>
    </div>`;

  try {
    await transporter.sendMail({
      from: `"Site Toffa's" <${process.env.SMTP_USER || process.env.EMAIL_USER || 'toffascoffee@gmail.com'}>`,
      to: destinatario,
      subject: `SOLICITAÇÃO DE ALUGUEL - ${nome}`,
      html
    });
    console.log(`✅ Notificação de aluguel enviada para o dono: ${destinatario}`);
  } catch (err) {
    console.error("❌ Erro ao enviar e-mail de aluguel:", err.message);
    throw err;
  }
}
