// Habilita los tipos canary de React para View Transitions (`ViewTransition`,
// `addTransitionType`). El App Router de Next.js empaqueta un build de React que
// los exporta en runtime; esta referencia los hace visibles para TypeScript.
// Va emparejado con `experimental.viewTransition` en next.config.ts.
/// <reference types="react/canary" />
