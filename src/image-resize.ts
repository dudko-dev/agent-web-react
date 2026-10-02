/**
 * Downscale an image in the browser before it goes to a model. Providers bill
 * images by their pixel size and resize anything over ~1.15 MP / 1568 px on
 * the long edge themselves — sending more only costs upload time and, for
 * some providers, tokens. GIF and SVG are left as they are.
 */
export interface DownscaleOptions {
  /** Longest edge in pixels (default 1568). */
  maxDimension?: number
  /** Total pixels (default 1 150 000). */
  maxPixels?: number
  /** JPEG/WebP quality 0..1 (default 0.9). */
  quality?: number
}

type AnyCanvas = OffscreenCanvas | HTMLCanvasElement

const canvasOf = (w: number, h: number): AnyCanvas | undefined => {
  if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(w, h)
  if (typeof document !== 'undefined') {
    const c = document.createElement('canvas')
    c.width = w
    c.height = h
    return c
  }
  return undefined
}

const toBlob = (canvas: AnyCanvas, type: string, quality: number): Promise<Blob | null> =>
  'convertToBlob' in canvas
    ? canvas.convertToBlob({ type, quality })
    : new Promise((resolve) => canvas.toBlob(resolve, type, quality))

/** The image, smaller when it is larger than the limits; the original otherwise. */
export const downscaleImage = async (file: Blob, opts: DownscaleOptions = {}): Promise<Blob> => {
  const maxDimension = opts.maxDimension ?? 1568
  const maxPixels = opts.maxPixels ?? 1_150_000
  if (
    typeof createImageBitmap !== 'function' ||
    !file.type.startsWith('image/') ||
    file.type === 'image/gif' ||
    file.type === 'image/svg+xml'
  ) {
    return file
  }
  let bitmap: ImageBitmap
  try {
    bitmap = await createImageBitmap(file)
  } catch {
    return file // a format the browser can't decode: send it as it is
  }
  const { width, height } = bitmap
  const scale = Math.min(
    1,
    maxDimension / Math.max(width, height),
    Math.sqrt(maxPixels / Math.max(1, width * height)),
  )
  if (scale >= 1) {
    bitmap.close()
    return file
  }
  const w = Math.max(1, Math.round(width * scale))
  const h = Math.max(1, Math.round(height * scale))
  const canvas = canvasOf(w, h)
  const ctx = canvas?.getContext('2d') as
    OffscreenCanvasRenderingContext2D | CanvasRenderingContext2D | null | undefined
  if (!canvas || !ctx) {
    bitmap.close()
    return file
  }
  ctx.drawImage(bitmap, 0, 0, w, h)
  bitmap.close()
  // Screenshots (PNG) stay lossless so text stays readable; photos go to JPEG.
  const type = file.type === 'image/png' || file.type === 'image/webp' ? file.type : 'image/jpeg'
  const out = await toBlob(canvas, type, opts.quality ?? 0.9)
  return out && out.size < file.size ? out : file
}
