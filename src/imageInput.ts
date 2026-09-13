export type DraftImage = { id: string; name: string; mimeType: string; bytes: Uint8Array; width: number; height: number; previewUrl: string };

export async function readDraftImage(file: File): Promise<DraftImage> {
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) throw new Error('仅支持 PNG、JPEG、WebP 图片');
    if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('每张图片须小于 10 MB，且不能为空');
    const previewUrl = URL.createObjectURL(file);
    try {
        const image = new Image(); image.src = previewUrl; await image.decode();
        if (!image.naturalWidth || !image.naturalHeight || image.naturalWidth * image.naturalHeight > 40_000_000) throw new Error('图片尺寸过大，最多支持 4000 万像素');
        return { id: crypto.randomUUID(), name: file.name || '截图.png', mimeType: file.type, bytes: new Uint8Array(await file.arrayBuffer()), width: image.naturalWidth, height: image.naturalHeight, previewUrl };
    } catch (error) { URL.revokeObjectURL(previewUrl); throw error; }
}
