import pool from "../config/db.js";

// Criar produto
export async function criarProduto(req, res) {
  const { nome, descricao, preco, estoque, categoria_id, gs1 } = req.body;

  if (!nome || !preco) {
    return res.status(400).json({ error: "Nome e preço são obrigatórios" });
  }

  try {
    const [result] = await pool.query(
      `INSERT INTO produtos 
      (nome, descricao, preco, estoque, categoria_id, gs1) 
      VALUES (?,?,?,?,?,?)`,
      [nome, descricao, preco, estoque || 0, categoria_id || null, gs1 || null]
    );

    res.status(201).json({
      status: "criado",
      produtoId: result.insertId
    });

  } catch (err) {
    console.error("Erro ao criar produto:", err);
    res.status(500).json({ error: "Erro ao criar produto" });
  }
}

// Listar todos produtos
export async function listarProdutos(req, res) {
  try {
    const [rows] = await pool.query(
      `SELECT p.*, c.nome AS categoria_nome
       FROM produtos p
       LEFT JOIN categorias c ON p.categoria_id = c.id
       ORDER BY p.criado_em DESC`
    );

    res.json(rows);
  } catch (err) {
    console.error("Erro ao listar produtos:", err);
    res.status(500).json({ error: "Erro ao listar produtos" });
  }
}
