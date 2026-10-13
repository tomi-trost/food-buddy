import type { ReaderOptions } from 'zxing-wasm/reader'

/** Barcode decoding with zxing-wasm, loaded on first use (~1 MB wasm, served by us, not a CDN). */
type Reader = typeof import('zxing-wasm/reader')

const OPTIONS: ReaderOptions = { formats: ['EAN13', 'EAN8', 'UPCA', 'UPCE'], tryHarder: true, maxNumberOfSymbols: 1 }

let reader: Promise<Reader> | null = null

function load(): Promise<Reader> {
  reader ??= Promise.all([import('zxing-wasm/reader'), import('zxing-wasm/reader/zxing_reader.wasm?url')]).then(
    ([zxing, wasm]) => {
      zxing.prepareZXingModule({
        overrides: { locateFile: (path: string, prefix: string) => (path.endsWith('.wasm') ? wasm.default : prefix + path) },
      })
      return zxing
    },
  )
  reader.catch(() => (reader = null)) // offline on first use: try again next time
  return reader
}

/** The product barcode in a photo or video frame, or null. */
export async function readBarcode(input: Blob | ImageData): Promise<string | null> {
  const results = await (await load()).readBarcodes(input, OPTIONS)
  return results.find((r) => r.isValid)?.text ?? null
}
