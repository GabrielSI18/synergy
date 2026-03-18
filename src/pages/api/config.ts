import type { APIRoute } from 'astro';

export const GET: APIRoute = async ({ locals }) => {
  const runtime = (locals as any).runtime;
  const publicKey = runtime?.env?.BESTFY_PUBLIC_KEY ?? '';

  return new Response(
    JSON.stringify({
      publicKey,
      testMode: runtime?.env?.NODE_ENV !== 'production',
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
};
