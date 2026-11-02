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
      btc: '0x7b7C000000000000000000000000000000000000',
      priceFeed: '0x86bCF0841622a5dAC14A313a15f96A95421b9366',
      veBTC: '0xB63fcCd03521Cf21907627bd7fA465C129479231',
      poolsVoter: '0x72F8dd7F44fFa19E45955aa20A5486E8EB255738',
      feeDistributor: '0x10B0E7b3411F4A38ca2F6BB697aA28D607924729',
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
