// app/api/submit/route.ts
// Next.js App Router (Node.js Runtime) - Discord Webhook proxy

export const runtime = 'nodejs'; // Edge 대신 nodejs 런타임 사용 (FormData 안정적)

// Discord 제한: 파일 총합 25MB
const MAX_TOTAL_BYTES = 25 * 1024 * 1024;

function corsHeaders(req: Request) {
  const origin = req.headers.get("origin") ?? "*";
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST,OPTIONS",
    "access-control-allow-headers": "content-type",
  };
}

function json(body: unknown, status = 200, req?: Request) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "content-type": "application/json",
      ...(req ? corsHeaders(req) : {}),
    },
  });
}

export async function OPTIONS(req: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(req) });
}

export async function POST(req: Request) {
  const WEBHOOK = process.env.DISCORD_WEBHOOK_URL;
  if (!WEBHOOK) {
    return json({ ok: false, error: "Missing DISCORD_WEBHOOK_URL" }, 500, req);
  }

  const inForm = await req.formData();
  const outForm = new FormData();

  // payload_json 처리 (문자열만 허용)
  const payload = inForm.get("payload_json");
  if (!payload) {
    return json({ ok: false, error: "payload_json missing" }, 400, req);
  }
  if (payload instanceof File) {
    outForm.set("payload_json", await payload.text());
  } else {
    outForm.set("payload_json", String(payload));
  }

  // files[*] 전달
  const fileKeys = Array.from(inForm.keys())
    .filter((k) => /^files\[\d+\]$/.test(k))
    .sort((a, b) => {
      const na = parseInt(a.match(/\[(\d+)\]/)![1], 10);
      const nb = parseInt(b.match(/\[(\d+)\]/)![1], 10);
      return na - nb;
    });

  let total = 0;
  for (const key of fileKeys) {
    const f = inForm.get(key);
    if (f instanceof File) {
      total += f.size;
      if (total > MAX_TOTAL_BYTES) {
        return json({ ok: false, error: "Attachments too large (>25MB)" }, 413, req);
      }
      outForm.append(key, f, f.name || "upload.png");
    }
  }

  try {
    const r = await fetch(WEBHOOK, { method: "POST", body: outForm });
    const txt = await r.text().catch(() => "");
    if (!r.ok) {
      return new Response(`Discord webhook error: ${r.status}\n${txt}`, {
        status: r.status,
        headers: corsHeaders(req),
      });
    }
    return json({ ok: true }, 200, req);
  } catch (err: any) {
    return json({ ok: false, error: err.message || "Webhook request failed" }, 500, req);
  }
}
