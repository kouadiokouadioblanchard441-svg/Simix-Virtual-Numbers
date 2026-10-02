import { register } from "node:module";

// Orval still imports js-yaml's removed default export. Keep the secured
// dependency and adapt only Orval's import, without changing installed files.
register("./orval-yaml-loader.mjs", import.meta.url);
