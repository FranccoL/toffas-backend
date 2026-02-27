import pool from "../config/db.js";

// Criar cliente
export async function criarCliente(req, res) {
  const {
    nome,
    email,
    telefone,
    cep,
    endereco,
    numero,
    bairro,
    cidade,
    estado
  } = req.body;

  if (!nome || !email) {
    return res.status(400).json({ error: "Nome e email são obrigatórios" });
  }

  try {
    // Verificar se o email já existe
    const [existe] = await pool.query(
      "SELECT id FROM clientes WHERE email = ?",
      [email]
    );

    if (existe.length > 0) {
      return res.status(200).json({
        status: "existe",
        clienteId: existe[0].id
      });
    }

    // Inserir cliente
    const [result] = await pool.query(
      `INSERT INTO clientes
       (nome, email, telefone, cep, endereco, numero, bairro, cidade, estado)
       VALUES (?,?,?,?,?,?,?,?,?)`,
      [nome, email, telefone, cep, endereco, numero, bairro, cidade, estado]
    );

    return res.status(201).json({
      status: "criado",
      clienteId: result.insertId
    });

  } catch (error) {
    console.error("Erro ao criar cliente:", error);
    res.status(500).json({ error: "Erro ao criar cliente" });
  }
};

// Buscar cliente por email
export async function buscarClientePorEmail(req, res) {
  const { email } = req.params;

  try {
    const [rows] = await pool.query(
      "SELECT id, nome, email, telefone, criado_em FROM clientes WHERE email = ? LIMIT 1",
      [email]
    );

    if (rows.length === 0) {
      return res.status(404).json({ error: "Cliente não encontrado" });
    }

    return res.json(rows[0]);

  } catch (error) {
    console.error("Erro ao buscar cliente:", error);
    res.status(500).json({ error: "Erro ao buscar cliente" });
  }
};
