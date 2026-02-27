import { Router } from "express";
import adminController from "../controllers/adminController.js";
import { dashboardAdmin } from "../controllers/adminDashboardController.js";
import autenticarAdmin from "../middlewares/authAdmin.js";

const router = Router();

// Login do admin
router.post("/login", adminController.login);

// Dashboard do admin (rota protegida)
router.get("/dashboard", autenticarAdmin, dashboardAdmin);

export default router;
