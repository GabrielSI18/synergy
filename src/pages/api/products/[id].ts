import type { APIRoute } from 'astro';
import productsData from '../../../data/products.json';

export const GET: APIRoute = async ({ params }) => {
  const productId = parseInt(params.id ?? '', 10);

  if (isNaN(productId)) {
    return new Response(
      JSON.stringify({ error: 'ID de produto inválido' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const product = productsData.products.find((p: any) => p.id === productId);
  if (!product) {
    return new Response(
      JSON.stringify({ error: 'Produto não encontrado' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  return new Response(
    JSON.stringify({
      id: product.id,
      title: product.title,
      price: product.price,
      comparePrice: product.comparePrice,
      images: product.images,
      hasVariants: product.hasVariants,
      variants: (product.variants || []).map((v: any) => ({
        id: v.id,
        title: v.title,
        option1: v.option1,
        option2: v.option2,
        price: v.price,
        comparePrice: v.comparePrice,
      })),
      option1Name: product.option1Name,
      option2Name: product.option2Name,
    }),
    { headers: { 'Content-Type': 'application/json' } }
  );
};
