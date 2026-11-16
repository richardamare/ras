import * as ValidateEnv from "@julr/vite-plugin-validate-env"
import * as Zod from "zod"
import * as Environment from "./src/lib/environment.ts"

export default ValidateEnv.defineConfig({
  validator: "standard",
  schema: {
    VITE_ENVIRONMENT: Zod.enum(Environment.environments)
  }
})
