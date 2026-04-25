import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import servicesRouter from "./services";
import countriesRouter from "./countries";
import numbersRouter from "./numbers";
import walletRouter from "./wallet";
import dashboardRouter from "./dashboard";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(servicesRouter);
router.use(countriesRouter);
router.use(numbersRouter);
router.use(walletRouter);
router.use(dashboardRouter);

export default router;
