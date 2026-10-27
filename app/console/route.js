import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const filePath = path.join(process.cwd(), 'public', 'console', 'index.html');
    const html = fs.readFileSync(filePath, 'utf8');
    return new Response(html, {
      status: 200,
      headers: {
        'content-type': 'text/html; charset=utf-8',
        'cache-control': 'no-cache, no-store, must-revalidate',
      },
    });
  } catch (err) {
    return new Response('Console template not found: ' + err.message, { status: 500 });
  }
}
