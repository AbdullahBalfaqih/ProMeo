export const dynamic = 'force-dynamic';

export async function GET() {
  return Response.json({
    ok: true,
    status: 'ok',
    version: '1.0.0',
    time: new Date().toISOString(),
    chain: {
      chainId: 31611,
      name: 'Mezo Testnet',
      escrow: '0x88EDbF3E966Ba23F0262771CBCF6d217718BD048',
      registry: '0x957dbD62B6aF0C13C94D07814B06323d53198ccC',
      musd: '0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503',
    },
  });
}

export async function POST() {
  return Response.json({
    ok: true,
    received: true,
    time: new Date().toISOString(),
  });
}
