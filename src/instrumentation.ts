/** Next.js boot hook: starts the inline worker when configured (see src/worker/inline.ts). */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startInlineWorker } = await import("./worker/inline");
  await startInlineWorker();
}
