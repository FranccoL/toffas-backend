import pool from "../config/db.js";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
dotenv.config();

const login = async (req, res) => {
  try {
    const { email, senha } = req.body;
    if (!email || !senha)
      return res.status(400).json({ error: "Email e senha obrigatórios" });

    // MySQL usa array destructuring
    const [rows] = await pool.query(
      "SELECT * FROM admin_users WHERE email = ?",
      [email]
    );

    if (rows.length === 0) {
      return res.status(401).json({ error: "Usuário não encontrado" });
    }

    const user = rows[0];

    const senhaValida = await bcrypt.compare(senha, user.senha);
    if (!senhaValida) {
      return res.status(401).json({ error: "Senha incorreta" });
    }

    const token = jwt.sign(
      { id: user.id, email: user.email, nome: user.nome },
      process.env.ADMIN_SECRET,
      { expiresIn: "24m" }
    );

    res.json({ token, nome: user.nome, email: user.email });
  } catch (err) {
    console.error("Erro login admin:", err);
    res.status(500).json({ error: "Erro no servidor" });
  }
};

export default { login };
