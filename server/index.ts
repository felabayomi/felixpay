import app, { server } from "./app.js";
import { log } from "./runtime.js";

const port = Number.parseInt(process.env.PORT || "5000", 10);
server.listen(port, "0.0.0.0", () => log(`serving on port ${port}`));

export default app;
