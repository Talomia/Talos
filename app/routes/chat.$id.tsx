import { json, type LoaderFunctionArgs } from '@remix-run/cloudflare';
import { default as IndexRoute } from './_index';

export async function loader(args: LoaderFunctionArgs) {
  const id = args.params.id;

  // Validate the chat ID parameter
  if (!id || typeof id !== 'string' || id.trim().length === 0) {
    throw new Response('Invalid chat ID', { status: 400 });
  }

  return json({ id });
}

export default IndexRoute;
