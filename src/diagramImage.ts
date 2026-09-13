/** 将图表矢量内容栅格化，图片自身包含背景和留白。 */
export async function diagramPng(svg: string): Promise<string> {
    const document = new DOMParser().parseFromString(svg, 'image/svg+xml');
    const element = document.documentElement;
    const box = element.getAttribute('viewBox')?.trim().split(/[ ,]+/).map(Number);
    if (!box || box.length !== 4 || !box.every(Number.isFinite) || box[2] <= 0 || box[3] <= 0) throw new Error('图表尺寸无效');
    const scale = Math.min(2, 4096 / Math.max(box[2] + 48, box[3] + 48));
    element.setAttribute('width', String(box[2]));
    element.setAttribute('height', String(box[3]));
    element.style.maxWidth = 'none';
    const source = URL.createObjectURL(new Blob([new XMLSerializer().serializeToString(element)], { type: 'image/svg+xml' }));
    try {
        const image = new Image();
        image.src = source;
        await image.decode();
        const canvas = window.document.createElement('canvas');
        canvas.width = Math.ceil((box[2] + 48) * scale);
        canvas.height = Math.ceil((box[3] + 48) * scale);
        const ctx = canvas.getContext('2d');
        if (!ctx) throw new Error('无法生成图片');
        ctx.fillStyle = '#202020';
        ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(image, 24 * scale, 24 * scale, box[2] * scale, box[3] * scale);
        return canvas.toDataURL('image/png');
    } finally { URL.revokeObjectURL(source); }
}

/** 看图页只包含自有样式和 PNG，不携带原始模型文本或脚本。 */
export function diagramViewer(png: string): string {
    if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(png)) throw new Error('无效图片');
    return URL.createObjectURL(new Blob([`<!doctype html><html lang="zh-CN"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>流程图 · Paws</title>
<style>
*{box-sizing:border-box}body{margin:0;background:#121110;color:#eee7dd;font-family:'PingFang SC',sans-serif}header{height:64px;display:flex;align-items:center;gap:12px;padding:0 28px;border-bottom:1px solid #ffffff14}strong{margin-right:auto;font-size:15px}a,label{color:#eac8a0;text-decoration:none;font-size:13px;padding:8px 14px;border:1px solid #ffffff25;border-radius:8px;cursor:pointer}a:hover,label:hover{background:#ffffff10}input{position:absolute;opacity:0}input:focus-visible~header label{outline:2px solid #eac8a0}main{height:calc(100vh - 64px);overflow:auto;display:flex;padding:24px;background:radial-gradient(ellipse at center,#29241f,#121110 75%)}img{display:block;margin:auto;max-width:100%;max-height:100%;object-fit:contain;border-radius:12px;box-shadow:0 16px 64px #0006}#size:checked~main{display:block}#size:checked~main img{max-width:none;max-height:none}#size:checked~header label{background:#59422d}
</style><input type="checkbox" id="size"><header><strong>流程图</strong><label for="size">原始尺寸</label><a href="${png}" download="paws-diagram.png">下载 PNG</a></header><main><img src="${png}" alt="流程图原图"></main></html>`], { type: 'text/html' }));
}
