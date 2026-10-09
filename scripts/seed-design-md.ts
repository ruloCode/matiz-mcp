// pnpm seed:design-md — indexa DESIGN.md con licencia MIT (ver src/design-docs.ts)
import { seedDesignDocs } from "../src/design-docs.js";
console.log(`${seedDesignDocs((m) => console.log(m))} DESIGN.md indexados`);
