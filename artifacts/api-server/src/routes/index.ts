import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import googleAuthRouter from "./google-auth";
import servicesRouter from "./services";
import countriesRouter from "./countries";
import numbersRouter from "./numbers";
import walletRouter from "./wallet";
import dashboardRouter from "./dashboard";
import adminRouter from "./admin";
import adminSupportRouter from "./admin-support";
import adminAuthRouter from "./admin-auth";
import configRouter from "./config";
import footerRouter from "./footer";
import supportRouter from "./support";

const router: IRouter = Router();

router.use(healthRouter);
router.use(configRouter);
router.use(authRouter);
router.use(googleAuthRouter);
router.use(servicesRouter);
router.use(countriesRouter);
router.use(numbersRouter);
router.use(walletRouter);
router.use(dashboardRouter);
router.use(adminAuthRouter);
router.use(footerRouter);
router.use(supportRouter);
router.use(adminRouter);
router.use(adminSupportRouter);

export default router;
