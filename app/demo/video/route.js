import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(req) {
  try {
    const videoPath = path.join(process.cwd(), 'public', 'assets', 'promeo_product_promo.mp4');
    if (!fs.existsSync(videoPath)) {
      return new Response('Video not found', { status: 404 });
    }

    const stat = fs.statSync(videoPath);
    const fileSize = stat.size;
    const range = req.headers.get('range');

    const url = new URL(req.url);
    const isDownload = url.searchParams.get('download') === '1' || url.searchParams.has('download');

    if (range && !isDownload) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
      const chunksize = end - start + 1;
      const file = fs.createReadStream(videoPath, { start, end });

      return new Response(file, {
        status: 206,
        headers: {
          'Content-Range': `bytes ${start}-${end}/${fileSize}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': String(chunksize),
          'Content-Type': 'video/mp4',
        },
      });
    } else {
      const file = fs.createReadStream(videoPath);
      const headers = {
        'Content-Length': String(fileSize),
        'Content-Type': 'video/mp4',
        'Accept-Ranges': 'bytes',
      };
      if (isDownload) {
        headers['Content-Disposition'] = 'attachment; filename="ProMeo_Product_Promo.mp4"';
      }
      return new Response(file, {
        status: 200,
        headers,
      });
    }
  } catch (err) {
    return new Response('Video stream error: ' + err.message, { status: 500 });
  }
}
